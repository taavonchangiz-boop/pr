// =====================================================================
// POSTYAR — Bank metadata (client-safe; NO db imports)
// ---------------------------------------------------------------------
// Pure-data module so both server routes (lib/payments/bank-cards.ts)
// and client components (admin/bank-cards.tsx, payment/view.tsx) can
// share the same bank list + brand colors.
//
// NO emojis. Persian names. Brand colors are the bank's commercial
// identity (NOT UI chrome — these are published brand colors of the
// institutions, used to help the user recognize the destination card).
// =====================================================================

export interface BankMeta {
  /** Persian display name (e.g. «بانک ملت», «بلو بانک»). */
  name: string;
  /** Brand color (hex) — used for the card gradient + accent. */
  color: string;
  /** CSS gradient string for the beautiful card display. */
  gradient: string;
}

// ---------------------------------------------------------------------
// Bank list — preset banks + «سایر» (manual entry). Brand colors per
// each bank's published visual identity. For «سایر» (manual entry) we
// use a neutral slate gradient as the fallback.
// ---------------------------------------------------------------------
export const BANKS: BankMeta[] = [
  {
    name: "بانک ملت",
    color: "#0066b3",
    gradient: "linear-gradient(135deg, #0074d9 0%, #0066b3 50%, #003a66 100%)",
  },
  {
    name: "بانک ملی",
    color: "#1c8c5c",
    gradient: "linear-gradient(135deg, #25a86b 0%, #1c8c5c 50%, #0e5232 100%)",
  },
  {
    name: "بانک صادرات",
    color: "#f0a500",
    gradient: "linear-gradient(135deg, #ffbf33 0%, #f0a500 50%, #8a5e00 100%)",
  },
  {
    name: "بانک تجارت",
    color: "#0a8b85",
    gradient: "linear-gradient(135deg, #12a59f 0%, #0a8b85 50%, #054a47 100%)",
  },
  {
    name: "بانک سپه",
    color: "#0072aa",
    gradient: "linear-gradient(135deg, #1a90c4 0%, #0072aa 50%, #003e60 100%)",
  },
  {
    name: "بانک پاسارگاد",
    color: "#d9b341",
    gradient: "linear-gradient(135deg, #e6c75f 0%, #d9b341 50%, #7a651f 100%)",
  },
  {
    name: "بانک پارسیان",
    color: "#5b2c8c",
    gradient: "linear-gradient(135deg, #7a3eb8 0%, #5b2c8c 50%, #2e1647 100%)",
  },
  {
    name: "بانک سامان",
    color: "#1aa3a3",
    gradient: "linear-gradient(135deg, #2cc4c4 0%, #1aa3a3 50%, #0d5a5a 100%)",
  },
  {
    name: "بانک سرمایه",
    color: "#2d8a3e",
    gradient: "linear-gradient(135deg, #3ea650 0%, #2d8a3e 50%, #154a22 100%)",
  },
  {
    name: "بانک رفاه",
    color: "#005ba9",
    gradient: "linear-gradient(135deg, #1a76c9 0%, #005ba9 50%, #002f59 100%)",
  },
  {
    name: "بانک کشاورزی",
    color: "#4a8b3d",
    gradient: "linear-gradient(135deg, #5da650 0%, #4a8b3d 50%, #244a1f 100%)",
  },
  {
    name: "بانک مسکن",
    color: "#c89028",
    gradient: "linear-gradient(135deg, #dba542 0%, #c89028 50%, #6e4d14 100%)",
  },
  {
    name: "بانک شهر",
    color: "#a32b2b",
    gradient: "linear-gradient(135deg, #c63838 0%, #a32b2b 50%, #591414 100%)",
  },
  {
    name: "بانک خاور",
    color: "#1f7a3a",
    gradient: "linear-gradient(135deg, #2a9e4c 0%, #1f7a3a 50%, #0e421e 100%)",
  },
  {
    // BluBank — brand color #1a5cff (blue-ish, per task spec).
    name: "بلو بانک",
    color: "#1a5cff",
    gradient: "linear-gradient(135deg, #3b78ff 0%, #1a5cff 50%, #0a2f8a 100%)",
  },
  {
    // سایر — neutral slate fallback for manual-entry bank names.
    name: "سایر",
    color: "#475569",
    gradient: "linear-gradient(135deg, #64748b 0%, #475569 50%, #1e293b 100%)",
  },
];

// Array of just the names — kept for backward compatibility with
// callers that previously consumed `ALLOWED_BANKS: string[]`.
export const BANK_NAMES: string[] = BANKS.map((b) => b.name);

// ---------------------------------------------------------------------
// Lookup — returns the matching BankMeta for a given name, or a
// sensible default (the «سایر» neutral gradient) for unknown names
// (e.g. when the admin entered the bank name manually).
// ---------------------------------------------------------------------
const DEFAULT_BANK: BankMeta = BANKS.find((b) => b.name === "سایر") ?? {
  name: "سایر",
  color: "#475569",
  gradient: "linear-gradient(135deg, #64748b 0%, #475569 50%, #1e293b 100%)",
};

export function getBankMeta(name: string | null | undefined): BankMeta {
  if (!name) return DEFAULT_BANK;
  const found = BANKS.find(
    (b) => b.name === name.trim() || b.name.replace(/\s+/g, "") === name.trim().replace(/\s+/g, ""),
  );
  return found ?? DEFAULT_BANK;
}

/** True if the given name matches one of the preset banks (excluding «سایر»). */
export function isPresetBankName(name: string | null | undefined): boolean {
  if (!name) return false;
  const trimmed = name.trim();
  if (trimmed === "سایر") return false;
  return BANKS.some((b) => b.name === trimmed);
}
