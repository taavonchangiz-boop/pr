"use client";
// POSTYAR public Rules & Regulations page — dark navy theme (RTL Persian).
// Sibling of landing.tsx; same palette; sticky footer; back-to-home button.
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ScaleIcon, ShieldCheckIcon, UserIcon, FileTextIcon, CreditCardIcon,
  BanIcon, AlertTriangleIcon, MailIcon, ArrowRightIcon,
} from "lucide-react";
import { toPersianDigits } from "@/lib/persian";
import { Logo } from "@/components/layout/logo";

export interface RulesProps {
  navigate: (to: string) => void;
}

const FONT_STACK = { fontFamily: "Vazirmatn, ui-sans-serif, system-ui, sans-serif" } as const;

const SECTIONS: { icon: any; title: string; items: string[] }[] = [
  {
    icon: UserIcon,
    title: "حساب کاربری و ثبت‌نام",
    items: [
      "هر کاربر تنها می‌تواند یک حساب کاربری داشته باشد. حساب‌های تکراری بدون اطلاع قبلی حذف می‌شوند.",
      "اطلاعات وارده هنگام ثبت‌نام (نام، نام خانوادگی، ایمیل، موبایل، رمز عبور، نوع فعالیت و نام کسب‌وکار) باید دقیق و معتبر باشند.",
      "کاربر مسئول حفظ رمز عبور خود است. هر فعالیت با حساب شما، فرض بر این است که توسط شما انجام شده است.",
      "حساب کاربری غیرقابل انتقال است و فروش یا اهدای آن به شخص دیگر ممنوع است.",
      "در صورت فراموشی رمز، از مسیر بازیابی از طریق موبایل یا ایمیل ثبت‌شده استفاده کنید.",
    ],
  },
  {
    icon: FileTextIcon,
    title: "محتوا و انتشار",
    items: [
      "کاربر مالک محتوای خود است و مسئول کامل حقوق ناشر، نویسنده و تصویرساز محتوا می‌باشد.",
      "انتشار هر محتوای ناقض قوانین جریمه‌بردار است؛ مسئولیت حقوقی و کیفری با ناشر (کاربر) خواهد بود.",
      "سامانهٔ زمان‌بندی جلالی با دقت دقیقه‌ای اجرا می‌شود؛ اختلال در ارسال به‌دلیل قطعی پلتفرم مقصد (تلگرام، بله، روبیکا) قابل گذشت است.",
      "سهمیهٔ ماهانهٔ انتشار طبق پلن انتخاب‌شده است؛ پس از تکمیل سهمیه، انتشار تا شروع دورهٔ بعد متوقف می‌شود.",
    ],
  },
  {
    icon: CreditCardIcon,
    title: "پرداخت و اشتراک",
    items: [
      "تمام مبالغ به ریال و به‌صورت اعداد صحیح ثبت می‌شوند تا از خطای اعشاری جلوگیری شود.",
      "هر تراکنش مالی با کلید یکتا (idempotency) ثبت می‌شود؛ تحت هیچ شرایطی دو بار اعتبار گرفته نمی‌شود.",
      "پرداخت‌ها از طریق کارت بانکی، درگاه و بات بله قابل انجام است؛ فرایند پرداخت با تأیید سمت-سرور مبلغ انجام می‌شود.",
      "اشتراک‌ها غیرقابل استرداد پس از فعال‌سازی هستند، مگر در موارد عرفی و قانونی که پشتیبانی بررسی می‌کند.",
      "کیف پول کاربر شفاف است؛ تمام واریزها، برداشت‌ها و پاداش‌ها در دفتر کل ثبت می‌شوند.",
    ],
  },
  {
    icon: BanIcon,
    title: "محتوای ممنوع",
    items: [
      "محتوای غیرقانونی شامل ترویج خشونت، آزار اطفال، قمار غیرمجاز، پول‌شویی و ناقض امنیت ملی ممنوع است.",
      "ارسال اسپم (هرزنامه) به‌هر کانال یا کاربری منجر به تعلیق فوری حساب می‌شود.",
      "استفاده از بات‌ها برای دزدی اطلاعات یا فریب کاربران دیگر، نقض آشکار قوانین است.",
      "هرگونه تلاش برای نفوذ، مهندسی معکوس یا دور زدن محدودیت‌های سامانه، حساب را به‌طور دائم مسدود می‌کند.",
    ],
  },
  {
    icon: AlertTriangleIcon,
    title: "مسئولیت‌ها",
    items: [
      "سامانهٔ پُست‌یار «به‌همراه سرویس» است؛ هیچ تضمینی برای دسترسی‌پذیری دائم وجود ندارد.",
      "مسئولیت خسارات ناشی از استفادهٔ نادرست از سامانه با کاربر است.",
      "سامانه مسئول کیفیت سرویس‌های third-party (تلگرام، بله، روبیکا، درگاه بانکی) نیست.",
      "ما حق داریم هرگونه فعالیت مشکوک را بدون اطلاع قبلی محدود یا تعلیق کنیم.",
    ],
  },
  {
    icon: MailIcon,
    title: "تماس و پشتیبانی",
    items: [
      "برای پشتیبانی از سامانهٔ تیکت در داشبورد استفاده کنید.",
      "تماس اضطراری از طریق کانال‌های رسمی پُست‌یار انجام می‌شود.",
      "گزارش باگ‌های امنیتی به‌صورت محرمانه بررسی و پاداش دریافت می‌کنند.",
      "درخواست حذف حساب از طریق تیکت قابل انجام است؛ پس از تأیید، تمام داده‌های کاربر حذف می‌شوند.",
    ],
  },
];

