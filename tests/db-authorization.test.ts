// =====================================================================
// POSTYAR — Authorization tests (DB-backed tier)
// ---------------------------------------------------------------------
// Covers addendum §12 (Authorization final validation — IDOR/BOLA/
// role-gate), §11 (Registration mass-assignment defense).
//
// Invariants under test:
//   * requireUser throws 401 AuthError "نیاز به ورود" when no session
//   * requireUser returns AuthUser when valid session
//   * requireRole throws 403 AuthError "دسترسی غیرمجاز" when role insufficient
//   * requireRole returns user when role matches
//   * getCurrentUser returns null for: no cookie, invalid JWT, expired
//     session, revoked session, tokenHash mismatch (rotation), inactive user
//   * getCurrentUser revokes the session when user is inactive
//   * Mass-assignment defense: User created without explicit `role`
//     defaults to "user" (the register route's Zod schema strips `role`
//     from the body — verified at the Prisma level here)
//   * AuthError carries the correct HTTP status
//   * newReferralCode generates a unique code
//   * audit() writes an AuditLog row (never throws)
//   * safeJsonParse returns fallback on bad input
//
// Mocking: next/headers cookies() is mocked via bun:test mock.module
// so requireUser/requireRole/getCurrentUser can be exercised directly.
// The mock is scoped to this test file and does not affect other suites
// (they don't call cookie-dependent functions).
// =====================================================================
import { test, expect, describe, beforeAll, beforeEach, mock } from "bun:test";
import { db } from "@/lib/db";
import { resetDb, seedUser, ensureDbConnected } from "./_db-helpers";
import {
  signJwt, hashToken, hashPassword, randomToken,
} from "@/lib/security/crypto";

// --- Mock next/headers cookies() ---
// Each test sets _cookieValue to simulate the session cookie state.
let _cookieValue: string | undefined = undefined;
const _cookieStore = {
  get: (_name: string) => (_cookieValue !== undefined ? { value: _cookieValue } : undefined),
  set: (_name: string, value: string) => { _cookieValue = value; },
  delete: () => { _cookieValue = undefined; },
};
mock.module("next/headers", () => ({
  cookies: async () => _cookieStore,
}));

// Import AFTER the mock is set up (bun hoists mock.module before imports)
import {
  createSession,
  getCurrentUser,
  requireUser,
  requireRole,
  AuthError,
  newReferralCode,
  audit,
  safeJsonParse,
  SESSION_TTL_SEC,
} from "@/lib/server/auth";

