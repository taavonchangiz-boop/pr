// =====================================================================
// POSTYAR — Discount engine
// ---------------------------------------------------------------------
// Validates and applies discount codes atomically. Money: INTEGER Rial.
// Persian error strings only.
// Atomicity: DiscountUsage(@@unique([discountId, userId])) enforces per-user
// limit; Discount.uses atomic increment with idempotency on orderId.
// =====================================================================
import { db } from "@/lib/db";
import { audit } from "@/lib/server/auth";
import { AuthError } from "@/lib/server/auth";
import { formatRials } from "@/lib/persian";

export interface ValidateDiscountInput {
  code: string;
  userId: string;
  planId?: string;
  orderAmount: number;
}

export interface ValidateDiscountResult {
  ok: boolean;
  discountId?: string;
  amountOff?: number;
  newAmount?: number;
  errorFa?: string;
}

export async function validateAndApply(
  input: ValidateDiscountInput,
): Promise<ValidateDiscountResult> {
  if (!input.code || typeof input.code !== "string") {
    return { ok: false, errorFa: "کد تخفیف الزامی است." };
  }
  if (!Number.isInteger(input.orderAmount) || input.orderAmount <= 0) {
    return { ok: false, errorFa: "مبلغ سفارش نامعتبر است." };
  }
  const code = input.code.trim().toUpperCase();
  const discount = await db.discount.findUnique({ where: { code } });
  if (!discount || !discount.active) {
    return { ok: false, errorFa: "کد تخفیف یافت نشد یا غیرفعال است." };
  }
  // Expiry
  if (discount.expiresAt && discount.expiresAt.getTime() < Date.now()) {
    return { ok: false, errorFa: "کد تخفیف منقضی شده است." };
  }
  // Total usage limit
  if (discount.maxUses > 0 && discount.uses >= discount.maxUses) {
    return { ok: false, errorFa: "سقف استفاده از این کد تکمیل شده است." };
  }
  // Per-user limit
  const userUsages = await db.discountUsage.count({
    where: { discountId: discount.id, userId: input.userId },
  });
  if (discount.perUserLimit > 0 && userUsages >= discount.perUserLimit) {
    return { ok: false, errorFa: "سقف استفاده از این کد برای شما تکمیل شده است." };
  }
  // Plan applicability
  if (input.planId) {
    const allowed = await db.discountPlan.findUnique({
      where: { discountId_planId: { discountId: discount.id, planId: input.planId } },
    });
    if (!allowed) {
      return { ok: false, errorFa: "این کد تخفیف برای طرح انتخاب‌شده قابل استفاده نیست." };
    }
  }
  // Compute amount off
  let amountOff = 0;
  if (discount.kind === "percent") {
    if (discount.value < 0 || discount.value > 100) {
      return { ok: false, errorFa: "درصد تخفیف نامعتبر است." };
    }
    amountOff = Math.round((input.orderAmount * discount.value) / 100);
    if (amountOff > input.orderAmount) amountOff = input.orderAmount;
  } else if (discount.kind === "fixed") {
    amountOff = Math.min(discount.value, input.orderAmount);
  } else {
    return { ok: false, errorFa: "نوع تخفیف نامعتبر است." };
  }
  const newAmount = input.orderAmount - amountOff;
  return {
    ok: true,
    discountId: discount.id,
    amountOff,
    newAmount,
  };
}

export async function recordUsage(input: {
  discountId: string;
  userId: string;
  orderId: string;
  adminId?: string;
  ip?: string;
}): Promise<{ ok: boolean; errorFa?: string }> {
  try {
    const result = await db.$transaction(async (tx) => {
      // Try insert DiscountUsage with @@unique([discountId, userId]) — if exists,
      // it means the user has already used this code, which is rejected upstream.
      const usage = await tx.discountUsage.create({
        data: {
          discountId: input.discountId,
          userId: input.userId,
          orderId: input.orderId,
        },
      });
      // Atomic increment — Prisma update on row by id.
      await tx.discount.update({
        where: { id: input.discountId },
        data: { uses: { increment: 1 } },
      });
      return usage;
    });
    await audit({
      userId: input.userId,
      actor: input.adminId ? "admin" : "user",
      action: "discount_used",
      targetType: "discount",
      targetId: input.discountId,
      ip: input.ip,
      meta: { orderId: input.orderId, adminId: input.adminId, usageId: result.id },
    });
    return { ok: true };
  } catch (err) {
    const msg = (err as { code?: string; message?: string })?.message ?? "";
    if (/unique|constraint|UNIQUE/i.test(msg)) {
      return { ok: false, errorFa: "شما قبلاً از این کد تخفیف استفاده کرده‌اید." };
    }
    throw err;
  }
}

// Helper to compute a discount preview without applying it — for GET /api/discounts?code=…
export async function previewDiscount(input: {
  code: string;
  userId: string;
  planId?: string;
  amount: number;
}): Promise<ValidateDiscountResult & { code?: string; descriptionFa?: string }> {
  const res = await validateAndApply({
    code: input.code,
    userId: input.userId,
    planId: input.planId,
    orderAmount: input.amount,
  });
  if (!res.ok) return res;
  const discount = await db.discount.findUnique({ where: { id: res.discountId } });
  return {
    ...res,
    code: discount?.code,
    descriptionFa: discount
      ? (discount.kind === "percent"
          ? `تخفیف ${formatRials(res.amountOff ?? 0)} (${discount.value}٪)`
          : `تخفیف ${formatRials(res.amountOff ?? 0)}`)
      : undefined,
  };
}
