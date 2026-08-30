"use client";
// POSTYAR live header clock — Jalali weekday + day + month + year, 24-hour
// Tehran time, updates every second. Persian digits enforced.
import { useEffect, useState } from "react";
import { gregorianToJalali, JALALI_MONTHS, JALALI_WEEKDAYS, toPersianDigits } from "@/lib/persian";
import { cn } from "@/lib/utils";

export function HeaderClock({ className }: { className?: string }) {
  const [label, setLabel] = useState<string>("");

  useEffect(() => {
    const fmt = () => {
      // Tehran = UTC+3:30. Shift now into a Date whose UTC components are
      // Tehran-local so the Jalali conversion matches wall-clock time.
      const tehran = new Date(Date.now() + 3.5 * 60 * 60 * 1000);
      const j = gregorianToJalali(tehran);
      const wd = JALALI_WEEKDAYS[tehran.getUTCDay()] ?? "";
      const day = toPersianDigits(j.jd);
      const month = JALALI_MONTHS[j.jm - 1] ?? "";
      const year = toPersianDigits(j.jy);
      const hh = toPersianDigits(String(tehran.getUTCHours()).padStart(2, "0"));
      const mi = toPersianDigits(String(tehran.getUTCMinutes()).padStart(2, "0"));
      setLabel(`${wd} ${day} ${month} ${year} - ${hh}:${mi}`);
    };
    fmt();
    const iv = setInterval(fmt, 1000);
    return () => clearInterval(iv);
  }, []);

  return (
    <span
      className={cn("tabular-nums text-xs text-muted-foreground", className)}
      dir="rtl"
      aria-live="polite"
    >
      {label}
    </span>
  );
}

export default HeaderClock;
