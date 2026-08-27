// =====================================================================
// POSTYAR — Referral engine
// ---------------------------------------------------------------------
// Atomic + idempotent referral reward posting. Prevents self-referral
// and duplicate rewards per referred user (ReferralReward.referredId UNIQUE).
// Money: INTEGER Rial. NO floats. Reward = min(REWARD_PERCENT%, CAP_RIALS).
// Persian error strings.
// =====================================================================
import { db } from "@/lib/db";
import { audit } from "@/lib/server/auth";
import { maskMobile, formatRials, toPersianDigits } from "@/lib/persian";

const DEFAULT_REWARD_PERCENT = 20; // % of paid amount
const DEFAULT_REWARD_CAP_RIALS = 100_000; // 10,000 toman

function rewardPercent(): number {
  const v = Number(process.env.POSTYAR_REFERRAL_PERCENT ?? DEFAULT_REWARD_PERCENT);
  return Number.isFinite(v) && v >= 0 && v <= 100 ? v : DEFAULT_REWARD_PERCENT;
}
function rewardCapRials(): number {
  const v = Number(process.env.POSTYAR_REFERRAL_CAP_RIALS ?? DEFAULT_REWARD_CAP_RIALS);
  return Number.isFinite(v) && v >= 0 ? v : DEFAULT_REWARD_CAP_RIALS;
}

export interface ReferralStats {
  referralCode: string;
  totalReferrals: number;
  totalRewardRials: number;
  totalRewardFa: string;
  referred: Array<{
    maskedEmail: string;
    maskedMobile: string;
    amountRials: number;
    amountFa: string;
    createdAt: string;
  }>;
}

function maskEmail(email: string): string {
  if (!email || !email.includes("@")) return email;
  const [u, d] = email.split("@");
  if (!u || !d) return email;
  if (u.length <= 2) return `${u[0]?.[0] ?? ""}***@${d}`;
  return `${u[0]}***@${d}`;
}

export async function getMyReferralStats(userId: string): Promise<ReferralStats> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { referralCode: true },
  });
  if (!user) throw new Error("کاربر یافت نشد.");
  const rewards = await db.referralReward.findMany({
    where: { referrerId: userId, status: "paid" },
    orderBy: { createdAt: "desc" },
  });
  const referredIds = rewards.map((r) => r.referredId);
  const referredUsers = referredIds.length
    ? await db.user.findMany({
        where: { id: { in: referredIds } },
        select: { id: true, email: true, mobile: true, createdAt: true },
      })
    : [];
  const userMap = new Map(referredUsers.map((u) => [u.id, u]));
  let totalReward = 0;
  const items = rewards.map((r) => {
    totalReward += r.amountRials;
    const ref = userMap.get(r.referredId);
    return {
      maskedEmail: maskEmail(ref?.email ?? ""),
      maskedMobile: maskMobile(ref?.mobile ?? ""),
      amountRials: r.amountRials,
      amountFa: formatRials(r.amountRials),
      createdAt: r.createdAt.toISOString(),
    };
  });
  return {
    referralCode: user.referralCode,
    totalReferrals: rewards.length,
    totalRewardRials: totalReward,
    totalRewardFa: formatRials(totalReward),
    referred: items,
  };
}

export async function getRewardForNewActiveSubscription(input: {
  newUserId: string;
  referrerId: string;
  amountRials: number;
  idempotencyKey: string;
}): Promise<{ rewardRials: number; paid: boolean }> {
  // Self-referral guard
  if (input.newUserId === input.referrerId) {
    return { rewardRials: 0, paid: false };
  }
  // Validate money
  if (!Number.isInteger(input.amountRials) || input.amountRials <= 0) {
    return { rewardRials: 0, paid: false };
  }
  // Compute reward: min(REWARD_PERCENT% of paid, CAP_RIALS)
  const pct = rewardPercent();
  const cap = rewardCapRials();
  const computed = Math.round((input.amountRials * pct) / 100);
  const rewardRials = Math.min(computed, cap);
  if (rewardRials <= 0) return { rewardRials: 0, paid: false };

  const refIdemKey = `referral:reward:${input.idempotencyKey}`;
  const refWalletIdemKey = `wallet:referral:${input.idempotencyKey}`;
  const refLedgerIdemKey = `ledger:referral:${input.idempotencyKey}`;

  try {
    const result = await db.$transaction(async (tx) => {
      // Check for existing reward for this referred user (UNIQUE constraint)
      const existing = await tx.referralReward.findUnique({
        where: { referredId: input.newUserId },
      });
      if (existing) {
        return { alreadyPaid: true as const };
      }

      // Compute current referrer balance
      const prev = await tx.walletTxn.findMany({
        where: { userId: input.referrerId },
        select: { amountRials: true, direction: true },
      });
      let running = 0;
      for (const t of prev) running += t.direction === "credit" ? t.amountRials : -t.amountRials;
      const balanceAfter = running + rewardRials;

      await tx.referralReward.upsert({
        where: { idempotencyKey: refIdemKey },
        create: {
          referrerId: input.referrerId,
          referredId: input.newUserId,
          amountRials: rewardRials,
          status: "paid",
          idempotencyKey: refIdemKey,
        },
        update: {},
      });
      await tx.walletTxn.upsert({
        where: { idempotencyKey: refWalletIdemKey },
        create: {
          userId: input.referrerId,
          amountRials: rewardRials,
          direction: "credit",
          reason: "referral_reward",
          balanceAfter,
          idempotencyKey: refWalletIdemKey,
        },
        update: {},
      });
      await tx.ledgerEntry.upsert({
        where: { idempotencyKey: refLedgerIdemKey },
        create: {
          userId: input.referrerId,
          eventType: "referral_reward",
          amountRials: rewardRials,
          currency: "IRR",
          idempotencyKey: refLedgerIdemKey,
        },
        update: {},
      });
      await tx.notification.create({
        data: {
          userId: input.referrerId,
          category: "referral",
          titleFa: "پاداش معرفی دوستان",
          bodyFa: `به‌خاطر دعوت از دوستان شما، ${formatRials(rewardRials)} به کیف پولتان افزوده شد.`,
          link: "/wallet",
        },
      });
      return { alreadyPaid: false as const };
    });

    await audit({
      userId: input.referrerId,
      actor: "system",
      action: "referral_reward_paid",
      targetType: "referral",
      targetId: input.newUserId,
      meta: {
        amountRials: rewardRials,
        alreadyPaid: result.alreadyPaid,
        idempotencyKey: input.idempotencyKey,
      },
    });
    return { rewardRials, paid: !result.alreadyPaid };
  } catch (err) {
    // UNIQUE constraint failure on `referredId` is also "already paid".
    const msg = (err as { code?: string; message?: string })?.message ?? "";
    if (msg && /unique|constraint|UNIQUE/i.test(msg)) {
      return { rewardRials: 0, paid: false };
    }
    throw err;
  }
}

export const REFERRAL_DEFAULTS = {
  percent: DEFAULT_REWARD_PERCENT,
  capRials: DEFAULT_REWARD_CAP_RIALS,
};

export function describeRewardPolicyFa(): string {
  return `پاداش معرفی برابر است با حداکثر ${toPersianDigits(rewardPercent())}٪ از مبلغ پرداختی دوست شما، تا سقف ${formatRials(rewardCapRials())} به ازای هر کاربر.`;
}
