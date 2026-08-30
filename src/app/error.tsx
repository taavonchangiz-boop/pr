// =====================================================================
// POSTYAR — Persian 500 / runtime error boundary (addendum § Persian
// 403/404/500, § no stack trace leakage)
// ---------------------------------------------------------------------
// Renders inside RootLayout when a route segment throws. We NEVER
// expose the error message or stack trace to the end user — we show a
// calm Persian page with a recovery action. The actual error is logged
// server-side only (Next.js does this automatically).
// =====================================================================
"use client";
import Link from "next/link";
import { useEffect } from "react";
import { RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Server-side console is the only place the real error surfaces.
    // The browser never sees error.message or error.stack.
    if (typeof console !== "undefined" && typeof console.error === "function") {
      console.error("[postyar] runtime error:", error?.digest ?? "no-digest");
    }
  }, [error]);

  return (
    <div
      className="flex min-h-[70vh] flex-col items-center justify-center gap-6 px-4 py-16 text-center"
      dir="rtl"
      role="alert"
      aria-live="assertive"
    >
      <div
        className="text-7xl font-black text-destructive select-none"
        aria-hidden="true"
      >
        ۵۰۰
      </div>
      <h1 className="text-2xl font-bold text-foreground">
        خطای پیش‌بینی‌نشده رخ داد
      </h1>
      <p className="max-w-md text-sm leading-7 text-muted-foreground">
        مشکلی در نمایش این صفحه پیش آمد. می‌توانید دوباره تلاش کنید یا به خانه
        بازگردید. جزئیات فنی فقط در سامانهٔ پشتیبانی ثبت می‌شود.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button onClick={() => reset()}>
          <RefreshCw className="ml-2 size-4" aria-hidden="true" />
          تلاش دوباره
        </Button>
        <Button asChild variant="outline">
          <Link href="/">
            <Home className="ml-2 size-4" aria-hidden="true" />
            بازگشت به خانه
          </Link>
        </Button>
      </div>
    </div>
  );
}
