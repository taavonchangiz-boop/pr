// Smoke test: verify the test DB is wired up correctly.
import { describe, test, expect, beforeEach, beforeAll } from "bun:test";
import { db, resetDb, seedUser, ensureDbConnected } from "./_db-helpers";

beforeAll(async () => { await ensureDbConnected(); });

describe("db smoke (test DB wiring)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  test("seedUser inserts a row", async () => {
    const u = await seedUser({ email: "smoke@test.local" });
    expect(u.id).toBeTruthy();
    expect(u.email).toBe("smoke@test.local");
    expect(u.role).toBe("user");
    const fetched = await db.user.findUnique({ where: { id: u.id } });
    expect(fetched?.email).toBe("smoke@test.local");
  });

  test("resetDb clears rows between tests", async () => {
    // Previous test inserted one user; resetDb ran in this beforeEach.
    const count = await db.user.count();
    expect(count).toBe(0);
  });
});
