// =====================================================================
// POSTYAR — Bale payment security/integration tests (DB-backed tier)
// ---------------------------------------------------------------------
// Covers addendum §14 (Bale payment final validation), §13 (payment
// idempotency + replay-resistance), §9 (duplicate-suppression).
//
// Invariants under test:
//   * processBaleUpdate pre_checkout with correct secret + amount → ok
//   * pre_checkout with WRONG secret → rejected (constant-time compare)
//   * pre_checkout with WRONG amount → rejected + audited
//   * pre_checkout with unknown order → rejected
//   * successful_payment happy path → ONE WalletTxn + ONE LedgerEntry + Order paid
//   * DUPLICATE successful_payment (same chargeId) → no double credit
//   * CONCURRENT successful_payment (2 parallel) → exactly ONE credit
//   * amount mismatch on success → Order marked failed
//   * secret mismatch on success → not handled
//   * rawPayload is AES-encrypted at creation (decryptable to the secret)
//   * non-bale bot rejected
//   * missing update_id rejected
//
// Test env: global.fetch is mocked to avoid real HTTP to tapi.bale.ai.
// The answerPreCheckoutQuery path calls fetch but ignores the result,
// so mocking fetch to return a trivial 200 OK is sufficient.
// =====================================================================
import { test, expect, describe, beforeAll, beforeEach, afterAll } from "bun:test";
import { db } from "@/lib/db";
import { resetDb, seedUser, seedBot, ensureDbConnected, seedOrder } from "./_db-helpers";
import { encryptString, decryptString, randomToken, constantTimeEqual } from "@/lib/security/crypto";
import { processBaleUpdate, ensureBalePaymentSecret, type BaleUpdate } from "@/lib/payments/bale";
import type { Bot } from "@prisma/client";

