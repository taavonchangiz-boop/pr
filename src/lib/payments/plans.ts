// =====================================================================
// POSTYAR — Plans, Subscriptions, Quota engine
// ---------------------------------------------------------------------
// Money is INTEGER minor units (Rial). NO floats anywhere.
// All financial mutations are atomic via Prisma $transaction with
// deterministic idempotency keys. Server-authoritative.
// Persian + RTL + Jalali everywhere.
// =====================================================================
import { db } from "@/lib/db";
import { safeJsonParse } from "@/lib/server/auth";
import { AuthError } from "@/lib/server/auth";
import { formatRials, toPersianDigits } from "@/lib/persian";

// ---------------------------------------------------------------------
// Quota shape (stored as JSON string in Plan.quota / Subscription.usedQuota)
// ---------------------------------------------------------------------
export type QuotaDimension = "publishPerMonth" | "aiPerMonth" | "channels" | "automation";

export interface QuotaState {
  publishPerMonth: { used: number; limit: number };
  aiPerMonth: { used: number; limit: number };
  channels: { used: number; limit: number };
  automation: { used: number; limit: number };
}

export interface PlanQuota {
  publishPerMonth?: number;
  aiPerMonth?: number;
  channels?: number;
  automation?: number;
}

export interface PublicPlanView {
  id: string;
  code: string;
  nameFa: string;
  descriptionFa: string;
  priceRials: number;
  priceRialsFa: string;
  intervalMonths: number;
  quota: PlanQuota;
  active: boolean;
  isPublic: boolean;
}

// ---------------------------------------------------------------------
// Plans listing / seeding
// ---------------------------------------------------------------------
const SEED_PLANS: Array<{
  code: string;
  nameFa: string;
  descriptionFa: string;
  priceRials: number;
  intervalMonths: number;
  quota: PlanQuota;
  isPublic: boolean;
  active: boolean;
}> = [
  {
    code: "free",
    nameFa: "رایگان",
    descriptionFa: "برای آشنایی با پُست‌یار — ۵ پست در ماه، ۱ کانال.",
    priceRials: 0,
    intervalMonths: 1,
    quota: { publishPerMonth: 5, aiPerMonth: 10, channels: 1, automation: 0 },
    isPublic: true,
    active: true,
  },
  {
    code: "basic",
    nameFa: "پایه",
    descriptionFa: "مناسب کسب‌وکارهای کوچک — ۱۰۰ پست در ماه، ۳ کانال.",
    priceRials: 200_000_000, // 20 million toman
    intervalMonths: 1,
    quota: { publishPerMonth: 100, aiPerMonth: 500, channels: 3, automation: 1 },
    isPublic: true,
    active: true,
  },
  {
    code: "pro",
    nameFa: "حرفه‌ای",
    descriptionFa: "برای تیم‌های بازاریابی — ۱۰۰۰ پست، ۱۰ کانال، اتوماسیون کامل.",
    priceRials: 500_000_000, // 50 million toman
    intervalMonths: 1,
    quota: { publishPerMonth: 1000, aiPerMonth: 5000, channels: 10, automation: 5 },
    isPublic: true,
    active: true,
  },
  {
    code: "business",
    nameFa: "سازمانی",
    descriptionFa: "بدون محدودیت پست و کانال — پشتیبانی اختصاصی.",
    priceRials: 1_500_000_000, // 150 million toman
    intervalMonths: 1,
    quota: { publishPerMonth: 10_000, aiPerMonth: 50_000, channels: 100, automation: 100 },
    isPublic: true,
    active: true,
  },
];

let seedPromise: Promise<void> | null = null;

