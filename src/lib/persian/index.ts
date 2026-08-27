// =====================================================================
// POSTYAR — Persian/Jalali utilities (no external deps)
// Clean, correct, time-tested algorithms.
// Persian epoch: 1 Farvardin 1 = 22 March 622 proleptic Gregorian.
// =====================================================================

const PERSIAN_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
const J_MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];
const J_WEEKDAYS = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"];

export function toPersianDigits(input: string | number | null | undefined): string {
  if (input === null || input === undefined) return "";
  return String(input).replace(/[0-9]/g, (d) => PERSIAN_DIGITS[Number(d)] ?? d);
}

export function fromPersianDigits(input: string): string {
  if (!input) return "";
  return input.replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)));
}

export function formatRials(rials: number | bigint): string {
  const n = typeof rials === "bigint" ? rials.toString() : Math.round(rials || 0).toString();
  const withSep = n.replace(/\B(?=(\d{3})+(?!\d))/g, "٬");
  return `${toPersianDigits(withSep)} ریال`;
}

export function formatCompactRials(rials: number): string {
  if (rials >= 1_000_000_000) return `${toPersianDigits((rials / 1_000_000_000).toFixed(1))} میلیارد ریال`;
  if (rials >= 1_000_000) return `${toPersianDigits((rials / 1_000_000).toFixed(1))} میلیون ریال`;
  if (rials >= 1_000) return `${toPersianDigits((rials / 1_000).toFixed(0))} هزار ریال`;
  return formatRials(rials);
}

// ---------------------------------------------------------------------
// Jalali leap year — set {1,5,9,13,17,22,26,30} modulo 33 (jalaali-js)
// ---------------------------------------------------------------------
function isLeapJalali(jy: number): boolean {
  const m = ((jy % 33) + 33) % 33;
  return [1, 5, 9, 13, 17, 22, 26, 30].includes(m);
}

const DAYS_IN_JALALI_MONTH = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 29];
const PERSIAN_EPOCH_JDN = 1948321; // JDN of 1 Farvardin 1 (22 March 622 proleptic Gregorian)

function gregorianToJdn(gy: number, gm: number, gd: number): number {
  const a = Math.floor((14 - gm) / 12);
  const y = gy + 4800 - a;
  const m = gm + 12 * a - 3;
  return gd + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
}

