// =====================================================================
// POSTYAR — Persian 404 page (addendum § Persian 403/404/500)
// ---------------------------------------------------------------------
// Renders inside RootLayout (Vazirmatn, RTL, theme). No English, no
// Latin digits, no stack traces, no secret leakage. The numeric code
// is shown in Persian digits (۴۰۴).
// =====================================================================
import Link from "next/link";
import { Home, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div
      className="flex min-h-[70vh] flex-col items-center justify-center gap-6 px-4 py-16 text-center"
      dir="rtl"
      role="alert"
      aria-live="polite"
    >
      <div
        className="text-7xl font-black text-primary select-none"
        aria-hidden="true"
      >
        ۴۰۴
      </div>
      <h1 className="text-2xl font-bold text-foreground">
        صفحهٔ مورد نظر پیدا نشد
      </h1>
      <p className="max-w-md text-sm leading-7 text-muted-foreground">
        آدرسی که وارد کردید ممکن است اشتباه باشد یا صفحه حذف شده باشد. لطفاً
        نشانی را بررسی کنید یا به خانهٔ پُست‌یار بازگردید.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button asChild>
          <Link href="/">
            <Home className="ml-2 size-4" aria-hidden="true" />
            بازگشت به خانه
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/#/" aria-label="ورود به پیشخوان">
            <Search className="ml-2 size-4" aria-hidden="true" />
            رفتن به پیشخوان
          </Link>
        </Button>
      </div>
    </div>
  );
}