export function ensurePlansSeeded(): Promise<void> {
  if (seedPromise) return seedPromise;
  seedPromise = (async () => {
    for (const p of SEED_PLANS) {
      await db.plan.upsert({
        where: { code: p.code },
        create: {
          code: p.code,
          nameFa: p.nameFa,
          descriptionFa: p.descriptionFa,
          priceRials: p.priceRials,
          intervalMonths: p.intervalMonths,
          quota: JSON.stringify(p.quota),
          isPublic: p.isPublic,
          active: p.active,
        },
        update: {
          // Only refresh volatile fields — never overwrite a price the admin
          // may have intentionally adjusted via a future admin UI.
          nameFa: p.nameFa,
          descriptionFa: p.descriptionFa,
          quota: JSON.stringify(p.quota),
        },
      });
    }
  })();
  return seedPromise;
}

// Run on module load (idempotent)
void ensurePlansSeeded();

export async function listPublicPlans(): Promise<PublicPlanView[]> {
  await ensurePlansSeeded();
  const rows = await db.plan.findMany({
    where: { isPublic: true, active: true },
    orderBy: { priceRials: "asc" },
  });
  return rows.map((p) => ({
    id: p.id,
    code: p.code,
    nameFa: p.nameFa,
    descriptionFa: p.descriptionFa,
    priceRials: p.priceRials,
    priceRialsFa: formatRials(p.priceRials),
    intervalMonths: p.intervalMonths,
    quota: safeJsonParse<PlanQuota>(p.quota, {}),
    active: p.active,
    isPublic: p.isPublic,
  }));
}

export async function getPlanByCode(code: string) {
  return db.plan.findUnique({ where: { code } });
}

export async function getPlanById(id: string) {
  return db.plan.findUnique({ where: { id } });
}

// ---------------------------------------------------------------------
// Orders — creating a subscription order
// ---------------------------------------------------------------------
export interface CreateOrderInput {
  userId: string;
  planId?: string;
  kind: "subscription" | "wallet_credit" | "ad_campaign";
  amountRials?: number; // for wallet_credit / ad_campaign
  provider?: "card" | "bank" | "bale";
  descriptionFa?: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}

export async function createOrderForSubscription(input: {
  userId: string;
  planId: string;
  idempotencyKey: string;
  provider?: "card" | "bank" | "bale";
  metadata?: Record<string, unknown>;
}): Promise<{ order: { id: string; amountRials: number; status: string; descriptionFa: string } }> {
  await ensurePlansSeeded();
  const plan = await db.plan.findUnique({ where: { id: input.planId } });
  if (!plan || !plan.active) {
    throw new AuthError("طرح انتخاب‌شده معتبر یا فعال نیست.", 400);
  }
  // Try to create with idempotencyKey UNIQUE — if it exists, return that.
  const existing = await db.order.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });
  if (existing) {
    if (existing.userId !== input.userId) {
      throw new AuthError("کلید یکتا تکراری است.", 409);
    }
    return {
      order: {
        id: existing.id,
        amountRials: existing.amountRials,
        status: existing.status,
        descriptionFa: existing.descriptionFa,
      },
    };
  }
  const descriptionFa = `اشتراک ${plan.nameFa} — ${toPersianDigits(plan.intervalMonths)} ماهه`;
  const order = await db.order.create({
    data: {
      userId: input.userId,
      kind: "subscription",
      amountRials: plan.priceRials,
      planId: plan.id,
      descriptionFa,
      status: "pending",
      provider: input.provider ?? null,
      idempotencyKey: input.idempotencyKey,
      metadata: JSON.stringify(input.metadata ?? {}),
    },
  });
  return {
    order: {
      id: order.id,
      amountRials: order.amountRials,
      status: order.status,
      descriptionFa: order.descriptionFa,
    },
  };
}