function jdnToGregorian(jdn: number): [number, number, number] {
  const a = jdn + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor((146097 * b) / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  const day = e - Math.floor((153 * m + 2) / 5) + 1;
  const month = m + 3 - 12 * Math.floor(m / 10);
  const year = 100 * b + d - 4800 + Math.floor(m / 10);
  return [year, month, day];
}

function jalaliToJdn(jy: number, jm: number, jd: number): number {
  let total = 0;
  for (let y = 1; y < jy; y++) total += isLeapJalali(y) ? 366 : 365;
  for (let m = 1; m < jm; m++) {
    total += DAYS_IN_JALALI_MONTH[m - 1];
    if (m === 12 && isLeapJalali(jy)) total += 1;
  }
  total += jd - 1;
  return PERSIAN_EPOCH_JDN + total;
}

function jdnToJalali(jdn: number): { jy: number; jm: number; jd: number } {
  let total = jdn - PERSIAN_EPOCH_JDN;
  let jy = 1;
  while (jy < 10000) {
    const diy = isLeapJalali(jy) ? 366 : 365;
    if (total < diy) break;
    total -= diy;
    jy++;
  }
  let jm = 1;
  while (jm <= 12) {
    const dim = DAYS_IN_JALALI_MONTH[jm - 1] + (jm === 12 && isLeapJalali(jy) ? 1 : 0);
    if (total < dim) break;
    total -= dim;
    jm++;
  }
  return { jy, jm, jd: total + 1 };
}

/** Convert a Gregorian Date (UTC components) to Jalali. */
export function gregorianToJalali(date: Date): { jy: number; jm: number; jd: number; weekday: number } {
  const gy = date.getUTCFullYear();
  const gm = date.getUTCMonth() + 1;
  const gd = date.getUTCDate();
  const jdn = gregorianToJdn(gy, gm, gd);
  const { jy, jm, jd } = jdnToJalali(jdn);
  const weekday = new Date(Date.UTC(gy, gm - 1, gd)).getUTCDay();
  return { jy, jm, jd, weekday };
}

/** Convert Jalali y/m/d to Gregorian [y,m,d]. */
export function jalaliToGregorian(jy: number, jm: number, jd: number): [number, number, number] {
  return jdnToGregorian(jalaliToJdn(jy, jm, jd));
}

/** Convert Jalali y/m/d + hour:min (Tehran TZ) to UTC ISO. */
export function jalaliToUtcIso(jy: number, jm: number, jd: number, hour: number, minute: number): string {
  const [gy, gm, gd] = jalaliToGregorian(jy, jm, jd);
  const d = new Date(Date.UTC(gy, gm - 1, gd, hour, minute, 0, 0));
  // Tehran is UTC+3:30. UTC = local - 3:30.
  const utcMs = d.getTime() - (3.5 * 60 * 60 * 1000);
  return new Date(utcMs).toISOString();
}

export function formatJalaliDateTime(iso: string | Date | null | undefined, opts?: { withTime?: boolean; withSeconds?: boolean }): string {
  if (!iso) return "";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (isNaN(d.getTime())) return "";
  const tzOffset = 3.5 * 60 * 60 * 1000;
  const tehran = new Date(d.getTime() + tzOffset);
  const j = gregorianToJalali(tehran);
  const wd = J_WEEKDAYS[tehran.getUTCDay()];
  const yyyy = toPersianDigits(j.jy);
  const mm = J_MONTHS[j.jm - 1];
  const dd = toPersianDigits(j.jd);
  if (opts?.withTime) {
    const hh = toPersianDigits(String(tehran.getUTCHours()).padStart(2, "0"));
    const mi = toPersianDigits(String(tehran.getUTCMinutes()).padStart(2, "0"));
    if (opts?.withSeconds) {
      const ss = toPersianDigits(String(tehran.getUTCSeconds()).padStart(2, "0"));
      return `${yyyy} ${mm} ${dd}، ${wd} - ${hh}:${mi}:${ss}`;
    }
    return `${yyyy} ${mm} ${dd}، ${wd} - ${hh}:${mi}`;
  }
  return `${yyyy} ${mm} ${dd}، ${wd}`;
}

export function formatJalaliDate(iso: string | Date | null | undefined): string {
  return formatJalaliDateTime(iso, { withTime: false });
}

export function formatJalaliTime(iso: string | Date | null | undefined): string {
  if (!iso) return "";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (isNaN(d.getTime())) return "";
  const tzOffset = 3.5 * 60 * 60 * 1000;
  const tehran = new Date(d.getTime() + tzOffset);
  const hh = toPersianDigits(String(tehran.getUTCHours()).padStart(2, "0"));
  const mi = toPersianDigits(String(tehran.getUTCMinutes()).padStart(2, "0"));
  return `${hh}:${mi}`;
}

export function formatRelative(iso: string | Date | null | undefined): string {
  if (!iso) return "";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (isNaN(d.getTime())) return "";
  const diffMs = Date.now() - d.getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return `${toPersianDigits(Math.max(1, sec))} ثانیه پیش`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${toPersianDigits(min)} دقیقه پیش`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${toPersianDigits(hr)} ساعت پیش`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${toPersianDigits(day)} روز پیش`;
  return formatJalaliDate(d);
}

export function isValidIranMobile(input: string): boolean {
  const normalized = fromPersianDigits(input).replace(/[^\d]/g, "");
  return /^09\d{9}$/.test(normalized);
}

export function normalizeMobile(input: string): string {
  return fromPersianDigits(input).replace(/[^\d]/g, "");
}

export function isValidEmail(input: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.trim());
}

export function maskCard(card: string): string {
  const s = fromPersianDigits(card).replace(/[^\d]/g, "");
  if (s.length < 16) return card;
  return `${s.slice(0, 4)}-****-****-${s.slice(12)}`;
}

export function maskMobile(mobile: string): string {
  const s = normalizeMobile(mobile);
  if (s.length < 11) return mobile;
  return `${s.slice(0, 4)}***${s.slice(7)}`;
}

export function maskToken(token: string): string {
  if (!token) return "";
  if (token.length <= 8) return "••••";
  return `••••••••${token.slice(-4)}`;
}

export const JALALI_MONTHS = J_MONTHS;
export const JALALI_WEEKDAYS = J_WEEKDAYS;

export function jalaliYearRange(centerYear: number, span: number = 10): number[] {
  const out: number[] = [];
  for (let i = centerYear - span; i <= centerYear + span; i++) out.push(i);
  return out;
}

export function jalaliMonthLength(jy: number, jm: number): number {
  if (jm === 12 && isLeapJalali(jy)) return 30;
  return DAYS_IN_JALALI_MONTH[jm - 1] ?? 31;
}

export { isLeapJalali };