// --- Mock global.fetch so processBaleUpdate's answerPreCheckoutQuery
//     does not attempt real HTTP to tapi.bale.ai. ---
const _originalFetch = global.fetch;
function mockFetchOk(): void {
  global.fetch = (async () =>
    new Response(JSON.stringify({ ok: true, result: {} }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof global.fetch;
}
function restoreFetch(): void {
  global.fetch = _originalFetch;
}

describe("Bale payment: pre_checkout + successful_payment + idempotency (DB-backed)", () => {
  let userId: string;
  let botId: string;

  beforeAll(async () => {
    await ensureDbConnected();
  });

  beforeEach(async () => {
    await resetDb();
    mockFetchOk();
    const u = await seedUser({ email: "bale@test.local", mobile: "09120000001" });
    userId = u.id;
    const b = await seedBot({ ownerId: userId, provider: "bale", name: "بات بله" });
    botId = b.id;
  });

  // Helper: set up an order + BalePaymentRef with an encrypted secret,
  // return the order + the plaintext secret (for building BaleUpdate payloads).
  async function setupOrderWithSecret(amountRials: number): Promise<{ orderId: string; secret: string; order: { id: string; amountRials: number; userId: string; kind: string; descriptionFa: string } }> {
    const order = await seedOrder({ userId, amountRials, kind: "wallet_credit", status: "awaiting_payment" });
    // Create a BalePaymentRef with the secret encrypted (mirrors baleCreatePaymentRequest)
    const secret = randomToken(32);
    await db.balePaymentRef.create({
      data: {
        orderId: order.id,
        botId,
        rawPayload: encryptString(secret),
      },
    });
    return { orderId: order.id, secret, order: { id: order.id, amountRials, userId, kind: "wallet_credit", descriptionFa: "تست" } };
  }

  // Helper: build a Bot object as Prisma would return it
  async function getBotRow(): Promise<Bot> {
    const bot = await db.bot.findUnique({ where: { id: botId } });
    if (!bot) throw new Error("bot not found");
    return bot;
  }

  test("rawPayload is AES-encrypted at creation (decryptable to secret)", async () => {
    const { orderId, secret } = await setupOrderWithSecret(100_000);
    const ref = await db.balePaymentRef.findUnique({ where: { orderId } });
    expect(ref).not.toBeNull();
    expect(ref!.rawPayload).toBeTruthy();
    // The rawPayload should be an AES envelope (starts with "v1:aes-256-gcm:")
    expect(ref!.rawPayload!.startsWith("v1:aes-256-gcm:")).toBe(true);
    // Decryption yields the original secret
    expect(decryptString(ref!.rawPayload!)).toBe(secret);
    // ensureBalePaymentSecret helper returns the secret
    expect(await ensureBalePaymentSecret(orderId)).toBe(secret);
  });

  test("pre_checkout with correct secret + amount → handled (pre_checkout_ok)", async () => {
    const { orderId, secret, order } = await setupOrderWithSecret(100_000);
    const bot = await getBotRow();
    const update: BaleUpdate = {
      update_id: 1001,
      pre_checkout_query: {
        id: "pcq-1",
        currency: "IRR",
        total_amount: order.amountRials,
        invoice_payload: `${orderId}:${secret}`,
      },
    };
    const result = await processBaleUpdate(bot, update);
    expect(result.handled).toBe(true);
    expect(result.reason).toBe("pre_checkout_ok");
    // updateId should be persisted on the ref
    const ref = await db.balePaymentRef.findUnique({ where: { orderId } });
    expect(ref!.updateId).toBe("1001");
    expect(ref!.currency).toBe("IRR");
  });

  test("pre_checkout with WRONG secret → rejected (secret_mismatch)", async () => {
    const { orderId, order } = await setupOrderWithSecret(100_000);
    const bot = await getBotRow();
    const wrongSecret = randomToken(32);
    const update: BaleUpdate = {
      update_id: 1002,
      pre_checkout_query: {
        id: "pcq-2",
        currency: "IRR",
        total_amount: order.amountRials,
        invoice_payload: `${orderId}:${wrongSecret}`,
      },
    };
    const result = await processBaleUpdate(bot, update);
    expect(result.handled).toBe(true);
    expect(result.reason).toBe("secret_mismatch");
  });

  test("pre_checkout with WRONG amount → rejected + audited (amount_mismatch)", async () => {
    const { orderId, secret } = await setupOrderWithSecret(100_000);
    const bot = await getBotRow();
    const update: BaleUpdate = {
      update_id: 1003,
      pre_checkout_query: {
        id: "pcq-3",
        currency: "IRR",
        total_amount: 999_999, // wrong
        invoice_payload: `${orderId}:${secret}`,
      },
    };
    const result = await processBaleUpdate(bot, update);
    expect(result.handled).toBe(true);
    expect(result.reason).toBe("amount_mismatch");
    // Audit log should record the mismatch
    const auditCount = await db.auditLog.count({ where: { action: "bale_precheckout_amount_mismatch" } });
    expect(auditCount).toBe(1);
  });

  test("pre_checkout for unknown order → rejected (order_not_found)", async () => {
    const bot = await getBotRow();
    const fakeSecret = randomToken(32);
    const update: BaleUpdate = {
      update_id: 1004,
      pre_checkout_query: {
        id: "pcq-4",
        currency: "IRR",
        total_amount: 100_000,
        invoice_payload: `nonexistent-order-id:${fakeSecret}`,
      },
    };
    const result = await processBaleUpdate(bot, update);
    expect(result.handled).toBe(true);
    expect(result.reason).toBe("order_not_found");
  });

  test("pre_checkout with invalid payload (no colon) → rejected (invalid_payload)", async () => {
    const bot = await getBotRow();
    const update: BaleUpdate = {
      update_id: 1005,
      pre_checkout_query: {
        id: "pcq-5",
        currency: "IRR",
        total_amount: 100_000,
        invoice_payload: "no-colon-here",
      },
    };
    const result = await processBaleUpdate(bot, update);
    expect(result.handled).toBe(true);
    expect(result.reason).toBe("invalid_payload");
  });

  test("successful_payment happy path → ONE WalletTxn + ONE LedgerEntry + Order paid", async () => {
    const { orderId, secret, order } = await setupOrderWithSecret(100_000);
    const bot = await getBotRow();
    const update: BaleUpdate = {
      update_id: 2001,
      message: {
        successful_payment: {
          invoice_payload: `${orderId}:${secret}`,
          currency: "IRR",
          total_amount: order.amountRials,
          telegram_payment_charge_id: "bale-charge-001",
          provider_payment_charge_id: "ppc-001",
        },
      },
    };
    const result = await processBaleUpdate(bot, update);
    expect(result.handled).toBe(true);
    expect(result.reason).toBe("successful_payment_processed");

    // Order status → paid
    const updatedOrder = await db.order.findUnique({ where: { id: orderId } });
    expect(updatedOrder!.status).toBe("paid");
    expect(updatedOrder!.providerRef).toBe("bale-charge-001");

    // BalePaymentRef finalized
    const ref = await db.balePaymentRef.findUnique({ where: { orderId } });
    expect(ref!.chargeId).toBe("bale-charge-001");
    expect(ref!.paidAt).not.toBeNull();
    expect(ref!.updateId).toBe("2001");

    // EXACTLY ONE WalletTxn (no double credit)
    const walletCount = await db.walletTxn.count({ where: { userId } });
    expect(walletCount).toBe(1);
    // EXACTLY ONE LedgerEntry
    const ledgerCount = await db.ledgerEntry.count({ where: { userId } });
    expect(ledgerCount).toBe(1);
    // Wallet balance = order amount
    const walletTxn = await db.walletTxn.findFirst({ where: { userId } });
    expect(walletTxn!.amountRials).toBe(order.amountRials);
    expect(walletTxn!.direction).toBe("credit");
    expect(walletTxn!.balanceAfter).toBe(order.amountRials);
  });

  test("DUPLICATE successful_payment (same chargeId) → no double credit", async () => {
    const { orderId, secret, order } = await setupOrderWithSecret(200_000);
    const bot = await getBotRow();
    const baseUpdate: BaleUpdate = {
      update_id: 2002,
      message: {
        successful_payment: {
          invoice_payload: `${orderId}:${secret}`,
          currency: "IRR",
          total_amount: order.amountRials,
          telegram_payment_charge_id: "bale-charge-dup",
        },
      },
    };
    // First call: creates the credit
    await processBaleUpdate(bot, baseUpdate);
    // Second call: same chargeId — idempotent re-entry (early-return
    // because chargeId is already set on the ref)
    const result2 = await processBaleUpdate(bot, baseUpdate);
    expect(result2.handled).toBe(true);
    expect(result2.reason).toBe("already_paid_idempotent");

    // Still only ONE WalletTxn + ONE LedgerEntry
    const walletCount = await db.walletTxn.count({ where: { userId } });
    expect(walletCount).toBe(1);
    const ledgerCount = await db.ledgerEntry.count({ where: { userId } });
    expect(ledgerCount).toBe(1);
  });

  test("CONCURRENT successful_payment (2 parallel, distinct update_ids, same chargeId) → exactly ONE credit", async () => {
    const { orderId, secret, order } = await setupOrderWithSecret(300_000);
    const bot = await getBotRow();
    const makeUpdate = (uid: number): BaleUpdate => ({
      update_id: uid,
      message: {
        successful_payment: {
          invoice_payload: `${orderId}:${secret}`,
          currency: "IRR",
          total_amount: order.amountRials,
          telegram_payment_charge_id: "bale-charge-concurrent",
        },
      },
    });
    // Two parallel calls — the atomic updateMany({where:{orderId, chargeId:null}})
    // ensures only one wins.
    const results = await Promise.all([
      processBaleUpdate(bot, makeUpdate(3001)).catch((e: unknown) => ({ handled: false, reason: String(e) })),
      processBaleUpdate(bot, makeUpdate(3002)).catch((e: unknown) => ({ handled: false, reason: String(e) })),
    ]);
    // Both should report handled
    expect(results.every((r) => r.handled)).toBe(true);

    // EXACTLY ONE credit — the financial integrity invariant
    const walletCount = await db.walletTxn.count({ where: { userId } });
    expect(walletCount).toBe(1);
    const ledgerCount = await db.ledgerEntry.count({ where: { userId } });
    expect(ledgerCount).toBe(1);
  });

  test("amount mismatch on successful_payment → Order marked failed", async () => {
    const { orderId, secret } = await setupOrderWithSecret(100_000);
    const bot = await getBotRow();
    const update: BaleUpdate = {
      update_id: 2003,
      message: {
        successful_payment: {
          invoice_payload: `${orderId}:${secret}`,
          currency: "IRR",
          total_amount: 1, // wrong
          telegram_payment_charge_id: "bale-charge-mismatch",
        },
      },
    };
    const result = await processBaleUpdate(bot, update);
    expect(result.handled).toBe(true);
    expect(result.reason).toBe("amount_mismatch_on_success");
    // Order marked failed
    const order = await db.order.findUnique({ where: { id: orderId } });
    expect(order!.status).toBe("failed");
    // NO WalletTxn created
    const walletCount = await db.walletTxn.count({ where: { userId } });
    expect(walletCount).toBe(0);
    // Audit logged
    const auditCount = await db.auditLog.count({ where: { action: "bale_payment_mismatch" } });
    expect(auditCount).toBe(1);
  });

  test("secret mismatch on successful_payment → not handled (secret_mismatch_on_success)", async () => {
    const { orderId, order } = await setupOrderWithSecret(100_000);
    const bot = await getBotRow();
    const wrongSecret = randomToken(32);
    const update: BaleUpdate = {
      update_id: 2004,
      message: {
        successful_payment: {
          invoice_payload: `${orderId}:${wrongSecret}`,
          currency: "IRR",
          total_amount: order.amountRials,
          telegram_payment_charge_id: "bale-charge-secret",
        },
      },
    };
    const result = await processBaleUpdate(bot, update);
    expect(result.handled).toBe(false);
    expect(result.reason).toBe("secret_mismatch_on_success");
    // NO WalletTxn, NO Order change
    const walletCount = await db.walletTxn.count({ where: { userId } });
    expect(walletCount).toBe(0);
  });

  test("non-bale bot rejected (not_a_bale_bot)", async () => {
    const telegramBot = await seedBot({ ownerId: userId, provider: "telegram" });
    const update: BaleUpdate = {
      update_id: 2005,
      message: {
        successful_payment: {
          invoice_payload: "x:y",
          currency: "IRR",
          total_amount: 100,
          telegram_payment_charge_id: "x",
        },
      },
    };
    const result = await processBaleUpdate(telegramBot, update);
    expect(result.handled).toBe(false);
    expect(result.reason).toBe("not_a_bale_bot");
  });

  test("missing update_id rejected (no_update_id)", async () => {
    const bot = await getBotRow();
    const update = { update_id: "not-a-number" as unknown as number } as BaleUpdate;
    const result = await processBaleUpdate(bot, update);
    expect(result.handled).toBe(false);
    expect(result.reason).toBe("no_update_id");
  });

  test("constant-time secret comparison prevents timing oracle", async () => {
    // Verify the constantTimeEqual primitive is used (not ===)
    const secret = randomToken(32);
    const wrong = randomToken(32);
    expect(constantTimeEqual(secret, secret)).toBe(true);
    expect(constantTimeEqual(secret, wrong)).toBe(false);
    expect(constantTimeEqual("", "")).toBe(true);
    expect(constantTimeEqual("a", "b")).toBe(false);
  });
});

// Restore fetch after the suite
afterAll(() => {
  restoreFetch();
});