export async function createWalletCreditOrder(input: {
  userId: string;
  amountRials: number;
  idempotencyKey: string;
  provider?: "card" | "bank" | "bale";
  descriptionFa?: string;
  metadata?: Record<string, unknown>;
}): Promise<{ order: { id: string; amountRials: number; status: string; descriptionFa: string } }> {
  if (!Number.isInteger(input.amountRials) || input.amountRials <= 0) {
    throw new AuthError("مبلغ نامعتبر است.", 400);
  }
  if (input.amountRials < 100_000) {
    throw new AuthError("حداقل مبلغ شارژ ۱۰٬۰۰۰ تومان است.", 400);
  }
  const existing = await db.order.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });
  if (existing) {
    if (existing.userId !== input.userId) {
      throw new AuthError("کلید یکتا تکراری است.", 409);
    }
    return {
      order: {
        id: existing.id,
        amountRials: existing.amountRials,
        status: existing.status,
        descriptionFa: existing.descriptionFa,
      },
    };
  }
  const descriptionFa = input.descriptionFa ?? "شارژ کیف پول";
  const order = await db.order.create({
    data: {
      userId: input.userId,
      kind: "wallet_credit",
      amountRials: input.amountRials,
      descriptionFa,
      status: "pending",
      provider: input.provider ?? null,
      idempotencyKey: input.idempotencyKey,
    },
  });
  return {
    order: {
      id: order.id,
      amountRials: order.amountRials,
      status: order.status,
      descriptionFa: order.descriptionFa,
    },
  };
}

