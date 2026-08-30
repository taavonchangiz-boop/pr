// =====================================================================
// POSTYAR — Bank card settings (admin-configured destination cards)
// ---------------------------------------------------------------------
// Admins configure destination cards for card-to-card payments. The
// `cardNumberMask` field is a String column — for the Iranian
// card-to-card use case the merchant's destination PAN is the
// PUBLISHED account number customers wire money to, so we store the
// FULL formatted PAN (`1234-5678-9012-3456`) and show it to the user
// (otherwise they cannot pay). Brand color/gradient per bank lives
// in `./banks` (client-safe). Persian + RTL. No floats.
// =====================================================================
import { db } from "@/lib/db";
import { audit, AuthError } from "@/lib/server/auth";
import { fromPersianDigits, maskCard } from "@/lib/persian";
import { BANKS, BANK_NAMES, getBankMeta, isPresetBankName } from "./banks";

// Re-export so callers can `import { BANKS } from "@/lib/payments/bank-cards"`
// (per task directive). The actual data lives in the client-safe
// `./banks` module so client components can import it directly without
// pulling in `db`.
export { BANKS, BANK_NAMES, getBankMeta, isPresetBankName };
export type { BankMeta } from "./banks";

// Backward-compat alias for callers that previously consumed
// `ALLOWED_BANKS: string[]`. This now mirrors the preset bank names
// (including «سایر»); manual-entry bank names are accepted separately.
const ALLOWED_BANKS = BANK_NAMES;

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

/**
 * Format a 16-digit PAN as `1234-5678-9012-3456` for storage/display.
 * If the input is not exactly 16 digits, returns the input unchanged
 * (the caller is responsible for handling short/invalid inputs).
 */
function formatFullPan(digits: string): string {
  const clean = fromPersianDigits(digits).replace(/[^\d]/g, "");
  if (clean.length !== 16) return digits;
  return `${clean.slice(0, 4)}-${clean.slice(4, 8)}-${clean.slice(8, 12)}-${clean.slice(12)}`;
}

// ---------------------------------------------------------------------
// Admin: list / add / delete
// ---------------------------------------------------------------------
export async function listBankCards(): Promise<BankCardView[]> {
  const rows = await db.bankCard.findMany({ orderBy: { createdAt: "desc" } });
  return rows.map(toBankCardView);
}

export async function addBankCard(input: {
  cardNumber: string; // raw input — admin types the full 16-digit PAN.
  holderName: string;
  bankName: string; // preset name OR manual entry (any 2..40 char string)
  adminId: string;
  ip?: string;
}): Promise<BankCardView> {
  const digits = fromPersianDigits(input.cardNumber).replace(/[^\d]/g, "");
  if (digits.length < 4 || digits.length > 16) {
    throw new AuthError("شماره کارت باید ۱۶ رقم باشد یا حداقل ۴ رقم پایانی وارد شود.", 400);
  }

  // For the card-to-card use case the merchant's destination PAN IS the
  // published account number customers wire money to. We store the FULL
  // formatted PAN (16 digits → `1234-5678-9012-3456`) so the user can
  // see it in the beautiful card display and copy it.
  // For legacy rows where the admin typed only the last 4, we fall back
  // to a masked form (cannot reconstruct what wasn't typed).
  let cardNumberMask: string;
  if (digits.length === 16) {
    cardNumberMask = formatFullPan(digits);
  } else if (digits.length === 4) {
    cardNumberMask = `****-****-****-${digits}`;
  } else {
    // Partial input (5..15 digits) — keep last 4 only.
    const last4 = digits.slice(-4);
    cardNumberMask = `****-****-****-${last4}`;
  }

  const holder = input.holderName.trim();
  if (holder.length < 3 || holder.length > 80) {
    throw new AuthError("نام صاحب حساب نامعتبر است.", 400);
  }

  // bankName: accept preset names OR manual entry (any 2..40 char string).
  // Manual entry lets the admin add banks not in our preset list.
  const bank = input.bankName.trim();
  if (bank.length < 2 || bank.length > 40) {
    throw new AuthError("نام بانک باید بین ۲ تا ۴۰ نویسه باشد.", 400);
  }
  // If the admin picked «سایر» from the combobox but didn't provide a
  // real bank name in the manual-entry field, refuse.
  if (bank === "سایر") {
    throw new AuthError(
      "برای بانک «سایر» نام بانک را به‌صورت دستی وارد کنید.",
      400,
    );
  }

  const created = await db.bankCard.create({
    data: {
      userId: input.adminId, // ownership for audit only — cards are shared across users
      cardNumberMask,
      holderName: holder,
      bankName: bank,
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
    meta: { cardNumberMask, bankName: bank },
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

// Re-export `maskCard` so this module's public surface stays stable
// for any caller that imported masking utilities from here.
export { maskCard, ALLOWED_BANKS };
