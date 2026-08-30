"use client";
// POSTYAR public Training page — dark navy theme (RTL Persian).
// Numbered step-by-step guides for using the platform's core features.
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  RocketIcon, PlusCircleIcon, PenSquareIcon, CalendarClockIcon,
  BotIcon, CpuIcon, WalletIcon, ArrowRightIcon, ArrowLeftIcon,
} from "lucide-react";
import { toPersianDigits } from "@/lib/persian";
import { Logo } from "@/components/layout/logo";

export interface TrainingProps {
  navigate: (to: string) => void;
}

const FONT_STACK = { fontFamily: "Vazirmatn, ui-sans-serif, system-ui, sans-serif" } as const;

const STEPS: { icon: any; title: string; intro: string; points: string[] }[] = [
  {
    icon: RocketIcon,
    title: "شروع کار",
    intro: "ثبت‌نام کنید و وارد داشبورد شوید؛ اولین کاربر به‌طور خودکار مدیر سامانه می‌شود.",
    points: [
      "روی دکمهٔ «ثبت‌نام» در صفحهٔ اصلی کلیک کنید.",
      "نام، نام خانوادگی، ایمیل، موبایل، رمز عبور و نوع فعالیت را وارد کنید.",
      "پس از ساخت حساب، به‌صورت خودکار وارد و به داشبورد هدایت می‌شوید.",
      "اگر کد معرف دارید، آن را وارد کنید تا پاداش ارجاع ثبت شود.",
    ],
  },
  {
    icon: PlusCircleIcon,
    title: "افزودن کانال",
    intro: "یک کانال یا گروه تلگرام، بله یا روبیکا را به‌عنوان مقصد انتشار اضافه کنید.",
    points: [
      "از منوی داشبورد به بخش «کانال‌ها» یا «مقصد» بروید.",
      "روی «افزودن کانال جدید» کلیک کنید و پلتفرم را انتخاب کنید.",
      "توکن بات را از BotFather تلگرام یا سامانهٔ مشابه بله/روبیکا دریافت و در فرم وارد کنید.",
      "شناسهٔ کانال یا گروه (chat_id) را وارد و وضعیت را فعال کنید.",
      "توکن شما با AES-256-GCM رمزنگاری و در دیتابیس ذخیره می‌شود.",
    ],
  },
  {
    icon: PenSquareIcon,
    title: "ساخت محتوا",
    intro: "متن، تصویر، ویدیو و دکمه‌های شیشه‌ای را در ویرایشگر فارسی و راست‌چین بسازید.",
    points: [
      "از داشبورد به بخش «محتوا» یا «پست» بروید و «محتوای جدید» را انتخاب کنید.",
      "متن فارسی را در ویرایشگر وارد کنید؛ ارقام به‌صورت خودکار فارسی می‌شوند.",
      "تصویر یا ویدیو را بارگذاری کنید؛ فایل‌ها از نظر امنیتی بازبینی می‌شوند.",
      "دکمه‌های شیشه‌ای (Inline) را با برچسب و آدرس یا callback اضافه کنید.",
      "محتوا را به‌صورت پیش‌نویس ذخیره یا در فهرست محتوا برای انتشار آماده کنید.",
    ],
  },
  {
    icon: CalendarClockIcon,
    title: "زمان‌بندی انتشار",
    intro: "انتشار را با تقویم جلالی برای تاریخ و ساعت دقیق برنامه‌ریزی کنید.",
    points: [
      "از ویرایشگر محتوا، روی «زمان‌بندی» کلیک کنید.",
      "تاریخ را از تقویم جلالی انتخاب کنید؛ ماه‌ها به فارسی نمایش داده می‌شوند.",
      "ساعت و دقیقه را انتخاب کنید (بر اساس منطقهٔ زمانی تهران).",
      "مقصد یا مقاصد (چند کانال هم‌زمان) را انتخاب کنید.",
      "روی «انتشار برنامه‌ریزی‌شده» کلیک کنید؛ سامانه در زمان مقرر آن را منتشر می‌کند.",
    ],
  },
  {
    icon: BotIcon,
    title: "بات‌ساز",
    intro: "بدون کدنویسی، بات تلگرام، بله یا روبیکا بسازید و گردش کار واقعی تعریف کنید.",
    points: [
      "به بخش «بات‌ها» بروید و «بات جدید» را انتخاب کنید.",
      "توکن بات را وارد کنید؛ سامانه به‌صورت خودکار وب‌هوک را با امضای HMAC تنظیم می‌کند.",
      "پیام خوش‌آمدگویی و گام‌های منو را در تنظیم‌گراف گردش کار وارد کنید.",
      "اقدامات «ارسال فاکتور بله»، «نمایش کیف پول»، «پایش طلا» و «پشتیبانی» را متصل کنید.",
      "کاربران بات با کد یکبار مصرف امضا‌دار به حساب پُست‌یار متصل می‌شوند.",
    ],
  },
  {
    icon: CpuIcon,
    title: "ابزار هوش مصنوعی",
    intro: "کپشن، متن هوشمند و پاسخ‌گوی خودکار را با هوش مصنوعی تولید کنید.",
    points: [
      "در ویرایشگر محتوا، روی «تولید با هوش مصنوعی» کلیک کنید.",
      "موضوع، لحن و طول مورد نظر را به فارسی وارد کنید.",
      "متن پیشنهادی را بازبینی و ویرایش کنید؛ سهمیهٔ ماهانه طبق پلن شما محاسبه می‌شود.",
      "پاسخ‌گوی خودکار برای پاسخ هوشمند به پیام‌های دریافتی بات فعال می‌شود.",
      "گزارش استفادهٔ هوش مصنوعی در داشبورد قابل مشاهده است.",
    ],
  },
  {
    icon: WalletIcon,
    title: "پرداخت و کیف پول",
    intro: "کیف پول خود را شارژ کنید، اشتراک فعال کنید و تراکنش‌ها را در دفتر کل پیگیری کنید.",
    points: [
      "از داشبورد به بخش «کیف پول» بروید و مبلغ شارژ را وارد کنید.",
      "روش پرداخت را انتخاب کنید: کارت بانکی، درگاه، یا بات بله.",
      "پس از تأیید پرداخت، مبلغ به‌صورت عدد صحیح ریال در کیف پول شما ثبت می‌شود.",
      "از بخش «اشتراک»، پلن دلخواه را انتخاب و کیف پول را برای پرداخت کسرید کنید.",
      "تمام واریزها، برداشت‌ها و پاداش‌ها در «دفتر کل» قابل پیگیری هستند.",
    ],
  },
];