// ---------------------------------------------------------------------
// activateSubscription — atomic post-payment subscription activation.
// Referral reward is applied here, ONCE per referred user.
// ---------------------------------------------------------------------
export async function activateSubscription(input: {
  orderId: string;
  paidRials: number;
  idempotencyKey: string;
}): Promise<{ subscriptionId: string; endsAt: Date; referralRewardRials: number }> {
  // HARD AMOUNT CHECK: paidRials must equal the order's stored amount.
  const order = await db.order.findUnique({
    where: { id: input.orderId },
  });
  if (!order) throw new AuthError("سفارش یافت نشد.", 404);
  if (order.amountRials !== input.paidRials) {
    throw new AuthError("مبلغ پرداختی با مبلغ سفارش مطابقت ندارد.", 400);
  }
  if (order.kind !== "subscription" && order.kind !== "wallet_credit") {
    throw new AuthError("نوع سفارش برای فعال‌سازی اشتراک معتبر نیست.", 400);
  }

  // For wallet_credit kind, we don't activate a subscription — just credit the wallet.
  // The caller (verifyAndFinalize) is responsible for the WalletTxn + LedgerEntry.
  // This helper is only meaningful for subscription activation, but stays neutral.

  const result = await db.$transaction(async (tx) => {
    // Lock the order row by attempting a conditional update.
    // If status is already "paid", this returns 0 — meaning the order is
    // already paid (idempotent re-entry). We then return the existing
    // subscription's id.
    const updated = await tx.order.updateMany({
      where: { id: order.id, status: { in: ["awaiting_review", "awaiting_payment", "pending"] } },
      data: { status: "paid" },
    });
    if (updated.count === 0) {
      // Already paid — idempotent re-entry. Look up the existing subscription.
      const existingSub = await tx.subscription.findFirst({
        where: { userId: order.userId },
        orderBy: { createdAt: "desc" },
      });
      if (existingSub) {
        return { subscriptionId: existingSub.id, endsAt: existingSub.endsAt, referralRewardRials: 0 };
      }
      // No sub — likely wallet_credit kind. Idempotent.
      return { subscriptionId: "", endsAt: new Date(0), referralRewardRials: 0 };
    }

    // LedgerEntry — append-only.
    const ledgerIdemKey = `ledger:payment:${order.id}`;
    const walletIdemKey = `wallet:payment:${order.id}`;

    // Ledger
    await tx.ledgerEntry.upsert({
      where: { idempotencyKey: ledgerIdemKey },
      create: {
        userId: order.userId,
        orderId: order.id,
        eventType: "payment",
        amountRials: order.amountRials,
        currency: "IRR",
        idempotencyKey: ledgerIdemKey,
      },
      update: {},
    });

    // WalletTxn credit (balanceAfter computed below from running total)
    // For subscription orders, the credit goes to wallet for ledger symmetry;
    // the user's balance is the sum of walletTxn amounts. The amount is +amountRials.
    // Compute balanceAfter as current SUM + new amount.
    const prevTxns = await tx.walletTxn.findMany({
      where: { userId: order.userId },
      select: { amountRials: true, direction: true },
    });
    let runningBalance = 0;
    for (const t of prevTxns) {
      runningBalance += t.direction === "credit" ? t.amountRials : -t.amountRials;
    }
    const balanceAfter = runningBalance + order.amountRials;

    await tx.walletTxn.upsert({
      where: { idempotencyKey: walletIdemKey },
      create: {
        userId: order.userId,
        orderId: order.id,
        amountRials: order.amountRials,
        direction: "credit",
        reason: "payment",
        balanceAfter,
        idempotencyKey: walletIdemKey,
      },
      update: {},
    });

    // Subscription activation (only for kind === subscription)
    let subscriptionId = "";
    let endsAt = new Date(0);
    if (order.kind === "subscription" && order.planId) {
      const plan = await tx.plan.findUnique({ where: { id: order.planId } });
      if (!plan) {
        throw new AuthError("طرح مرتبط با سفارش یافت نشد.", 500);
      }
      const now = new Date();
      const endsAtDate = new Date(now);
      // add intervalMonths
      endsAtDate.setMonth(endsAtDate.getMonth() + plan.intervalMonths);
      // Dedup: look up the most-recent Subscription by (userId, planId).
      // The subscription schema has no idempotencyKey column, so we
      // gate on the order's paid status (which is already checked above)
      // AND on the absence of a sub created in this same transaction.
      const existing = await tx.subscription.findFirst({
        where: { userId: order.userId, planId: plan.id },
        orderBy: { createdAt: "desc" },
      });
      if (!existing) {
        const created = await tx.subscription.create({
          data: {
            userId: order.userId,
            planId: plan.id,
            status: "active",
            startedAt: now,
            endsAt: endsAtDate,
            usedQuota: "{}",
          },
        });
        subscriptionId = created.id;
        endsAt = endsAtDate;
      } else {
        subscriptionId = existing.id;
        endsAt = existing.endsAt;
      }
    }

    // Referral reward — only for the FIRST paid order by this user,
    // and only if the user was referred by someone.
    let referralRewardRials = 0;
    const user = await tx.user.findUnique({
      where: { id: order.userId },
      select: { id: true, referredById: true },
    });
    if (user && user.referredById && user.referredById !== user.id) {
      // Check no prior referral reward exists for this user.
      const existingReward = await tx.referralReward.findUnique({
        where: { referredId: user.id },
      });
      if (!existingReward) {
        const rewardPercent = Number(process.env.POSTYAR_REFERRAL_PERCENT ?? 20);
        const capRials = Number(process.env.POSTYAR_REFERRAL_CAP_RIALS ?? 100_000);
        const computed = Math.round((order.amountRials * rewardPercent) / 100);
        referralRewardRials = Math.min(computed, capRials);
        if (referralRewardRials > 0) {
          const refIdemKey = `referral:reward:${user.id}`;
          const refWalletIdemKey = `wallet:referral:${user.id}`;
          const refLedgerIdemKey = `ledger:referral:${user.id}`;
          // Wallet balance
          const prevR = await tx.walletTxn.findMany({
            where: { userId: user.referredById },
            select: { amountRials: true, direction: true },
          });
          let runningR = 0;
          for (const t of prevR) {
            runningR += t.direction === "credit" ? t.amountRials : -t.amountRials;
          }
          const balAfterR = runningR + referralRewardRials;
          await tx.referralReward.upsert({
            where: { idempotencyKey: refIdemKey },
            create: {
              referrerId: user.referredById,
              referredId: user.id,
              amountRials: referralRewardRials,
              status: "paid",
              idempotencyKey: refIdemKey,
            },
            update: {},
          });
          await tx.walletTxn.upsert({
            where: { idempotencyKey: refWalletIdemKey },
            create: {
              userId: user.referredById,
              amountRials: referralRewardRials,
              direction: "credit",
              reason: "referral_reward",
              balanceAfter: balAfterR,
              idempotencyKey: refWalletIdemKey,
            },
            update: {},
          });
          await tx.ledgerEntry.upsert({
            where: { idempotencyKey: refLedgerIdemKey },
            create: {
              userId: user.referredById,
              eventType: "referral_reward",
              amountRials: referralRewardRials,
              currency: "IRR",
              idempotencyKey: refLedgerIdemKey,
            },
            update: {},
          });
        }
      }
    }

    return { subscriptionId, endsAt, referralRewardRials };
  });

  return result;
}

