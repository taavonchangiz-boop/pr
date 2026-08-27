// =====================================================================
// POSTYAR — Wallet + Ledger (append-only, derived balance)
// ---------------------------------------------------------------------
// Money: INTEGER Rial minor units. NO floats.
// All mutations are atomic via Prisma $transaction with deterministic
// idempotency keys. Balance is DERIVED from WalletTxn sum — never a
// mutable balance column.
// Persian error strings only.
// =====================================================================
import { db } from "@/lib/db";
import { audit } from "@/lib/server/auth";
import { formatRials } from "@/lib/persian";

// ---------------------------------------------------------------------
// Read-side: balance + history
// ---------------------------------------------------------------------
export async function getBalance(userId: string): Promise<{ balanceRials: number; balanceFa: string }> {
  const txns = await db.walletTxn.findMany({
    where: { userId },
    select: { amountRials: true, direction: true },
  });
  let bal = 0;
  for (const t of txns) bal += t.direction === "credit" ? t.amountRials : -t.amountRials;
  return { balanceRials: bal, balanceFa: formatRials(bal) };
}

export interface WalletTxnView {
  id: string;
  amountRials: number;
  amountFa: string;
  direction: "credit" | "debit";
  reason: string;
  orderId: string | null;
  balanceAfter: number;
  createdAt: string;
}

const REASON_FA: Record<string, string> = {
  payment: "پرداخت",
  refund: "بازگاشت وجه",
  referral_reward: "پاداش معرفی",
  admin_adjust: "تنظیم توسط مدیر",
  ad_campaign: "تبلیغات",
  subscription: "اشتراک",
};

