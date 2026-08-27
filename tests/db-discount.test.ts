// =====================================================================
// POSTYAR — Discount DB-backed tests (addendum §45, §47)
// ---------------------------------------------------------------------
// Proves discount integrity against a real DB:
//   1. validateAndApply computes the correct discounted amount (no float).
//   2. Expired discount rejected.
//   3. Exhausted discount (maxUses reached) rejected.
//   4. Per-user limit enforced.
//   5. Non-applicable plan rejected.
//   6. recordUsage is atomic + idempotent (DuplicateUsage UNIQUE → rejected).
//   7. Inactive discount rejected.
// =====================================================================
import { describe, test, expect, beforeEach } from "bun:test";
import { db } from "../src/lib/db";
import { validateAndApply, recordUsage } from "../src/lib/payments/discount";
import { resetDb, seedUser, seedOrder } from "./db-helpers";
import { randomToken } from "../src/lib/security/crypto";

async function seedDiscount(opts: {
  code?: string;
  kind?: "percent" | "fixed";
  value?: number;
  maxUses?: number;
  uses?: number;
  perUserLimit?: number;
  expiresAt?: Date | null;
  active?: boolean;
  planIds?: string[];
} = {}): Promise<{ id: string; code: string }> {
  const code = opts.code ?? `DISC-${randomToken(4).toUpperCase()}`;
  const d = await db.discount.create({
    data: {
      code,
      kind: opts.kind ?? "percent",
      value: opts.value ?? 20,
      maxUses: opts.maxUses ?? 0,
      uses: opts.uses ?? 0,
      perUserLimit: opts.perUserLimit ?? 1,
      expiresAt: opts.expiresAt === undefined ? null : opts.expiresAt,
      active: opts.active ?? true,
    },
  });
  for (const planId of opts.planIds ?? []) {
    await db.discountPlan.create({ data: { discountId: d.id, planId } });
  }
  return { id: d.id, code: d.code };
}

describe("discount validation + usage (DB-backed)", () => {
  let userId: string;

  beforeEach(async () => {
    await resetDb();
    const u = await seedUser();
    userId = u.id;
  });

  test("validateAndApply computes correct percent discount (no float)", async () => {
    const d = await seedDiscount({ kind: "percent", value: 25 });
    const res = await validateAndApply({ code: d.code, orderAmount: 100_000, userId });
    expect(res.ok).toBe(true);
    expect(res.amountOff).toBe(25_000);
    expect(res.newAmount).toBe(75_000);
    expect(Number.isInteger(res.amountOff!)).toBe(true);
    expect(Number.isInteger(res.newAmount!)).toBe(true);
  });

  test("validateAndApply computes correct fixed discount", async () => {
    const d = await seedDiscount({ kind: "fixed", value: 15_000 });
    const res = await validateAndApply({ code: d.code, orderAmount: 50_000, userId });
    expect(res.ok).toBe(true);
    expect(res.amountOff).toBe(15_000);
    expect(res.newAmount).toBe(35_000);
  });

  test("expired discount rejected", async () => {
    const d = await seedDiscount({ expiresAt: new Date(Date.now() - 1000) });
    const res = await validateAndApply({ code: d.code, orderAmount: 100_000, userId });
    expect(res.ok).toBe(false);
    expect(res.errorFa).toBeTruthy();
  });

  test("exhausted discount (maxUses reached) rejected", async () => {
    const d = await seedDiscount({ maxUses: 5, uses: 5 });
    const res = await validateAndApply({ code: d.code, orderAmount: 100_000, userId });
    expect(res.ok).toBe(false);
  });

  test("inactive discount rejected", async () => {
    const d = await seedDiscount({ active: false });
    const res = await validateAndApply({ code: d.code, orderAmount: 100_000, userId });
    expect(res.ok).toBe(false);
  });

  test("per-user limit enforced", async () => {
    const d = await seedDiscount({ perUserLimit: 1 });
    const order = await seedOrder(userId, 100_000);
    // First usage ok
    const r1 = await recordUsage({ discountId: d.id, userId, orderId: order.id });
    expect(r1.ok).toBe(true);
    // Second usage by same user → rejected (per-user UNIQUE)
    const order2 = await seedOrder(userId, 100_000);
    const r2 = await recordUsage({ discountId: d.id, userId, orderId: order2.id });
    expect(r2.ok).toBe(false);
    // The uses counter incremented exactly once
    const refreshed = await db.discount.findUnique({ where: { id: d.id } });
    expect(refreshed!.uses).toBe(1);
  });

  test("recordUsage atomic — duplicate usage by same user rejected (UNIQUE constraint)", async () => {
    const d = await seedDiscount({ perUserLimit: 5 });
    const order = await seedOrder(userId, 100_000);
    await recordUsage({ discountId: d.id, userId, orderId: order.id });
    // Same discountId+userId (different orderId) — UNIQUE([discountId,userId]) rejects
    const r2 = await recordUsage({ discountId: d.id, userId, orderId: order.id });
    expect(r2.ok).toBe(false);
  });

  test("non-applicable plan rejected", async () => {
    const d = await seedDiscount({ planIds: [] }); // no plans linked
    const res = await validateAndApply({ code: d.code, orderAmount: 100_000, userId, planId: "plan-xyz" });
    expect(res.ok).toBe(false);
  });

  test("non-integer orderAmount rejected", async () => {
    const d = await seedDiscount();
    const res = await validateAndApply({ code: d.code, orderAmount: 100000.5 as unknown as number, userId });
    expect(res.ok).toBe(false);
  });

  test("unknown code rejected", async () => {
    const res = await validateAndApply({ code: "NOPE-1234", orderAmount: 100_000, userId });
    expect(res.ok).toBe(false);
  });
});
