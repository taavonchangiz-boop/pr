"use client";
// POSTYAR branded logo — a rounded gradient tile with a paper-plane + signal
// arcs mark. Uses useId so the inline SVG gradient id stays unique across
// multiple instances on the same page.
import { useId } from "react";
import { cn } from "@/lib/utils";

export function Logo({
  className,
  withText = true,
  size = 32,
  textClassName,
}: {
  className?: string;
  withText?: boolean;
  size?: number;
  textClassName?: string;
}) {
  const gid = useId().replace(/:/g, "");
  return (
    <span className={cn("inline-flex select-none items-center gap-2", className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        role="img"
        aria-label="نماد پُست‌یار"
      >
        <defs>
          <linearGradient
            id={`postyar-grad-${gid}`}
            x1="0"
            y1="0"
            x2="48"
            y2="48"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#0d9488" />
            <stop offset="0.55" stopColor="#0d4f4f" />
            <stop offset="1" stopColor="#caa84b" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="48" height="48" rx="12" fill={`url(#postyar-grad-${gid})`} />
        {/* signal arcs */}
        <path d="M16 17c-3.2 3.2-3.2 10.8 0 14" stroke="#ffffff" strokeWidth="2.4" strokeLinecap="round" opacity="0.85" />
        <path d="M11.5 12.5c-5.5 5.5-5.5 17.5 0 23" stroke="#ffffff" strokeWidth="2.4" strokeLinecap="round" opacity="0.45" />
        {/* paper plane */}
        <path d="M37 13L13 24.2l8.2 3.1 3.1 8.2 4.2-9.1 8.5-13.4z" fill="#ffffff" />
        <path d="M21.2 27.3l8.3-13.1" stroke="#0d4f4f" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
      {withText && (
        <span
          className={cn("font-extrabold tracking-tight", textClassName)}
          style={{ fontFamily: 'Vazirmatn, ui-sans-serif, system-ui, sans-serif' }}
        >
          پُست‌یار
        </span>
      )}
    </span>
  );
}

export default Logo;