export function Rules({ navigate }: RulesProps) {
  return (
    <div dir="rtl" className="min-h-screen flex flex-col bg-[#070b16] text-[#e2e8ff]" style={FONT_STACK}>
      {/* sticky header */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#070b16]/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22d3ee]/60 rounded-md"
            aria-label="بازگشت به خانه"
          >
            <Logo textClassName="text-white" />
          </button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/")}
            className="cursor-pointer border-white/15 bg-transparent text-[#e2e8ff] hover:bg-white/5"
          >
            <ArrowRightIcon className="size-4" />
            بازگشت به خانه
          </Button>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-5xl px-4 py-10">
        {/* brand banner (asovin.webp) */}
        <img
          src="/brand/asovin.webp"
          alt="نمای برند پُست‌یار"
          className="mb-8 w-full rounded-2xl border border-white/10 shadow-lg shadow-[#070b16]"
        />
        <div className="mb-10 text-center">
          <Badge className="border border-[#22d3ee]/30 bg-[#0f172a] text-[#22d3ee] hover:bg-[#0f172a]">
            <ScaleIcon className="size-3" />
            قوانین و مقررات
          </Badge>
          <h1 className="mt-3 text-3xl font-black text-white md:text-4xl">قوانین و مقررات پُست‌یار</h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-[#94a3b8]">
            استفاده از هر بخش از سامانهٔ پُست‌یار به معنی پذیرش کامل این قوانین است.
            این متن با تقویم جلالی به‌روزرسانی می‌شود.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          {SECTIONS.map((s, i) => {
            const Icon = s.icon;
            return (
              <Card
                key={i}
                className="border-white/10 bg-[#0d1322]/80 backdrop-blur motion-safe:transition-colors hover:border-[#22d3ee]/40"
              >
                <CardHeader className="border-b border-white/10">
                  <CardTitle className="flex items-center gap-3 text-base text-white">
                    <span
                      className="rounded-xl p-2 text-[#22d3ee]"
                      style={{
                        background: "linear-gradient(135deg, rgba(34,211,238,0.18), rgba(52,211,153,0.10))",
                        border: "1px solid rgba(34,211,238,0.30)",
                      }}
                    >
                      <Icon className="size-5" />
                    </span>
                    {s.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-2">
                  <ul className="space-y-2.5 text-sm leading-6 text-[#dbe7ff]/85">
                    {s.items.map((it, j) => (
                      <li key={j} className="flex items-start gap-2">
                        <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#22d3ee]" />
                        <span>{it}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div
          className="mt-10 rounded-2xl border border-[#A855F7]/25 p-6"
          style={{ background: "linear-gradient(120deg, rgba(168,85,247,0.08), rgba(34,211,238,0.04))" }}
        >
          <div className="flex items-start gap-3">
            <ShieldCheckIcon className="mt-0.5 size-5 shrink-0 text-[#34d399]" />
            <div className="text-sm leading-7 text-[#dbe7ff]/85">
              پُست‌یار رویکرد{" "}
              <span className="font-bold text-white">fail-closed</span>{" "}
              دارد؛ در صورت بروز هرگونه خطا یا ابهام، سامانه عملیات را متوقف می‌کند
              تا جانمایی مالی و امنیتی شما حفظ شود.
            </div>
          </div>
        </div>
      </main>

      {/* sticky footer */}
      <footer className="mt-auto border-t border-white/10 bg-[#05070f] py-6">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 px-4 text-xs text-[#94a3b8] md:flex-row">
          <div className="flex items-center gap-2">
            <Logo size={20} withText={false} />
            <span className="font-bold text-white">پُست‌یار</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => navigate("/")}
              className="cursor-pointer hover:text-[#22d3ee] motion-safe:transition-colors"
            >
              خانه
            </button>
          </div>
          <div>© {toPersianDigits(new Date().getFullYear() - 621)} پُست‌یار</div>
        </div>
      </footer>
    </div>
  );
}

export default Rules;
