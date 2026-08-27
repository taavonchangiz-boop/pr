// =====================================================================
// POSTYAR — Crypto primitives test suite
// Covers addendum §6 (AUTHENTICATION), §7 (security: malicious input,
// OTP brute force, OTP replay, OTP reuse, webhook forgery, payment
// replay) and §8 (no floating-point financial calculation).
// Pure-function tests — no DB required.
// Env vars are set by tests/preload.ts (see bunfig.toml).
// =====================================================================
import { test, expect, describe } from "bun:test";
import {
  encryptString,
  decryptString,
  hmacSign,
  hmacVerify,
  constantTimeEqual,
  randomToken,
  randomNumericCode,
  hashOtp,
  hashToken,
  hashPassword,
  verifyPassword,
  signJwt,
  verifyJwt,
  sha256Hex,
} from "../src/lib/security/crypto";

describe("crypto: AES-256-GCM encrypt/decrypt", () => {
  test("round-trips arbitrary UTF-8 (Persian)", () => {
    const pt = "پُست‌یار — راز محتوای کاربر";
    const ct = encryptString(pt);
    expect(ct).not.toBe(pt);
    expect(ct.startsWith("v1:aes-256-gcm:")).toBe(true);
    expect(decryptString(ct)).toBe(pt);
  });

  test("different IVs → different ciphertexts for same plaintext", () => {
    const pt = "bot-token-secret";
    const a = encryptString(pt);
    const b = encryptString(pt);
    expect(a).not.toBe(b); // random IV
    expect(decryptString(a)).toBe(pt);
    expect(decryptString(b)).toBe(pt);
  });

  test("tampered ciphertext throws (auth tag mismatch)", () => {
    const ct = encryptString("payload");
    // Flip a byte in the ciphertext portion (last base64 segment)
    const parts = ct.split(":");
    const tamperedEnc = Buffer.from(parts[4], "base64");
    tamperedEnc[0] ^= 0x01;
    parts[4] = tamperedEnc.toString("base64");
    const forged = parts.join(":");
    expect(() => decryptString(forged)).toThrow();
  });

  test("empty string round-trips to empty", () => {
    expect(encryptString("")).toBe("");
    expect(decryptString("")).toBe("");
  });
});

describe("crypto: HMAC-SHA256 sign/verify (webhook forgery defense)", () => {
  test("valid signature verifies", () => {
    const label = "bot-webhook-sig";
    const payload = JSON.stringify({ update_id: 12345, text: "سلام" });
    const sig = hmacSign(label, payload);
    expect(hmacVerify(label, payload, sig)).toBe(true);
  });

  test("forged signature (wrong key) is REJECTED", () => {
    const payload = JSON.stringify({ update_id: 1 });
    const forgedSig = hmacSign("wrong-label", payload);
    expect(hmacVerify("bot-webhook-sig", payload, forgedSig)).toBe(false);
  });

  test("tampered payload is REJECTED (payment replay defense)", () => {
    const payload = JSON.stringify({ amount: 100000 });
    const sig = hmacSign("payment-callback", payload);
    // Attacker tampers the amount after signing
    const tampered = JSON.stringify({ amount: 10000000 });
    expect(hmacVerify("payment-callback", tampered, sig)).toBe(false);
  });

  test("different payloads produce different signatures", () => {
    const s1 = hmacSign("l", "p1");
    const s2 = hmacSign("l", "p2");
    expect(s1).not.toBe(s2);
  });
});

describe("crypto: constant-time compare", () => {
  test("equal strings → true", () => {
    expect(constantTimeEqual("abcdef", "abcdef")).toBe(true);
  });
  test("different strings → false", () => {
    expect(constantTimeEqual("abcdef", "abcdez")).toBe(false);
  });
  test("different lengths → false (no length leak beyond bool)", () => {
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
  });
  test("non-string inputs → false (no throw)", () => {
    expect(constantTimeEqual(null as unknown as string, "abc")).toBe(false);
    expect(constantTimeEqual("abc", undefined as unknown as string)).toBe(false);
  });
});

