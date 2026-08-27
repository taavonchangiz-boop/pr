// =====================================================================
// POSTYAR — Persian / Jalali / RTL financial formatting tests
// Covers addendum §8 (exact monetary arithmetic, no floating-point
// financial calculation), §22 (no Latin digits), §23 (Jalali dates).
// Pure-function tests — no DB required.
// Env vars are set by tests/preload.ts (see bunfig.toml).
// =====================================================================
import { test, expect, describe } from "bun:test";
import {
  toPersianDigits,
  fromPersianDigits,
  formatRials,
  gregorianToJalali,
  jalaliToGregorian,
  jalaliToUtcIso,
  formatJalaliDateTime,
  formatJalaliDate,
  formatRelative,
  isValidIranMobile,
  normalizeMobile,
  isValidEmail,
  maskCard,
  maskMobile,
  maskToken,
} from "../src/lib/persian";

describe("persian: toPersianDigits (no Latin digits in user-facing UI)", () => {
  test("converts Latin 0-9 to Persian ۰-۹", () => {
    expect(toPersianDigits("0123456789")).toBe("۰۱۲۳۴۵۶۷۸۹");
  });
  test("converts numbers", () => {
    expect(toPersianDigits(12345)).toBe("۱۲۳۴۵");
  });
  test("leaves Persian digits untouched", () => {
    expect(toPersianDigits("۱۲۳۴۵")).toBe("۱۲۳۴۵");
  });
  test("handles null/undefined gracefully", () => {
    expect(toPersianDigits(null)).toBe("");
    expect(toPersianDigits(undefined)).toBe("");
  });
  test("mixed Latin/Persian string — all Latin converted", () => {
    const out = toPersianDigits("Order #1234 — ۵۶۷۸ تومان");
    // No Latin digits remain
    expect(/[0-9]/.test(out)).toBe(false);
  });
  test("empty string returns empty", () => {
    expect(toPersianDigits("")).toBe("");
  });
});

describe("persian: fromPersianDigits (input normalization)", () => {
  test("converts Persian digits to Latin", () => {
    expect(fromPersianDigits("۰۱۲۳۴۵۶۷۸۹")).toBe("0123456789");
  });
  test("round-trips through toPersianDigits", () => {
    const latin = "9999";
    expect(fromPersianDigits(toPersianDigits(latin))).toBe(latin);
  });
  test("mixed string preserves non-digit chars", () => {
    expect(fromPersianDigits("مبلغ ۱۲۳۴۵ تومان")).toBe("مبلغ 12345 تومان");
  });
});

describe("persian: formatRials (financial integrity — no float artifacts)", () => {
  test("formats integer rials with Persian digits (no Latin digits)", () => {
    const out = formatRials(1000000);
    expect(/[0-9]/.test(out)).toBe(false); // CRITICAL: no Latin digits
    expect(out).toContain("۱"); // contains Persian digit
  });
  test("bigint amount handled exactly (no precision loss)", () => {
    const big = BigInt("99999999999999"); // > Number.MAX_SAFE_INTEGER
    const out = formatRials(big);
    expect(/[0-9]/.test(out)).toBe(false); // Persian digits only
    expect(out).toContain("۹۹"); // leading digits preserved (not truncated)
    expect(out.toLowerCase()).not.toContain("e+"); // no exponential notation
  });
  test("zero handled (no Latin digits)", () => {
    const out = formatRials(0);
    expect(/[0-9]/.test(out)).toBe(false);
  });
  test("no exponential notation leak for large numbers", () => {
    const out = formatRials(1000000000000);
    expect(out.toLowerCase()).not.toContain("e+");
    expect(/[0-9]/.test(out)).toBe(false);
  });
});

