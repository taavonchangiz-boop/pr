// =====================================================================
// POSTYAR — Bot linking DB-backed tests (addendum §35, §36, §47)
// ---------------------------------------------------------------------
// Proves the link-code invariants against a real DB:
//   1. generateLinkCode issues a 10-min single-use code; codeHash stored (not plaintext).
//   2. consumeLinkCode happy path → ok, userId returned, consumedAt set.
//   3. Expired code rejected.
//   4. Reused code (consumedAt set) rejected — single use.
//   5. Wrong bot (code issued for bot A, consumed with botId=B) rejected.
//   6. Non-owner cannot generate a code for another user's bot.
//   7. Malformed code rejected.
// =====================================================================
import { describe, test, expect, beforeEach } from "bun:test";
import { db } from "../src/lib/db";
import { generateLinkCode, consumeLinkCode } from "../src/lib/bots/link";
import { resetDb, seedUser, seedBot } from "./db-helpers";

describe("bot linking — single-use + expiry + ownership (DB-backed)", () => {
  let userId: string;
  let botId: string;

  beforeEach(async () => {
    await resetDb();
    const u = await seedUser();
    userId = u.id;
    const b = await seedBot(userId);
    botId = b.id;
  });

  test("generateLinkCode issues a 10-min code; codeHash stored, NOT plaintext", async () => {
    const res = await generateLinkCode({ botId, userId });
    expect(res.code).toMatch(/^POSTYAR-/);
    expect(res.expiresAt.getTime()).toBeGreaterThan(Date.now() + 9 * 60 * 1000);
    const row = await db.botLinkCode.findUnique({ where: { codeHash: undefined as never } }).catch(() => null);
    void row;
    const rows = await db.botLinkCode.findMany({ where: { botId } });
    expect(rows.length).toBe(1);
    // codeHash stored, and it must NOT equal the plaintext code
    expect(rows[0].codeHash).not.toBe(res.code);
    expect(rows[0].consumedAt).toBeNull();
  });

  test("consumeLinkCode happy path → ok, userId returned, consumedAt set", async () => {
    const gen = await generateLinkCode({ botId, userId });
    const res = await consumeLinkCode({ botId, code: gen.code, providerUserId: "tg-123" });
    expect(res.ok).toBe(true);
    expect(res.userId).toBe(userId);
    const row = await db.botLinkCode.findFirst({ where: { botId } });
    expect(row!.consumedAt).not.toBeNull();
    expect(row!.consumedByProviderUserId).toBe("tg-123");
  });

  test("expired code rejected", async () => {
    const gen = await generateLinkCode({ botId, userId });
    // Manually expire
    const row = await db.botLinkCode.findFirst({ where: { botId } });
    await db.botLinkCode.update({
      where: { id: row!.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const res = await consumeLinkCode({ botId, code: gen.code, providerUserId: "tg-456" });
    expect(res.ok).toBe(false);
    expect(res.errorFa).toBeTruthy();
  });

  test("reused code rejected (single use)", async () => {
    const gen = await generateLinkCode({ botId, userId });
    const r1 = await consumeLinkCode({ botId, code: gen.code, providerUserId: "tg-a" });
    expect(r1.ok).toBe(true);
    // Second consume with the SAME code → rejected (consumedAt set)
    const r2 = await consumeLinkCode({ botId, code: gen.code, providerUserId: "tg-b" });
    expect(r2.ok).toBe(false);
  });

  test("wrong bot rejected (code for bot A, consume with botId=B)", async () => {
    const otherBot = await seedBot(userId, "bale");
    const gen = await generateLinkCode({ botId, userId });
    const res = await consumeLinkCode({ botId: otherBot.id, code: gen.code, providerUserId: "tg-x" });
    expect(res.ok).toBe(false);
  });

  test("non-owner cannot generate a code for another user's bot", async () => {
    const other = await seedUser({ email: "other@test.local", mobile: "09129990001" });
    await expect(generateLinkCode({ botId, userId: other.id })).rejects.toThrow();
  });

  test("malformed code rejected", async () => {
    const res = await consumeLinkCode({ botId, code: "GARBAGE", providerUserId: "tg-y" });
    expect(res.ok).toBe(false);
  });

  test("missing botId rejected", async () => {
    const res = await consumeLinkCode({ botId: "", code: "POSTYAR-ABCDEF12345678", providerUserId: "tg-z" });
    expect(res.ok).toBe(false);
  });
});
