"use client";
// =====================================================================
// POSTYAR — Professional Jalali date-time picker
// ---------------------------------------------------------------------
// Renders a popover with year/month selectors, a Persian day grid
// (week starts on شنبه / Saturday), and 24-hour hour+minute selectors.
// All visible digits are Persian (via toPersianDigits). RTL aware.
//
// Returns `{ jy, jm, jd, hour, minute }` (Latin numeric internally) to
// `onChange`. The trigger button shows "۱۴۰۳/۰۵/۲۰ - ۱۵:۳۰".
//
// Disables invalid day combinations (e.g. 31 Esfand in non-leap year) via
// `jalaliMonthLength`. With `mode="future"`, days earlier than today are
// disabled. Friday (جمعه) is highlighted.
// =====================================================================
import { useCallback, useMemo, useState } from "react";
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import {
  gregorianToJalali,
  jalaliMonthLength,
  jalaliToGregorian,
  jalaliYearRange,
  JALALI_MONTHS,
  toPersianDigits,
} from "@/lib/persian";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type JalaliValue = {
  jy: number;
  jm: number;
  jd: number;
  hour: number;
  minute: number;
};

export type JalaliPickerMode = "future" | "any";

export interface JalaliPickerProps {
  value?: JalaliValue | null;
  onChange: (v: JalaliValue) => void;
  mode?: JalaliPickerMode;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

// Persian weekday header chars — week starts on شنبه (Saturday).
const WEEKDAY_HEADERS = ["ش", "ی", "د", "س", "چ", "پ", "ج"];

/** Returns the current Jalali year (integer). */
export function currentJalaliYear(): number {
  return gregorianToJalali(new Date()).jy;
}

/** Returns today's Jalali { jy, jm, jd } (UTC components → Jalali). */
function todayJalali(): { jy: number; jm: number; jd: number } {
  const j = gregorianToJalali(new Date());
  return { jy: j.jy, jm: j.jm, jd: j.jd };
}

/**
 * Returns the Persian-weekday index (0=شنبه, 6=جمعه) of the 1st of the
 * given Jalali month.
 */
function firstWeekdayOfJalaliMonth(jy: number, jm: number): number {
  const [gy, gm, gd] = jalaliToGregorian(jy, jm, 1);
  const jsDay = new Date(Date.UTC(gy, gm - 1, gd)).getUTCDay(); // 0=Sunday..6=Saturday
  return (jsDay + 1) % 7; // 0=شنبه (Saturday)
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatJalaliValue(v: JalaliValue): string {
  return `${toPersianDigits(v.jy)}/${toPersianDigits(pad2(v.jm))}/${toPersianDigits(pad2(v.jd))} - ${toPersianDigits(pad2(v.hour))}:${toPersianDigits(pad2(v.minute))}`;
}

function normalizeInitial(value: JalaliValue | null | undefined): JalaliValue {
  if (value && typeof value.jy === "number") {
    return {
      jy: value.jy,
      jm: Math.min(12, Math.max(1, value.jm)),
      jd: Math.min(jalaliMonthLength(value.jy, Math.min(12, Math.max(1, value.jm))), Math.max(1, value.jd)),
      hour: Math.min(23, Math.max(0, value.hour)),
      minute: Math.min(59, Math.max(0, value.minute)),
    };
  }
  // Default to now (rounded down to the current hour) so first open is sensible.
  const now = new Date();
  const j = gregorianToJalali(now);
  return {
    jy: j.jy,
    jm: j.jm,
    jd: j.jd,
    hour: now.getHours(),
    minute: now.getMinutes(),
  };
}

export function JalaliPicker({
  value,
  onChange,
  mode = "any",
  placeholder = "انتخاب تاریخ و زمان",
  disabled = false,
  className,
}: JalaliPickerProps) {
  const [open, setOpen] = useState(false);
  const v = useMemo(() => normalizeInitial(value), [value]);

  // The picker's "view" month/year — separate from the selected value so the
  // user can browse without committing. When the popover opens we sync the
  // view back to the selected value so the user always starts from the
  // selected month.
  const [viewJy, setViewJy] = useState<number>(v.jy);
  const [viewJm, setViewJm] = useState<number>(v.jm);
  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (nextOpen) {
      setViewJy(v.jy);
      setViewJm(v.jm);
    }
    setOpen(nextOpen);
  }, [v.jy, v.jm]);

  const today = useMemo(() => todayJalali(), []);

  // Build the years list (current ± 10).
  const years = useMemo(() => jalaliYearRange(currentJalaliYear(), 10), []);
  const monthLength = useMemo(() => jalaliMonthLength(viewJy, viewJm), [viewJy, viewJm]);
  const firstWeekday = useMemo(() => firstWeekdayOfJalaliMonth(viewJy, viewJm), [viewJy, viewJm]);

  const prevMonth = useCallback(() => {
    if (viewJm === 1) {
      setViewJm(12);
      setViewJy((y) => y - 1);
    } else {
      setViewJm((m) => m - 1);
    }
  }, [viewJm]);