export async function getWalletHistory(
  userId: string,
  opts: { page?: number; pageSize?: number } = {},
): Promise<{ items: WalletTxnView[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, opts.pageSize ?? 20));
  const [rows, total] = await Promise.all([
    db.walletTxn.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.walletTxn.count({ where: { userId } }),
  ]);
  return {
    items: rows.map((t) => ({
      id: t.id,
      amountRials: t.amountRials,
      amountFa: formatRials(t.amountRials),
      direction: t.direction as "credit" | "debit",
      reason: REASON_FA[t.reason] ?? t.reason,
      orderId: t.orderId,
      balanceAfter: t.balanceAfter,
      createdAt: t.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize,
  };
}

export interface LedgerEntryView {
  id: string;
  eventType: string;
  amountRials: number;
  amountFa: string;
  orderId: string | null;
  currency: string;
  createdAt: string;
}

const EVENT_FA: Record<string, string> = {
  payment: "پرداخت",
  credit: "افزایش اعتبار",
  debit: "کاهش اعتبار",
  refund: "بازگاشت",
  referral_reward: "پاداش معرفی",
  admin_adjust: "تنظیم مدیر",
};

export async function getLedgerEntries(
  userId: string,
  opts: { page?: number; pageSize?: number } = {},
): Promise<{ items: LedgerEntryView[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, opts.pageSize ?? 20));
  const [rows, total] = await Promise.all([
    db.ledgerEntry.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.ledgerEntry.count({ where: { userId } }),
  ]);
  return {
    items: rows.map((t) => ({
      id: t.id,
      eventType: EVENT_FA[t.eventType] ?? t.eventType,
      amountRials: t.amountRials,
      amountFa: formatRials(t.amountRials),
      orderId: t.orderId,
      currency: t.currency,
      createdAt: t.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize,
  };
}

// ---------------------------------------------------------------------
// Write-side: admin adjust + refund (both atomic + idempotent)
// ---------------------------------------------------------------------
export async function adminAdjustWallet(input: {
  userId: string;
  amount: number; // positive=credit, negative=debit
  reason: string;
  idempotencyKey: string;
  adminId: string;
  ip?: string;
}): Promise<{ balanceRials: number }> {
  if (!Number.isInteger(input.amount) || input.amount === 0) {
    throw new Error("مبلغ باید عدد صحیح غیر صفر باشد.");
  }
  const direction = input.amount > 0 ? "credit" : "debit";
  const amountAbs = Math.abs(input.amount);

  const result = await db.$transaction(async (tx) => {
    const ledgerIdemKey = `ledger:admin_adjust:${input.idempotencyKey}`;
    const walletIdemKey = `wallet:admin_adjust:${input.idempotencyKey}`;

    // Compute current balance
    const prev = await tx.walletTxn.findMany({
      where: { userId: input.userId },
      select: { amountRials: true, direction: true },
    });
    let running = 0;
    for (const t of prev) running += t.direction === "credit" ? t.amountRials : -t.amountRials;
    const balanceAfter = running + (direction === "credit" ? amountAbs : -amountAbs);

    const walletTxn = await tx.walletTxn.upsert({
      where: { idempotencyKey: walletIdemKey },
      create: {
        userId: input.userId,
        amountRials: amountAbs,
        direction,
        reason: "admin_adjust",
        balanceAfter,
        idempotencyKey: walletIdemKey,
      },
      update: {},
    });
    await tx.ledgerEntry.upsert({
      where: { idempotencyKey: ledgerIdemKey },
      create: {
        userId: input.userId,
        eventType: "admin_adjust",
        amountRials: direction === "credit" ? amountAbs : -amountAbs,
        currency: "IRR",
        idempotencyKey: ledgerIdemKey,
      },
      update: {},
    });

    // Notify user
    await tx.notification.create({
      data: {
        userId: input.userId,
        category: "payment",
        titleFa: direction === "credit" ? "افزایش اعتبار کیف پول" : "کاهش اعتبار کیف پول",
        bodyFa:
          (direction === "credit" ? "مبلغ " : "کسر مبلغ ") +
          formatRials(amountAbs) +
          (input.reason ? ` — دلیل: ${input.reason}` : ""),
      },
    });

    return { walletTxn, balanceAfter };
  });

  await audit({
    userId: input.userId,
    actor: "admin",
    action: "wallet_adjust",
    targetType: "wallet",
    targetId: input.userId,
    ip: input.ip,
    meta: {
      adminId: input.adminId,
      direction,
      amountRials: amountAbs,
      reason: input.reason,
      balanceAfter: result.balanceAfter,
    },
  });
  return { balanceRials: result.balanceAfter };
}

export async function refund(input: {
  orderId: string;
  amount: number;
  idempotencyKey: string;
  adminId: string;
  ip?: string;
}): Promise<{ balanceRials: number }> {
  const order = await db.order.findUnique({ where: { id: input.orderId } });
  if (!order) throw new Error("سفارش یافت نشد.");
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new Error("مبلغ بازگشتی نامعتبر است.");
  }
  if (input.amount > order.amountRials) {
    throw new Error("مبلغ بازگشتی بیشتر از مبلغ سفارش است.");
  }

  const result = await db.$transaction(async (tx) => {
    const ledgerIdemKey = `ledger:refund:${input.idempotencyKey}`;
    const walletIdemKey = `wallet:refund:${input.idempotencyKey}`;

    const prev = await tx.walletTxn.findMany({
      where: { userId: order.userId },
      select: { amountRials: true, direction: true },
    });
    let running = 0;
    for (const t of prev) running += t.direction === "credit" ? t.amountRials : -t.amountRials;
    const balanceAfter = running - input.amount;

    await tx.walletTxn.upsert({
      where: { idempotencyKey: walletIdemKey },
      create: {
        userId: order.userId,
        orderId: order.id,
        amountRials: input.amount,
        direction: "debit",
        reason: "refund",
        balanceAfter,
        idempotencyKey: walletIdemKey,
      },
      update: {},
    });
    await tx.ledgerEntry.upsert({
      where: { idempotencyKey: ledgerIdemKey },
      create: {
        userId: order.userId,
        orderId: order.id,
        eventType: "refund",
        amountRials: -input.amount,
        currency: "IRR",
        idempotencyKey: ledgerIdemKey,
      },
      update: {},
    });
    await tx.notification.create({
      data: {
        userId: order.userId,
        category: "payment",
        titleFa: "بازگاشت وجه",
        bodyFa: `مبلغ ${formatRials(input.amount)} به کیف پول شما بازگشت داده شد.`,
        link: `/wallet`,
      },
    });
    return { balanceAfter };
  });

  await audit({
    userId: order.userId,
    actor: "admin",
    action: "wallet_refund",
    targetType: "order",
    targetId: order.id,
    ip: input.ip,
    meta: { adminId: input.adminId, amountRials: input.amount, balanceAfter: result.balanceAfter },
  });
  return { balanceRials: result.balanceAfter };
}