// ---------------------------------------------------------------------
// Active subscription lookup + quota state
// ---------------------------------------------------------------------
export async function getActiveSubscription(userId: string) {
  const now = new Date();
  const sub = await db.subscription.findFirst({
    where: {
      userId,
      status: "active",
      endsAt: { gt: now },
    },
    orderBy: { createdAt: "desc" },
    include: { plan: true },
  });
  return sub;
}

export async function getQuotaState(userId: string): Promise<QuotaState & { planNameFa?: string; endsAt?: string }> {
  const sub = await getActiveSubscription(userId);
  if (!sub) {
    // Free plan fallback
    const freePlan = await db.plan.findUnique({ where: { code: "free" } });
    const freeQuota: PlanQuota = freePlan
      ? safeJsonParse<PlanQuota>(freePlan.quota, { publishPerMonth: 5, aiPerMonth: 10, channels: 1, automation: 0 })
      : { publishPerMonth: 5, aiPerMonth: 10, channels: 1, automation: 0 };
    return {
      publishPerMonth: { used: 0, limit: freeQuota.publishPerMonth ?? 5 },
      aiPerMonth: { used: 0, limit: freeQuota.aiPerMonth ?? 10 },
      channels: { used: 0, limit: freeQuota.channels ?? 1 },
      automation: { used: 0, limit: freeQuota.automation ?? 0 },
      planNameFa: freePlan?.nameFa ?? "رایگان",
    };
  }
  const planQuota = safeJsonParse<PlanQuota>(sub.plan.quota, {});
  const used = safeJsonParse<Record<string, number>>(sub.usedQuota, {});
  return {
    publishPerMonth: { used: used.publishPerMonth ?? 0, limit: planQuota.publishPerMonth ?? 0 },
    aiPerMonth: { used: used.aiPerMonth ?? 0, limit: planQuota.aiPerMonth ?? 0 },
    channels: { used: used.channels ?? 0, limit: planQuota.channels ?? 0 },
    automation: { used: used.automation ?? 0, limit: planQuota.automation ?? 0 },
    planNameFa: sub.plan.nameFa,
    endsAt: sub.endsAt.toISOString(),
  };
}

export async function incrementQuotaUsage(input: {
  userId: string;
  dimension: QuotaDimension;
  amount: number;
}): Promise<void> {
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new AuthError("مقدار افزایش نامعتبر است.", 400);
  }
  const sub = await getActiveSubscription(input.userId);
  if (!sub) return; // free plan — no enforcement, no row
  const used = safeJsonParse<Record<string, number>>(sub.usedQuota, {});
  const current = used[input.dimension] ?? 0;
  used[input.dimension] = current + input.amount;
  await db.subscription.update({
    where: { id: sub.id },
    data: { usedQuota: JSON.stringify(used) },
  });
}

export async function requireQuota(input: {
  userId: string;
  dimension: QuotaDimension;
  amount: number;
}): Promise<void> {
  const state = await getQuotaState(input.userId);
  const dim = state[input.dimension];
  if (dim.limit > 0 && dim.used + input.amount > dim.limit) {
    const dimFa: Record<QuotaDimension, string> = {
      publishPerMonth: "انتشار ماهانه",
      aiPerMonth: "استفاده هوش مصنوعی ماهانه",
      channels: "کانال‌ها",
      automation: "اتوماسیون",
    };
    throw new AuthError(
      `سهمیه ${dimFa[input.dimension]} کافی نیست. ` +
      `استفاده‌شده: ${toPersianDigits(dim.used)} از ${toPersianDigits(dim.limit)}.`,
      403,
    );
  }
}