  const nextMonth = useCallback(() => {
    if (viewJm === 12) {
      setViewJm(1);
      setViewJy((y) => y + 1);
    } else {
      setViewJm((m) => m + 1);
    }
  }, [viewJm]);

  const isFutureMode = mode === "future";

  function dayDisabled(dayNum: number): boolean {
    if (dayNum > monthLength) return true;
    if (!isFutureMode) return false;
    // Past-date prevention: compare Jalali date tuples.
    if (viewJy < today.jy) return true;
    if (viewJy === today.jy && viewJm < today.jm) return true;
    if (viewJy === today.jy && viewJm === today.jm && dayNum < today.jd) return true;
    return false;
  }

  function commitDay(dayNum: number) {
    if (dayDisabled(dayNum)) return;
    const next: JalaliValue = { ...v, jy: viewJy, jm: viewJm, jd: dayNum };
    onChange(next);
  }

  function commitHour(hourStr: string) {
    const hour = Number(hourStr);
    if (Number.isNaN(hour)) return;
    onChange({ ...v, hour });
  }

  function commitMinute(minStr: string) {
    const minute = Number(minStr);
    if (Number.isNaN(minute)) return;
    onChange({ ...v, minute });
  }

  // Build the cells: `firstWeekday` blanks then 1..monthLength.
  const cells: Array<number | null> = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= monthLength; d++) cells.push(d);
  // Pad trailing to a multiple of 7 for visual cleanliness.
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("justify-start gap-2 font-normal", className)}
        >
          <CalendarIcon className="size-4 opacity-60" />
          <span className={cn(value ? "" : "text-muted-foreground")}>
            {value ? formatJalaliValue(v) : placeholder}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[20rem] p-3" align="start">
        <div className="flex flex-col gap-3" dir="rtl">
          {/* Year + Month selectors */}
          <div className="flex gap-2">
            <Select
              value={String(viewJy)}
              onValueChange={(val) => setViewJy(Number(val))}
            >
              <SelectTrigger className="w-[5.5rem]">
                <SelectValue placeholder="سال" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {toPersianDigits(y)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={String(viewJm)}
              onValueChange={(val) => setViewJm(Number(val))}
            >
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="ماه" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {JALALI_MONTHS.map((name, idx) => (
                  <SelectItem key={name} value={String(idx + 1)}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Month navigation row */}
          <div className="flex items-center justify-between">
            <Button type="button" variant="ghost" size="icon" onClick={prevMonth} aria-label="ماه قبل">
              <ChevronRightIcon className="size-4" />
            </Button>
            <div className="text-sm font-medium">
              {JALALI_MONTHS[viewJm - 1]} {toPersianDigits(viewJy)}
            </div>
            <Button type="button" variant="ghost" size="icon" onClick={nextMonth} aria-label="ماه بعد">
              <ChevronLeftIcon className="size-4" />
            </Button>
          </div>

          {/* Weekday header */}
          <div className="grid grid-cols-7 gap-1 text-center text-[0.7rem] text-muted-foreground">
            {WEEKDAY_HEADERS.map((h) => (
              <div key={h} className={cn("py-1", h === "ج" && "text-accent-foreground font-semibold")}>
                {h}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {cells.map((cell, idx) => {
              if (cell === null) {
                return <div key={idx} className="aspect-square" />;
              }
              const isFriday = (idx % 7) === 6;
              const isToday =
                viewJy === today.jy && viewJm === today.jm && cell === today.jd;
              const isSelected =
                v.jy === viewJy && v.jm === viewJm && v.jd === cell;
              const off = dayDisabled(cell);
              return (
                <button
                  key={idx}
                  type="button"
                  disabled={off}
                  onClick={() => commitDay(cell)}
                  className={cn(
                    "aspect-square rounded-md text-xs transition-colors",
                    "hover:bg-accent hover:text-accent-foreground",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    off && "cursor-not-allowed opacity-30 hover:bg-transparent",
                    isFriday && !off && "text-accent-foreground font-semibold",
                    isToday && !isSelected && "ring-1 ring-ring/40",
                    isSelected && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                  )}
                >
                  {toPersianDigits(cell)}
                </button>
              );
            })}
          </div>

          {/* Hour + Minute selectors */}
          <div className="flex items-center gap-2 border-t pt-2">
            <span className="text-xs text-muted-foreground">ساعت</span>
            <Select value={pad2(v.hour)} onValueChange={commitHour}>
              <SelectTrigger className="w-[4.5rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {Array.from({ length: 24 }, (_, i) => i).map((h) => (
                  <SelectItem key={h} value={pad2(h)}>
                    {toPersianDigits(pad2(h))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">دقیقه</span>
            <Select value={pad2(v.minute)} onValueChange={commitMinute}>
              <SelectTrigger className="w-[4.5rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {Array.from({ length: 60 }, (_, i) => i).map((m) => (
                  <SelectItem key={m} value={pad2(m)}>
                    {toPersianDigits(pad2(m))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default JalaliPicker;
