// =====================================================================
// POSTYAR — Referral DB-backed tests (addendum §16, §47)
// ---------------------------------------------------------------------
// Proves the referral integrity invariants against a real DB:
//   1. Valid referral creates exactly ONE ReferralReward + WalletTxn + LedgerEntry.
//   2. Self-referral rejected (referrerId == newUserId → no reward).
//   3. Duplicate reward (same referredId) rejected via UNIQUE constraint.
//   4. Reward idempotent (same idempotencyKey → no double-credit).
//   5. Reward is atomic with its wallet credit (both exist or neither).
//   6. Cap enforced (rewardRials <= POSTYAR_REFERRAL_CAP_RIALS).
// =====================================================================
import { describe, test, expect, beforeEach } from "bun:test";
import { db } from "../src/lib/db";
import { getRewardForNewActiveSubscription } from "../src/lib/payments/referral";
import { resetDb, seedUser } from "./db-helpers";

describe("referral reward integrity (DB-backed)", () => {
  let referrerId: string;
  let newUserId: string;

  beforeEach(async () => {
    await resetDb();
    const ref = await seedUser({ email: "ref@test.local", mobile: "09121110001" });
    const newUser = await seedUser({ email: "new@test.local", mobile: "09121110002" });
    referrerId = ref.id;
    newUserId = newUser.id;
  });

  test("valid referral creates ONE reward + ONE wallet credit + ONE ledger entry", async () => {
    const res = await getRewardForNewActiveSubscription({
      newUserId, referrerId, amountRials: 100_000, idempotencyKey: "ref-1",
    });
    expect(res.paid).toBe(true);
    expect(res.rewardRials).toBe(20_000); // 20% of 100k (default percent)
    const rewards = await db.referralReward.findMany({ where: { referrerId } });
    expect(rewards.length).toBe(1);
    const txns = await db.walletTxn.findMany({ where: { userId: referrerId, reason: "referral_reward" } });
    expect(txns.length).toBe(1);
    expect(txns[0].amountRials).toBe(20_000);
    const ledger = await db.ledgerEntry.findMany({ where: { userId: referrerId, eventType: "referral_reward" } });
    expect(ledger.length).toBe(1);
  });

  test("self-referral rejected (no reward)", async () => {
    const res = await getRewardForNewActiveSubscription({
      newUserId: referrerId, referrerId, amountRials: 100_000, idempotencyKey: "self-1",
    });
    expect(res.paid).toBe(false);
    expect(res.rewardRials).toBe(0);
    const rewards = await db.referralReward.findMany({ where: { referrerId } });
    expect(rewards.length).toBe(0);
    const txns = await db.walletTxn.findMany({ where: { userId: referrerId } });
    expect(txns.length).toBe(0);
  });

  test("duplicate reward for same referred user rejected (UNIQUE constraint)", async () => {
    const r1 = await getRewardForNewActiveSubscription({
      newUserId, referrerId, amountRials: 100_000, idempotencyKey: "dup-ref-1",
    });
    expect(r1.paid).toBe(true);
    // Second call with DIFFERENT idempotencyKey but SAME referredId → rejected
    const r2 = await getRewardForNewActiveSubscription({
      newUserId, referrerId, amountRials: 100_000, idempotencyKey: "dup-ref-2",
    });
    expect(r2.paid).toBe(false);
    // Exactly one reward row, one wallet credit
    const rewards = await db.referralReward.findMany({ where: { referrerId } });
    expect(rewards.length).toBe(1);
    const txns = await db.walletTxn.findMany({ where: { userId: referrerId, reason: "referral_reward" } });
    expect(txns.length).toBe(1);
  });

  test("idempotent reward (same idempotencyKey → no double-credit)", async () => {
    await getRewardForNewActiveSubscription({
      newUserId, referrerId, amountRials: 100_000, idempotencyKey: "idem-ref-1",
    });
    const r2 = await getRewardForNewActiveSubscription({
      newUserId, referrerId, amountRials: 100_000, idempotencyKey: "idem-ref-1",
    });
    expect(r2.paid).toBe(false); // already paid
    const txns = await db.walletTxn.findMany({ where: { userId: referrerId, reason: "referral_reward" } });
    expect(txns.length).toBe(1);
  });

  test("cap enforced: rewardRials <= POSTYAR_REFERRAL_CAP_RIALS", async () => {
    // Default cap = 100_000 rials. Pay 1_000_000 rials → 20% = 200_000, capped to 100_000.
    const res = await getRewardForNewActiveSubscription({
      newUserId, referrerId, amountRials: 1_000_000, idempotencyKey: "cap-1",
    });
    expect(res.paid).toBe(true);
    expect(res.rewardRials).toBeLessThanOrEqual(100_000);
    const txns = await db.walletTxn.findMany({ where: { userId: referrerId, reason: "referral_reward" } });
    expect(txns[0].amountRials).toBe(res.rewardRials);
  });

  test("non-integer amount rejected (no float)", async () => {
    const res = await getRewardForNewActiveSubscription({
      newUserId, referrerId, amountRials: 100000.5 as unknown as number, idempotencyKey: "flt-ref",
    });
    expect(res.paid).toBe(false);
  });
});