export function Training({ navigate }: TrainingProps) {
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
          <Badge className="border border-[#34d399]/30 bg-[#0f172a] text-[#34d399] hover:bg-[#0f172a]">
            <RocketIcon className="size-3" />
            آموزش
          </Badge>
          <h1 className="mt-3 text-3xl font-black text-white md:text-4xl">آموزش گام‌به‌گام پُست‌یار</h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-[#94a3b8]">
            در هفت گام ساده، از ثبت‌نام تا انتشار و بات‌سازی، با همهٔ قابلیت‌های پُست‌یار آشنا شوید.
          </p>
        </div>

        <ol className="relative space-y-6">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            return (
              <li
                key={i}
                className="relative rounded-2xl border border-white/10 bg-[#0d1322]/80 p-5 backdrop-blur motion-safe:transition-colors hover:border-[#22d3ee]/40 md:p-6"
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-start">
                  {/* numbered badge with icon */}
                  <div className="flex items-center gap-3 md:flex-col md:items-center md:gap-2">
                    <div
                      className="flex size-12 items-center justify-center rounded-full text-lg font-black text-[#05070f]"
                      style={{ background: "linear-gradient(135deg, #22d3ee, #34d399)" }}
                      aria-hidden="true"
                    >
                      {toPersianDigits(i + 1)}
                    </div>
                    <span
                      className="rounded-xl p-2 text-[#22d3ee]"
                      style={{
                        background: "linear-gradient(135deg, rgba(34,211,238,0.18), rgba(56,189,248,0.10))",
                        border: "1px solid rgba(34,211,238,0.30)",
                      }}
                    >
                      <Icon className="size-5" />
                    </span>
                  </div>
                  {/* body */}
                  <div className="flex-1">
                    <h2 className="text-lg font-bold text-white md:text-xl">{s.title}</h2>
                    <p className="mt-1 text-sm leading-6 text-[#94a3b8]">{s.intro}</p>
                    <ul className="mt-4 space-y-2 text-sm leading-6 text-[#dbe7ff]/85">
                      {s.points.map((p, j) => (
                        <li key={j} className="flex items-start gap-2">
                          <ArrowLeftIcon className="mt-0.5 size-4 shrink-0 text-[#22d3ee]" />
                          <span>{p}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>

        <div
          className="mt-10 rounded-2xl border border-[#f59e0b]/25 p-6"
          style={{ background: "linear-gradient(120deg, rgba(245,158,11,0.10), rgba(168,85,247,0.06))" }}
        >
          <div className="flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-base font-bold text-white">آمادهٔ شروع هستید؟</h3>
              <p className="mt-1 text-sm leading-6 text-[#94a3b8]">
                همین حالا حساب کاربری بسازید و منتشر کردن را آغاز کنید.
              </p>
            </div>
            <Button
              onClick={() => navigate("/")}
              className="cursor-pointer bg-[#f59e0b] text-[#05070f] font-bold hover:bg-[#f59e0b]/90 border border-[#f59e0b]/40"
            >
              بازگشت به خانه
              <ArrowLeftIcon className="size-4" />
            </Button>
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
            <button
              type="button"
              onClick={() => navigate("/rules")}
              className="cursor-pointer hover:text-[#22d3ee] motion-safe:transition-colors"
            >
              قوانین و مقررات
            </button>
          </div>
          <div>© {toPersianDigits(new Date().getFullYear() - 621)} پُست‌یار</div>
        </div>
      </footer>
    </div>
  );
}

export default Training;