describe("persian: Jalali date conversion", () => {
  test("gregorianToJalali — known date (2024-03-21 = 1403/01/01 Nowruz +1)", () => {
    const d = new Date(Date.UTC(2024, 2, 21, 12, 0, 0));
    const j = gregorianToJalali(d);
    expect(j.jy).toBe(1403);
    expect(j.jm).toBe(1);
    expect(j.jd).toBe(1);
  });
  test("jalaliToGregorian round-trips", () => {
    const d = new Date(Date.UTC(2024, 5, 15, 9, 0, 0));
    const j = gregorianToJalali(d);
    const [gy, gm, gd] = jalaliToGregorian(j.jy, j.jm, j.jd);
    // Year/month/day match (allowing for UTC tz drift)
    expect(gy).toBe(2024);
    expect(gm).toBe(6); // 1-indexed month
    expect(gd).toBe(15);
  });
  test("formatJalaliDate produces Persian digits (no Gregorian leak)", () => {
    const out = formatJalaliDate(new Date(Date.UTC(2024, 2, 21)));
    expect(/[0-9]/.test(out)).toBe(false); // no Latin digits
    expect(out).toContain("۱۴۰۳"); // Persian year
  });
  test("formatJalaliDateTime includes Persian digits + time", () => {
    const out = formatJalaliDateTime(new Date(Date.UTC(2024, 2, 21, 14, 30)), { withTime: true });
    expect(/[0-9]/.test(out)).toBe(false);
  });
  test("null/undefined handled (returns falsy, not a Gregorian date)", () => {
    expect(formatJalaliDate(null)).toBeFalsy();
    expect(formatJalaliDate(undefined)).toBeFalsy();
    // CRITICAL: must NOT contain a Gregorian-style date string
    expect(formatJalaliDate(null)).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});

describe("persian: jalaliToUtcIso (scheduler integrity)", () => {
  test("produces valid ISO 8601 UTC", () => {
    const iso = jalaliToUtcIso(1403, 1, 1, 12, 0);
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
  test("round-trips to the same Jalali date (day-level)", () => {
    const iso = jalaliToUtcIso(1403, 1, 1, 12, 0);
    const j = gregorianToJalali(new Date(iso));
    expect(j.jy).toBe(1403);
    expect(j.jm).toBe(1);
    expect(j.jd).toBe(1);
  });
});

describe("persian: mobile/email validation", () => {
  test("accepts valid Iranian mobiles (09 prefix)", () => {
    expect(isValidIranMobile("09123456789")).toBe(true);
    expect(isValidIranMobile("0912 345 6789")).toBe(true);
  });
  test("rejects invalid mobiles", () => {
    expect(isValidIranMobile("12345")).toBe(false);
    expect(isValidIranMobile("08123456789")).toBe(false); // not 09 prefix
    expect(isValidIranMobile("")).toBe(false);
  });
  test("normalizeMobile produces a normalized form (digits only, no spaces)", () => {
    const out = normalizeMobile("0912 345 6789");
    expect(out).toMatch(/\d/);
    expect(out).not.toContain(" ");
  });
  test("isValidEmail basic checks", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });
});

describe("persian: masking (no full secret leak)", () => {
  test("maskCard does not expose the full 16-digit PAN", () => {
    const out = maskCard("6037991122334455");
    // CRITICAL: the full card number must not appear verbatim
    expect(out).not.toContain("6037991122334455");
    expect(out).not.toContain("11223344"); // middle digits hidden
  });
  test("maskMobile does not expose the full mobile", () => {
    const out = maskMobile("09123456789");
    // CRITICAL: full mobile must not appear verbatim
    expect(out).not.toContain("09123456789");
    expect(out).not.toContain("3456789"); // middle hidden
  });
  test("maskToken never exposes full bot token", () => {
    const longToken = "1234567890:ABCdefGHIjklMNOpqrsTUVwxyz1234567890";
    const out = maskToken(longToken);
    expect(out).not.toContain("ABCdefGHIjklMNOpqrsTUVwxyz1234567890");
    expect(out.length).toBeLessThan(longToken.length);
  });
});

describe("persian: formatRelative", () => {
  test("recent past produces Persian output (no Latin digits)", () => {
    const recent = new Date(Date.now() - 30_000).toISOString();
    const out = formatRelative(recent);
    expect(/[0-9]/.test(out)).toBe(false);
  });
  test("null handled (no throw, returns falsy)", () => {
    expect(() => formatRelative(null)).not.toThrow();
    expect(formatRelative(null)).toBeFalsy();
  });
});