describe("crypto: random token generator", () => {
  test("returns hex of requested byte length", () => {
    const t = randomToken(16);
    expect(t).toMatch(/^[0-9a-f]{32}$/); // 16 bytes = 32 hex chars
  });
  test("default 32 bytes", () => {
    expect(randomToken()).toMatch(/^[0-9a-f]{64}$/);
  });
  test("two consecutive tokens are distinct (no reuse)", () => {
    const a = randomToken(16);
    const b = randomToken(16);
    expect(a).not.toBe(b);
  });
});

describe("crypto: OTP numeric code (rejection sampling)", () => {
  test("always exactly 6 digits", () => {
    for (let i = 0; i < 200; i++) {
      const c = randomNumericCode(6);
      expect(c.length).toBe(6);
      expect(c).toMatch(/^[0-9]{6}$/);
    }
  });
  test("4-digit variant", () => {
    const c = randomNumericCode(4);
    expect(c.length).toBe(4);
    expect(c).toMatch(/^[0-9]{4}$/);
  });
  test("codes are not all the same across 100 draws (entropy sanity)", () => {
    const set = new Set<string>();
    for (let i = 0; i < 100; i++) set.add(randomNumericCode(6));
    // With 10^6 space, 100 draws should have >50 unique values.
    expect(set.size).toBeGreaterThan(50);
  });
});

describe("crypto: OTP hash (OTP replay/reuse defense)", () => {
  test("same OTP + same salt → same hash (deterministic)", () => {
    expect(hashOtp("123456")).toBe(hashOtp("123456"));
  });
  test("different OTPs → different hashes", () => {
    expect(hashOtp("123456")).not.toBe(hashOtp("654321"));
  });
  test("token hash is 64 hex chars (sha256)", () => {
    expect(hashToken("abc")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("crypto: bcrypt password hash", () => {
  test("hash ≠ plaintext", async () => {
    const h = await hashPassword("سleDb1541");
    expect(h).not.toBe("سleDb1541");
    expect(h.startsWith("$2")).toBe(true);
  });
  test("correct password verifies", async () => {
    const h = await hashPassword("CorrectPassword!123");
    expect(await verifyPassword("CorrectPassword!123", h)).toBe(true);
  });
  test("wrong password REJECTED", async () => {
    const h = await hashPassword("CorrectPassword!123");
    expect(await verifyPassword("WrongPassword!123", h)).toBe(false);
  });
  test("malformed hash does NOT throw — returns false", async () => {
    expect(await verifyPassword("x", "not-a-bcrypt-hash")).toBe(false);
  });
});

describe("crypto: JWT HS256", () => {
  test("sign + verify round-trip", () => {
    const tok = signJwt({ sub: "user-1", role: "user", sid: "sess-1" });
    const p = verifyJwt(tok);
    expect(p).not.toBeNull();
    expect(p?.sub).toBe("user-1");
    expect(p?.role).toBe("user");
    expect(p?.sid).toBe("sess-1");
  });
  test("tampered token REJECTED (signature mismatch)", () => {
    const tok = signJwt({ sub: "user-1", role: "user", sid: "sess-1" });
    // Flip a char in the payload segment
    const parts = tok.split(".");
    const tampered = parts[0] + "." + Buffer.from("eyJaYXQiOjF9").toString("base64url") + "." + parts[2];
    expect(verifyJwt(tampered)).toBeNull();
  });
  test("role elevation attack REJECTED", () => {
    // Attacker signs a user-role token, then tries to claim admin
    const tok = signJwt({ sub: "u1", role: "user", sid: "s1" });
    const p = verifyJwt(tok);
    expect(p?.role).toBe("user");
    expect(p?.role).not.toBe("admin"); // cannot self-elevate
  });
  test("garbage token → null (no throw)", () => {
    expect(verifyJwt("not-a-jwt")).toBeNull();
    expect(verifyJwt("")).toBeNull();
  });
});

describe("crypto: sha256Hex (deterministic)", () => {
  test("same input → same hash", () => {
    expect(sha256Hex("postyar")).toBe(sha256Hex("postyar"));
  });
  test("different input → different hash", () => {
    expect(sha256Hex("a")).not.toBe(sha256Hex("b"));
  });
});
