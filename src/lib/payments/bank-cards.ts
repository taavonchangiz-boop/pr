// =====================================================================
// POSTYAR — Bank card settings (admin-configured destination cards)
// ---------------------------------------------------------------------
// Admins configure destination cards for card-to-card payments. We NEVER
// store the full PAN — only the last 4 digits + bank name + holder name.
// The "cardNumberMask" field is normalized to "1234-****-****-5678".
// Persian + RTL. No floats.
// =====================================================================
import { db } from "@/lib/db";
import { audit, AuthError } from "@/lib/server/auth";
import { fromPersianDigits, maskCard } from "@/lib/persian";

const ALLOWED_BANKS = [
  "ملت", "سامان", "ملی", "تجارت", "سپه", "رفع کارگران", "کشاورزی",
  "مسکن", "پاسارگاد", "پارسیان", "سرمایه", "اقتصاد نوین", "صادرات",
  "شهر", "صنعت و معدن", "توسعه تعاون", "آینده", "انسانی", "پست بانک",
  "رسالت", "سینا", "خاورمیانه", "مهر ایران", "گردشگری", "حکمت",
  "دی", "مهر", "نهال", "کارآفرین", "نور",
];

export interface BankCardView {
  id: string;
  cardNumberMask: string;
  holderName: string;
  bankName: string;
  active: boolean;
  createdAt: string;
}

function toBankCardView(b: {
  id: string;
  cardNumberMask: string;
  holderName: string;
  bankName: string;
  active: boolean;
  createdAt: Date;
}): BankCardView {
  return {
    id: b.id,
    cardNumberMask: b.cardNumberMask,
    holderName: b.holderName,
    bankName: b.bankName,
    active: b.active,
    createdAt: b.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------
// Admin: list / add / delete
// ---------------------------------------------------------------------
export async function listBankCards(): Promise<BankCardView[]> {
  const rows = await db.bankCard.findMany({ orderBy: { createdAt: "desc" } });
  return rows.map(toBankCardView);
}

export async function addBankCard(input: {
  cardNumber: string; // raw input — admin types only last 4 + middle. We mask the moment it lands.
  holderName: string;
  bankName: string;
  adminId: string;
  ip?: string;
}): Promise<BankCardView> {
  const digits = fromPersianDigits(input.cardNumber).replace(/[^\d]/g, "");
  if (digits.length < 4 || digits.length > 16) {
    throw new AuthError("شماره کارت باید ۱۶ رقم باشد یا حداقل ۴ رقم پایانی وارد شود.", 400);
  }
  // NEVER store the full PAN. If we got 16 digits, keep only the masked form.
  // If we got fewer than 16 (admin only typed last 4), pad to the masked form.
  let cardNumberMask: string;
  if (digits.length === 16) {
    cardNumberMask = maskCard(digits);
  } else if (digits.length === 4) {
    // Admin provided only the last 4 — that's the legitimate minimal-input case
    cardNumberMask = `****-****-****-${digits}`;
  } else {
    // Build a partial mask with what we got — keep last 4 only.
    const last4 = digits.slice(-4);
    cardNumberMask = `****-****-****-${last4}`;
  }
  const holder = input.holderName.trim();
  if (holder.length < 3 || holder.length > 80) {
    throw new AuthError("نام صاحب حساب نامعتبر است.", 400);
  }
  if (!ALLOWED_BANKS.includes(input.bankName.trim())) {
    throw new AuthError("نام بانک در فهرست بانک‌های پشتیبانی‌شده نیست.", 400);
  }
  const created = await db.bankCard.create({
    data: {
      userId: input.adminId, // ownership for audit only — cards are shared across users
      cardNumberMask,
      holderName: holder,
      bankName: input.bankName.trim(),
      active: true,
    },
  });
  await audit({
    userId: input.adminId,
    actor: "admin",
    action: "bank_card_added",
    targetType: "bank_card",
    targetId: created.id,
    ip: input.ip,
    meta: { cardNumberMask, bankName: input.bankName },
  });
  return toBankCardView(created);
}

export async function deleteBankCard(input: {
  id: string;
  adminId: string;
  ip?: string;
}): Promise<{ ok: boolean }> {
  const existing = await db.bankCard.findUnique({ where: { id: input.id } });
  if (!existing) throw new AuthError("کارت یافت نشد.", 404);
  await db.bankCard.delete({ where: { id: input.id } });
  await audit({
    userId: input.adminId,
    actor: "admin",
    action: "bank_card_deleted",
    targetType: "bank_card",
    targetId: input.id,
    ip: input.ip,
    meta: { cardNumberMask: existing.cardNumberMask },
  });
  return { ok: true };
}

export async function toggleBankCard(input: {
  id: string;
  active: boolean;
  adminId: string;
  ip?: string;
}): Promise<BankCardView> {
  const updated = await db.bankCard.update({
    where: { id: input.id },
    data: { active: input.active },
  });
  await audit({
    userId: input.adminId,
    actor: "admin",
    action: "bank_card_toggled",
    targetType: "bank_card",
    targetId: input.id,
    ip: input.ip,
    meta: { active: input.active },
  });
  return toBankCardView(updated);
}

export { ALLOWED_BANKS };