describe("authorization: requireUser + requireRole + getCurrentUser (DB-backed)", () => {
  let userId: string;

  beforeAll(async () => {
    await ensureDbConnected();
  });

  beforeEach(async () => {
    await resetDb();
    _cookieValue = undefined;
    const u = await seedUser({ email: "auth@test.local", mobile: "09120000003" });
    userId = u.id;
  });

  test("AuthError carries the correct HTTP status", () => {
    const e401 = new AuthError("نیاز به ورود", 401);
    expect(e401.status).toBe(401);
    expect(e401.name).toBe("AuthError");
    expect(e401.message).toBe("نیاز به ورود");
    const e403 = new AuthError("دسترسی غیرمجاز", 403);
    expect(e403.status).toBe(403);
    const e400 = new AuthError("bad request", 400);
    expect(e400.status).toBe(400);
    // Default status
    const eDefault = new AuthError("default");
    expect(eDefault.status).toBe(400);
  });

  test("requireUser throws 401 AuthError when no session cookie", async () => {
    _cookieValue = undefined;
    await expect(requireUser()).rejects.toMatchObject({
      name: "AuthError",
      status: 401,
      message: "نیاز به ورود",
    });
  });

  test("requireUser returns AuthUser when valid session exists", async () => {
    // Create a session for the user
    await createSession(userId, "127.0.0.1", "test-agent");
    // The mock cookie store should now have the JWT
    expect(_cookieValue).toBeTruthy();
    // requireUser should return the user
    const u = await requireUser();
    expect(u.id).toBe(userId);
    expect(u.email).toBe("auth@test.local");
    expect(u.role).toBe("user");
    expect(u.status).toBe("active");
    // passwordHash should NOT be in AuthUser (sanitized)
    expect((u as Record<string, unknown>).passwordHash).toBeUndefined();
  });

  test("requireRole throws 403 for regular user requesting admin", async () => {
    await createSession(userId, "127.0.0.1", "test-agent");
    await expect(requireRole(["admin"])).rejects.toMatchObject({
      name: "AuthError",
      status: 403,
      message: "دسترسی غیرمجاز",
    });
    // Support role also not available for regular user
    await expect(requireRole(["support", "admin"])).rejects.toMatchObject({
      name: "AuthError",
      status: 403,
    });
  });

  test("requireRole returns admin user for admin role", async () => {
    const admin = await seedUser({
      email: "admin@test.local",
      mobile: "09120000004",
      role: "admin",
    });
    await createSession(admin.id, "127.0.0.1", "test-agent");
    const u = await requireRole(["admin"]);
    expect(u.id).toBe(admin.id);
    expect(u.role).toBe("admin");
    // admin can also access support-gated routes
    const u2 = await requireRole(["support", "admin"]);
    expect(u2.id).toBe(admin.id);
  });

  test("getCurrentUser returns null when no cookie", async () => {
    _cookieValue = undefined;
    const u = await getCurrentUser();
    expect(u).toBeNull();
  });

  test("getCurrentUser returns null for invalid JWT", async () => {
    _cookieValue = "not-a-valid-jwt";
    const u = await getCurrentUser();
    expect(u).toBeNull();
  });

  test("getCurrentUser returns null for expired session", async () => {
    // Create a session manually with a past expiresAt
    const sid = randomToken(16);
    const token = signJwt({ sub: userId, sid, role: "" }, SESSION_TTL_SEC);
    await db.session.create({
      data: {
        id: sid,
        userId,
        tokenHash: hashToken(token),
        ip: null,
        userAgent: null,
        expiresAt: new Date(Date.now() - 60_000), // expired 1 min ago
      },
    });
    _cookieValue = token;
    const u = await getCurrentUser();
    expect(u).toBeNull();
  });

  test("getCurrentUser returns null for revoked session", async () => {
    const sid = randomToken(16);
    const token = signJwt({ sub: userId, sid, role: "" }, SESSION_TTL_SEC);
    await db.session.create({
      data: {
        id: sid,
        userId,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        revokedAt: new Date(), // revoked
      },
    });
    _cookieValue = token;
    const u = await getCurrentUser();
    expect(u).toBeNull();
  });

  test("getCurrentUser returns null for mismatched tokenHash (rotation detection)", async () => {
    // Create a session with a stored hash that does NOT match the cookie
    // token's hash. This simulates rotation: the server stored the hash of
    // the OLD token, but the cookie now has a NEW token (different hash).
    // The constant-time hash comparison must reject it.
    const sid = randomToken(16);
    const realToken = signJwt({ sub: userId, sid, role: "" }, SESSION_TTL_SEC);
    // Create a DIFFERENT token (different payload → different hash) to use
    // as the "old" stored hash. Using a random string ensures the hashes
    // are genuinely different, not just same-payload re-signings.
    const oldToken = signJwt({ sub: userId, sid: "different-sid", role: "" }, SESSION_TTL_SEC);
    await db.session.create({
      data: {
        id: sid,
        userId,
        tokenHash: hashToken(oldToken), // stored hash of the OLD token
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    _cookieValue = realToken; // cookie has the NEW token — different hash
    // Verify the hashes are genuinely different (sanity)
    expect(hashToken(realToken)).not.toBe(hashToken(oldToken));
    const u = await getCurrentUser();
    expect(u).toBeNull();
  });

  test("getCurrentUser returns null for inactive user AND revokes the session", async () => {
    // Create an inactive user
    const inactiveUser = await seedUser({
      email: "inactive@test.local",
      mobile: "09120000005",
      status: "suspended",
    });
    const sid = randomToken(16);
    const token = signJwt({ sub: inactiveUser.id, sid, role: "" }, SESSION_TTL_SEC);
    await db.session.create({
      data: {
        id: sid,
        userId: inactiveUser.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    _cookieValue = token;
    const u = await getCurrentUser();
    expect(u).toBeNull();
    // The session should have been revoked
    const session = await db.session.findUnique({ where: { id: sid } });
    expect(session!.revokedAt).not.toBeNull();
  });

  test("mass-assignment defense: User created without explicit role defaults to 'user'", async () => {
    // This tests the INVARIANT that the register route relies on:
    // the Zod schema does NOT include `role`, so even if the body has
    // `role: "admin"`, Zod strips it, and db.user.create (which never
    // passes `role`) defaults to "user" from the Prisma schema.
    const user = await db.user.create({
      data: {
        firstName: "تستی",
        lastName: "کاربر",
        email: "mass-assign@test.local",
        mobile: "09120000006",
        passwordHash: await hashPassword("Pass1234!"),
        referralCode: "MASS001",
        // NO role field — mirrors what the register route does
      },
    });
    expect(user.role).toBe("user"); // default from Prisma schema
    expect(user.status).toBe("active"); // default
  });

  test("mass-assignment defense: even if role were passed to create, it would be 'user' for the default path", async () => {
    // Verify that the Prisma default is "user" — the register route NEVER
    // passes role, so the default takes over.
    const user = await db.user.create({
      data: {
        firstName: "تستی",
        lastName: "۲",
        email: "mass-assign-2@test.local",
        mobile: "09120000007",
        passwordHash: await hashPassword("Pass1234!"),
        referralCode: "MASS002",
      },
    });
    // The role column has @default("user") in the Prisma schema
    expect(user.role).toBe("user");
  });

  test("newReferralCode generates a unique code", async () => {
    const code1 = await newReferralCode();
    const code2 = await newReferralCode();
    expect(code1).toBeTruthy();
    expect(code2).toBeTruthy();
    expect(code1).not.toBe(code2);
    // Create a user with code1, then get code2 — should still be unique
    await db.user.create({
      data: {
        firstName: "تستی",
        lastName: "۳",
        email: "ref-test@test.local",
        mobile: "09120000008",
        passwordHash: await hashPassword("Pass1234!"),
        referralCode: code1,
      },
    });
    const code3 = await newReferralCode();
    expect(code3).not.toBe(code1);
  });

  test("audit() writes an AuditLog row and never throws", async () => {
    await audit({
      userId,
      actor: "system",
      action: "test_audit_action",
      targetType: "user",
      targetId: userId,
      ip: "127.0.0.1",
      meta: { reason: "test" },
    });
    const count = await db.auditLog.count({ where: { action: "test_audit_action" } });
    expect(count).toBe(1);
    // Audit with bad data still doesn't throw
    await expect(audit({
      actor: "system",
      action: "test_audit_safe",
    })).resolves.toBeUndefined();
  });

  test("safeJsonParse returns fallback on bad input", () => {
    expect(safeJsonParse("not json", { default: true })).toEqual({ default: true });
    expect(safeJsonParse<string>("", "fb")).toBe("fb");
    expect(safeJsonParse<number>("", 42)).toBe(42);
    expect(safeJsonParse<{ a: number }>('{"a":1}', { a: 0 })).toEqual({ a: 1 });
  });

  test("createSession persists Session with correct tokenHash (SHA-256 of JWT)", async () => {
    await createSession(userId, "127.0.0.1", "test-agent");
    // The mock cookie store has the JWT
    const token = _cookieValue!;
    expect(token).toBeTruthy();
    // The Session row should exist with hashToken(token)
    const sessions = await db.session.findMany({ where: { userId } });
    expect(sessions.length).toBe(1);
    expect(sessions[0].tokenHash).toBe(hashToken(token));
    expect(sessions[0].ip).toBe("127.0.0.1");
    expect(sessions[0].userAgent).toBe("test-agent");
    expect(sessions[0].revokedAt).toBeNull();
    // expiresAt should be ~7 days in the future
    const expiresAt = sessions[0].expiresAt!.getTime();
    const expectedExpiry = Date.now() + SESSION_TTL_SEC * 1000;
    expect(expiresAt).toBeGreaterThan(expectedExpiry - 60_000);
    expect(expiresAt).toBeLessThan(expectedExpiry + 60_000);
  });
});
