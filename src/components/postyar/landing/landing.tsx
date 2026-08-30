"use client";
// POSTYAR landing page — dark navy theme (asovin.ir + botsaaz.com palette),
// Persian RTL, Jalali footer, separate Login & Register popups.
//
// NOTE: dark palette here is an EXPLICIT user request and overrides the
// project's default "no indigo/blue" rule for landing/rules/training only.
// The dashboard/admin interior keeps the existing teal+gold light theme.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Accordion, AccordionItem, AccordionTrigger, AccordionContent,
} from "@/components/ui/accordion";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  SendIcon, BotIcon, SparklesIcon, Wand2Icon, MegaphoneIcon,
  WalletIcon, GiftIcon, TrendingUpIcon, ShoppingCartIcon, BellIcon, TicketIcon,
  CalendarClockIcon, ShieldCheckIcon, ZapIcon, GlobeIcon,
  LanguagesIcon, SmartphoneIcon, CheckCircle2Icon, ArrowLeftIcon,
  LayoutGridIcon, MessageCircleIcon, LockIcon, KeyRoundIcon, PlayCircleIcon,
  StarIcon, ArrowRightIcon, RadioIcon, UsersIcon, HeartIcon, ClockIcon,
} from "lucide-react";
import {
  toPersianDigits, isValidEmail, isValidIranMobile, normalizeMobile,
} from "@/lib/persian";
import { api, type PlanRow } from "@/components/postyar/api";
import { useSession } from "@/components/layout/session-provider";
import { Logo } from "@/components/layout/logo";

export interface LandingProps {
  navigate: (to: string) => void;
}

const FEATURES: { icon: any; title: string; body: string; tint: string }[] = [
  { icon: SendIcon, title: "انتشار چندکاناله", body: "همگام‌سازی یک کلیک روی تلگرام، بله و روبیکا.", tint: "#22d3ee" },
  { icon: CalendarClockIcon, title: "زمان‌بندی جلالی", body: "تقویم حرفه‌ای فارسی برای انتشار دقیق در هر ساعت.", tint: "#34d399" },
  { icon: SparklesIcon, title: "هوش مصنوعی", body: "تولید کپشن، متن هوشمند و پاسخ خودکار با پشتیبانی چند ارائه‌دهنده.", tint: "#A855F7" },
  { icon: BotIcon, title: "بات‌ساز بدون کدنویسی", body: "ساخت بات تلگرام، بله و روبیکا با گردش کار واقعی.", tint: "#38bdf8" },
  { icon: WalletIcon, title: "کیف پول و دفتر کل", body: "مدیریت مالیه با ثبت دقیق هر تراکنش و جلوگیری از دو-بار‌گذاری.", tint: "#f59e0b" },
  { icon: GiftIcon, title: "معرفی دوستان", body: "سامانه ارجاع با کد اختصاصی و پاداش خودکار.", tint: "#34d399" },
  { icon: TrendingUpIcon, title: "پایش طلا", body: "قیمت لحظه‌ای طلای ۱۸، سکه امامی و انس جهانی + بات هشدار.", tint: "#22d3ee" },
  { icon: ShoppingCartIcon, title: "اتصال ووکامرس", body: "همگام‌سازی محصولات و انتشار خودکار روی کانال‌ها.", tint: "#38bdf8" },
  { icon: MegaphoneIcon, title: "تبلیغات هدفمند", body: "ثبت کمپین، بازبینی مدیر و گزارش کلیک و نمایش.", tint: "#A855F7" },
  { icon: BellIcon, title: "اعلان‌های هوشمند", body: "اعلان درون‌برنامه‌ای، ایمیلی و پیامکی با تنظیمات کاربر.", tint: "#f59e0b" },
  { icon: TicketIcon, title: "تیکت و پشتیبانی", body: "سامانه تیکت با اولویت‌بندی و پاسخگوی پشتیبان.", tint: "#34d399" },
  { icon: ShieldCheckIcon, title: "امنیت تولید", body: "احراز هویت دو مرحله‌ای، OTP رمزنگاری‌شده، Webhook با HMAC.", tint: "#22d3ee" },
];

const TRUST: { icon: any; title: string; body: string }[] = [
  { icon: KeyRoundIcon, title: "احراز هویت چندعاملی", body: "ایمیل و رمز عبور یا موبایل و کد یکبار مصرف رمزنگاری‌شده." },
  { icon: LockIcon, title: "رمزنگاری در حال استراحت", body: "توکن‌ها و کلیدها با AES-256-GCM رمزنگاری می‌شوند." },
  { icon: ZapIcon, title: "پاسخ‌گوی خودکار", body: "پاسخ هوشمند به پیام‌های دریافتی با حفاظ از حلقه و سهمیه." },
  { icon: LanguagesIcon, title: "فارسی‌محور، راست‌چین", body: "تقویم جلالی، ارقام فارسی و فونت وزیرمتن به‌صورت بومی." },
];

const FAQ: { q: string; a: string }[] = [
  { q: "آیا پُست‌یار فقط برای تلگرام است؟", a: "خیر؛ سه پلتفرم تلگرام، بله و روبیکا به‌صورت هم‌زمان پشتیبانی می‌شوند و هر کدام دکمه‌های شیشه‌ای مختص خود را دارند." },
  { q: "آیا پرداخت با بله واقعی است؟", a: "بله؛ پُست‌یار از پروتکل واقعی بات بله (sendInvoice → pre_checkout_query → successful_payment) با تأیید سمت-سرور مبلغ و امضای HMAC استفاده می‌کند." },
  { q: "آیا داده‌های مالی من امن هستند؟", a: "هر تراکنش مالیه با کلید یکتا idempotency ثبت می‌شود تا تحت هیچ شرایطی دو بار اعتبار نگیرد. مبالغ به‌صورت اعداد صحیح ریال نگهداری می‌شوند." },
  { q: "آیا برای استفاده نیاز به دانش فنی است؟", a: "خیر؛ رابط کاربری کاملاً فارسی و راست‌چین است. بات‌ساز بدون کدنویسی، تنظیم‌گراف گردش کار و تقویم جلالی مخصوص فارسی‌زبان‌ها طراحی شده است." },
  { q: "آیا روی هاست cPanel قابل نصب است؟", a: "بله؛ پُست‌یار برای محیط cPanel/Passenger + Node.js + MariaDB + Redis طراحی و بهینه شده است." },
];

const VALUE_PROPS: { icon: any; title: string; body: string }[] = [
  { icon: LayoutGridIcon, title: "یک منبع، چندین خروجی", body: "محتوای خود را یک بار بنویسید و با یک کلیک روی همهٔ کانال‌های تلگرام، بله و روبیکا منتشر کنید." },
  { icon: CalendarClockIcon, title: "زمان‌بندی دقیق جلالی", body: "تقویم فارسی حرفه‌ای با انتخاب ساعت و دقیقه؛ زمان اجرا دقیقاً با زمان انتخاب‌شده مطابقت دارد." },
  { icon: SparklesIcon, title: "هوش مصنوعی در دل کار", body: "کپشن هوشمند، متن هوشمند و پاسخ هوشمند در همان ویرایشگر محتوا در دسترس شماست." },
];

// Hero visual — supported platforms as glassmorphic mini-cards (lucide generic
// icons tinted with each platform's official brand color; lucide has no brand
// icons so this is the closest equivalent).
const PLATFORMS: { icon: any; label: string; color: string }[] = [
  { icon: SendIcon,          label: "تلگرام",       color: "#22d3ee" },
  { icon: MessageCircleIcon, label: "بله",          color: "#3b82f6" },
  { icon: RadioIcon,         label: "روبیکا",       color: "#8b5cf6" },
  { icon: BotIcon,           label: "بات",          color: "#34d399" },
  { icon: SparklesIcon,      label: "هوش مصنوعی",  color: "#34d399" },
  { icon: GlobeIcon,         label: "وردپرس",       color: "#21759b" },
  { icon: ShoppingCartIcon,  label: "ووکامرس",      color: "#7f54b3" },
];

const FONT_STACK = { fontFamily: "Vazirmatn, ui-sans-serif, system-ui, sans-serif" } as const;

export function Landing({ navigate }: LandingProps) {
  const { user, refresh } = useSession();
  const [loginOpen, setLoginOpen] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [plansError, setPlansError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.getPlans()
      .then((items) => {
        if (cancelled) return;
        const visible = (items ?? []).filter((p) => p.isPublic !== false).slice(0, 3);
        setPlans(visible.length > 0 ? visible : (items ?? []).slice(0, 3));
        setPlansError(null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "بارگذاری پلن‌ها ناموفق بود.";
        setPlansError(msg);
      })
      .finally(() => { if (!cancelled) setPlansLoading(false); });
    return () => { cancelled = true; };
  }, []);

  function scrollToId(id: string) {
    return (e: React.MouseEvent) => {
      e.preventDefault();
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    };
  }

  return (
    <div dir="rtl" className="min-h-screen flex flex-col bg-[#070b16] text-[#e2e8ff]" style={FONT_STACK}>
      {/* ============== STICKY TOP NAV ============== */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#070b16]/80 backdrop-blur-md motion-safe:transition-colors">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          {/* right: logo (RTL) */}
          <button
            type="button"
            onClick={() => navigate("/")}
            className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22d3ee]/60 rounded-md"
            aria-label="بازگشت به خانه"
          >
            <Logo textClassName="text-white" />
          </button>

          {/* center: anchor links (hidden on mobile) */}
          <nav className="hidden md:flex items-center gap-6 text-sm" aria-label="ناوبری صفحه">
            <a href="#features" onClick={scrollToId("features")} className="text-[#dbe7ff]/80 hover:text-[#22d3ee] motion-safe:transition-colors cursor-pointer">امکانات</a>
            <a href="#pricing" onClick={scrollToId("pricing")} className="text-[#dbe7ff]/80 hover:text-[#22d3ee] motion-safe:transition-colors cursor-pointer">پلن‌ها</a>
            <a href="#faq" onClick={scrollToId("faq")} className="text-[#dbe7ff]/80 hover:text-[#22d3ee] motion-safe:transition-colors cursor-pointer">سؤالات</a>
            <a href="#trust" onClick={scrollToId("trust")} className="text-[#dbe7ff]/80 hover:text-[#22d3ee] motion-safe:transition-colors cursor-pointer">امنیت</a>
            <a
              href="#/rules"
              onClick={(e) => { e.preventDefault(); navigate("/rules"); }}
              className="text-[#dbe7ff]/80 hover:text-[#22d3ee] motion-safe:transition-colors cursor-pointer"
            >قوانین و مقررات</a>
            {/* NOTE: آموزش is no longer public — it is reachable from inside the
                authenticated dashboard via /dashboard/training (see dashboard.tsx). */}
          </nav>

          {/* left: login + register (or dashboard button if authed) */}
          <div className="flex items-center gap-2">
            {user ? (
              <Button
                size="sm"
                onClick={() => navigate("/dashboard")}
                className="cursor-pointer bg-[#f59e0b] text-[#05070f] font-bold hover:bg-[#f59e0b]/90 border border-[#f59e0b]/40"
              >
                ورود به داشبورد
                <ArrowLeftIcon className="size-4" />
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLoginOpen(true)}
                  className="cursor-pointer border-[#22d3ee]/60 text-[#22d3ee] bg-transparent hover:bg-[#22d3ee]/10 hover:text-[#22d3ee]"
                >
                  ورود
                </Button>
                <Button
                  size="sm"
                  onClick={() => setRegisterOpen(true)}
                  className="cursor-pointer bg-[#f59e0b] text-[#05070f] font-bold hover:bg-[#f59e0b]/90 border border-[#f59e0b]/40"
                >
                  ثبت‌نام
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ============== HERO ============== */}
      <section className="relative overflow-hidden border-b border-white/10">
        {/* gradient glow */}
        <div
          className="pointer-events-none absolute inset-0 -z-10 motion-safe:animate-pulse"
          style={{
            background:
              "radial-gradient(ellipse 50% 50% at 70% 25%, rgba(34,211,238,0.18), transparent 60%)," +
              "radial-gradient(ellipse 45% 50% at 25% 70%, rgba(168,85,247,0.16), transparent 60%)," +
              "radial-gradient(ellipse 35% 40% at 50% 100%, rgba(56,189,248,0.10), transparent 60%)",
          }}
          aria-hidden="true"
        />
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-4 py-14 lg:grid-cols-2 lg:py-20">
          {/* right column: text (first child → right in RTL) */}
          <div className="text-center lg:text-right">
            <Badge className="border border-[#22d3ee]/30 bg-[#0f172a] text-[#22d3ee] hover:bg-[#0f172a]">
              <SparklesIcon className="size-3" />
              پلتفرم همه‌کارهٔ فارسی
            </Badge>
            <h1 className="mt-4 text-3xl font-black leading-tight text-white md:text-4xl lg:text-5xl">
              مدیریت هوشمند محتوا و انتشار چندکاناله
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-[#94a3b8] md:text-base lg:mx-0">
              از صفر تا صد؛ انتشار هم‌زمان روی تلگرام، بله و روبیکا، زمان‌بندی با تقویم جلالی،
              بات‌ساز بدون کدنویسی، پرداخت با کارت و درگاه و بله، کیف پول و دفتر کل شفاف،
              ارجاع و پاداش خودکار، پایش قیمت طلا و اتصال به ووکامرس.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center lg:justify-start">
              <Button
                size="lg"
                onClick={() => setRegisterOpen(true)}
                className="cursor-pointer bg-[#f59e0b] text-[#05070f] font-bold hover:bg-[#f59e0b]/90 border border-[#f59e0b]/40"
              >
                شروع رایگان
                <ArrowLeftIcon className="size-4" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={scrollToId("preview")}
                className="cursor-pointer border-white/15 bg-[#0d1322]/60 text-white hover:bg-white/5"
              >
                <PlayCircleIcon className="size-4 text-[#22d3ee]" />
                دیدن دمو
              </Button>
            </div>
            <ul className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-[#94a3b8] lg:justify-start">
              {["بدون نیاز به دانش فنی", "تلگرام، بله و روبیکا", "تقویم جلالی و ارقام فارسی", "نصب‌پذیر روی cPanel"].map((t) => (
                <li key={t} className="inline-flex items-center gap-1">
                  <CheckCircle2Icon className="size-3.5 text-[#34d399]" />
                  {t}
                </li>
              ))}
            </ul>
          </div>

          {/* left column: composed hero visual (second child → left in RTL) */}
          <div className="relative">
            {/* outer glow */}
            <div
              className="pointer-events-none absolute -inset-6 -z-10 rounded-3xl motion-safe:animate-pulse"
              style={{ background: "radial-gradient(circle at 50% 50%, rgba(34,211,238,0.28), transparent 70%)" }}
              aria-hidden="true"
            />

            {/* ===== central dashboard mock (uses /brand/postyar.webp) ===== */}
            <div className="relative rounded-2xl border border-white/15 bg-[#0d1322]/80 p-2.5 shadow-2xl shadow-[#070b16] backdrop-blur">
              {/* fake browser chrome */}
              <div className="mb-2.5 flex items-center gap-1.5 border-b border-white/10 px-1 pb-2">
                <span className="size-2.5 rounded-full bg-rose-500/70" />
                <span className="size-2.5 rounded-full bg-amber-400/70" />
                <span className="size-2.5 rounded-full bg-emerald-400/70" />
                <div
                  className="mx-auto rounded-md bg-white/5 px-3 py-0.5 text-[10px] leading-4 text-[#94a3b8]"
                  dir="ltr"
                >
                  postyar.ir/dashboard
                </div>
              </div>
              <img
                src="/brand/postyar.webp"
                alt="نمای داشبورد پُست‌یار"
                className="w-full rounded-md border border-white/10"
              />

              {/* floating stat — کاربران فعال (top-right) */}
              <div
                className="absolute -top-5 -right-3 hidden sm:flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-2.5 shadow-lg shadow-[#070b16] backdrop-blur motion-safe:animate-pulse"
                aria-hidden="true"
              >
                <span
                  className="rounded-lg p-1.5 text-[#34d399]"
                  style={{
                    background: "linear-gradient(135deg, rgba(52,211,153,0.22), rgba(34,211,238,0.10))",
                    border: "1px solid rgba(52,211,153,0.30)",
                  }}
                >
                  <UsersIcon className="size-4" />
                </span>
                <div className="leading-tight">
                  <div className="text-xs font-bold text-white">
                    {toPersianDigits("۲۴+")} هزار
                  </div>
                  <div className="text-[10px] text-[#94a3b8]">کاربر فعال</div>
                </div>
              </div>

              {/* floating stat — رضایت کاربران (bottom-left) */}
              <div
                className="absolute -bottom-5 -left-3 hidden sm:flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-2.5 shadow-lg shadow-[#070b16] backdrop-blur motion-safe:animate-pulse"
                style={{ animationDelay: "0.6s" }}
                aria-hidden="true"
              >
                <span
                  className="rounded-lg p-1.5 text-[#f59e0b]"
                  style={{
                    background: "linear-gradient(135deg, rgba(245,158,11,0.22), rgba(168,85,247,0.10))",
                    border: "1px solid rgba(245,158,11,0.30)",
                  }}
                >
                  <HeartIcon className="size-4" />
                </span>
                <div className="leading-tight">
                  <div className="text-xs font-bold text-white">
                    {toPersianDigits("۹۴")}٪
                  </div>
                  <div className="text-[10px] text-[#94a3b8]">رضایت کاربران</div>
                </div>
              </div>

              {/* floating stat — پشتیبانی ۲۴/۷ (mid-right, lg only) */}
              <div
                className="absolute top-1/2 -right-5 hidden -translate-y-1/2 lg:flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-2.5 shadow-lg shadow-[#070b16] backdrop-blur motion-safe:animate-pulse"
                style={{ animationDelay: "1.2s" }}
                aria-hidden="true"
              >
                <span
                  className="rounded-lg p-1.5 text-[#22d3ee]"
                  style={{
                    background: "linear-gradient(135deg, rgba(34,211,238,0.22), rgba(56,189,248,0.10))",
                    border: "1px solid rgba(34,211,238,0.30)",
                  }}
                >
                  <ClockIcon className="size-4" />
                </span>
                <div className="leading-tight">
                  <div className="text-xs font-bold text-white">
                    {toPersianDigits("۲۴/۷")}
                  </div>
                  <div className="text-[10px] text-[#94a3b8]">پشتیبانی زنده</div>
                </div>
              </div>
            </div>

            {/* ===== platform glass badges strip (below the dashboard mock) ===== */}
            <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-7">
              {PLATFORMS.map((p) => {
                const Icon = p.icon;
                return (
                  <div
                    key={p.label}
                    className="flex flex-col items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-2.5 backdrop-blur motion-safe:transition-colors hover:border-[#22d3ee]/40"
                    title={p.label}
                  >
                    <Icon className="size-4" style={{ color: p.color }} />
                    <span className="text-[10px] text-[#94a3b8]">{p.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ============== VALUE PROPOSITION ============== */}
      <section className="border-b border-white/10 bg-[#05070f] py-12">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-bold text-white md:text-3xl">چرا پُست‌یار؟</h2>
            <p className="mt-2 text-sm text-[#94a3b8]">سه ستون اصلی ارزش برای کسب‌وکارهای فارسی‌زبان.</p>
          </div>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {VALUE_PROPS.map((v, i) => {
              const Icon = v.icon;
              return (
                <Card key={i} className="border-white/10 bg-[#0d1322]/80 backdrop-blur">
                  <CardContent className="flex flex-col items-start gap-3 p-6">
                    <span
                      className="rounded-xl p-2.5 text-[#22d3ee]"
                      style={{
                        background: "linear-gradient(135deg, rgba(34,211,238,0.18), rgba(52,211,153,0.10))",
                        border: "1px solid rgba(34,211,238,0.25)",
                      }}
                    >
                      <Icon className="size-5" />
                    </span>
                    <div className="font-bold text-white">{v.title}</div>
                    <div className="text-sm leading-6 text-[#94a3b8]">{v.body}</div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* ============== FEATURES GRID ============== */}
      <section id="features" className="border-b border-white/10 py-14">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-bold text-white md:text-3xl">امکانات پُست‌یار</h2>
            <p className="mt-2 text-sm text-[#94a3b8]">هر آنچه برای مدیریت یک کسب‌وکار فارسی‌زبان لازم دارید.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => {
              const Icon = f.icon;
              return (
                <Card
                  key={i}
                  className="border-white/10 bg-[#0d1322]/80 backdrop-blur motion-safe:transition-colors hover:border-[#22d3ee]/40"
                >
                  <CardContent className="flex flex-col items-start gap-3 p-5">
                    <span
                      className="rounded-xl p-2.5"
                      style={{
                        background: `linear-gradient(135deg, ${f.tint}33, ${f.tint}11)`,
                        border: `1px solid ${f.tint}40`,
                        color: f.tint,
                      }}
                    >
                      <Icon className="size-5" />
                    </span>
                    <div className="font-bold text-white">{f.title}</div>
                    <div className="text-sm leading-6 text-[#94a3b8]">{f.body}</div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* ============== ABOUT / BRAND STRIP (asovin.webp accent) ============== */}
      <section className="border-b border-white/10 bg-[#05070f] py-14">
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-4 md:grid-cols-2">
          {/* brand image side accent */}
          <div className="relative">
            <div
              className="pointer-events-none absolute -inset-3 -z-10 rounded-3xl motion-safe:animate-pulse"
              style={{ background: "radial-gradient(circle at 50% 50%, rgba(245,158,11,0.18), transparent 70%)" }}
              aria-hidden="true"
            />
            <img
              src="/brand/asovin.webp"
              alt="نمای برند پُست‌یار"
              className="w-full rounded-2xl border border-white/10 shadow-2xl shadow-[#070b16]"
            />
          </div>
          {/* text */}
          <div>
            <Badge className="border border-[#f59e0b]/30 bg-[#1a140a] text-[#f59e0b] hover:bg-[#1a140a]">
              <ShieldCheckIcon className="size-3" />
              دربارهٔ پُست‌یار
            </Badge>
            <h2 className="mt-4 text-2xl font-bold text-white md:text-3xl">یک پلتفرم، صد قابلیت</h2>
            <p className="mt-3 text-sm leading-7 text-[#94a3b8]">
              پُست‌یار یک سکوی همه‌کارهٔ فارسی‌محور برای کسب‌وکارهای ایرانی است که می‌خواهند
              بدون کدنویسی، روی چند پلتفرم هم‌زمان حضور داشته باشند؛ از انتشار محتوا و
              بات‌سازی تا پرداخت چندگانه و دفتر کل شفاف، همه یک‌جا.
            </p>
            <ul className="mt-5 grid grid-cols-1 gap-2 text-sm text-[#dbe7ff]/85 sm:grid-cols-2">
              <li className="flex items-start gap-2">
                <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-[#34d399]" />
                چرخهٔ کامل انتشار محتوا
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-[#34d399]" />
                بات‌ساز با گردش کار واقعی
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-[#34d399]" />
                پرداخت چندگانه و کیف پول شفاف
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-[#34d399]" />
                راست‌چین، جلالی و ارقام فارسی
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* ============== BOT BUILDER HIGHLIGHT ============== */}
      <section id="preview" className="border-b border-white/10 bg-[#05070f] py-14">
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-4 md:grid-cols-2">
          {/* text */}
          <div>
            <Badge className="border border-[#A855F7]/30 bg-[#1e1b4b] text-[#e9d5ff] hover:bg-[#1e1b4b]">
              <BotIcon className="size-3" />
              بات‌ساز بدون کدنویسی
            </Badge>
            <h2 className="mt-4 text-2xl font-bold text-white md:text-3xl">بات خود را بسازید و گردش کار واقعی تعریف کنید</h2>
            <p className="mt-3 text-sm leading-7 text-[#94a3b8]">
              بات تلگرام، بله یا روبیکا را با چند کلیک بسازید؛ توکن شما رمزنگاری می‌شود،
              وب‌هوک با امضای HMAC تأیید می‌شود و گردش کار قابلیت‌های واقعی پرداخت،
              کیف پول، طلا و پشتیبانی را به‌هم متصل می‌کند.
            </p>
            <ul className="mt-5 space-y-2 text-sm text-[#dbe7ff]/85">
              <li className="flex items-start gap-2"><CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-[#34d399]" /> اتصال کاربران به حساب پُست‌یار با کد یکبار مصرف امضا‌دار</li>
              <li className="flex items-start gap-2"><CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-[#34d399]" /> ارسال فاکتور بله با تأیید سمت-سرور مبلغ</li>
              <li className="flex items-start gap-2"><CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-[#34d399]" /> تاریخچهٔ کامل پیام‌ها برای تحلیل و پشتیبانی</li>
              <li className="flex items-start gap-2"><CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-[#34d399]" /> پرسش و پاسخ هوشمند با حفاظ از حلقه و سهمیه</li>
            </ul>
            <div className="mt-6">
              <Button
                size="lg"
                onClick={() => setRegisterOpen(true)}
                className="cursor-pointer bg-[#A855F7] text-white hover:bg-[#A855F7]/90 border border-[#A855F7]/40"
              >
                ساخت بات
                <ArrowLeftIcon className="size-4" />
              </Button>
            </div>
          </div>
          {/* dashboard preview image */}
          <div className="relative">
            <div
              className="pointer-events-none absolute -inset-3 -z-10 rounded-3xl"
              style={{ background: "radial-gradient(circle at 50% 50%, rgba(56,189,248,0.22), transparent 70%)" }}
              aria-hidden="true"
            />
            <img
              src="/landing/dashboard-preview.png"
              alt="پیش‌نمایش داشبورد پُست‌یار"
              className="w-full rounded-2xl border border-white/10 shadow-2xl shadow-[#070b16]"
            />
          </div>
        </div>
      </section>

      {/* ============== PRICING ============== */}
      <section id="pricing" className="border-b border-white/10 py-14">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-bold text-white md:text-3xl">پلن‌ها</h2>
            <p className="mt-2 text-sm text-[#94a3b8]">پلن متناسب با نیاز خود انتخاب کنید.</p>
          </div>
          {plansLoading ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="rounded-2xl border border-white/10 bg-[#0d1322]/80 p-6">
                  <Skeleton className="mb-4 h-6 w-1/2 bg-white/10" />
                  <Skeleton className="mb-2 h-8 w-2/3 bg-white/10" />
                  <Skeleton className="mb-6 h-4 w-full bg-white/10" />
                  <Skeleton className="mb-2 h-4 w-full bg-white/10" />
                  <Skeleton className="mb-2 h-4 w-full bg-white/10" />
                  <Skeleton className="mb-2 h-4 w-full bg-white/10" />
                  <Skeleton className="mt-4 h-10 w-full bg-white/10" />
                </div>
              ))}
            </div>
          ) : plansError ? (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-6 text-center text-sm text-red-300">
              بارگذاری پلن‌ها ناموفق بود. لطفاً بعداً دوباره تلاش کنید.
            </div>
          ) : plans.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-[#0d1322]/80 p-6 text-center text-sm text-[#94a3b8]">
              هنوز پلنی تعریف نشده است.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {plans.map((p, i) => {
                const highlighted = i === 1 || (plans.length === 1 ? false : i === Math.floor(plans.length / 2));
                return (
                  <Card
                    key={p.id}
                    className={
                      "relative border bg-[#0d1322]/80 backdrop-blur motion-safe:transition-colors " +
                      (highlighted ? "border-[#22d3ee]/60 shadow-lg shadow-[#22d3ee]/10" : "border-white/10")
                    }
                  >
                    {highlighted && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <Badge className="border border-[#f59e0b]/40 bg-[#f59e0b] text-[#05070f] hover:bg-[#f59e0b]">
                          <StarIcon className="size-3" />
                          محبوب‌ترین
                        </Badge>
                      </div>
                    )}
                    <CardContent className="flex flex-col gap-4 p-6 pt-7">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-lg font-bold text-white">{p.nameFa}</div>
                      </div>
                      <div className="text-2xl font-black text-white">
                        {p.priceRials === 0 ? (
                          "رایگان"
                        ) : (
                          <>
                            {Intl.NumberFormat("fa-IR").format(p.priceRials)}{" "}
                            <span className="text-sm font-normal text-[#94a3b8]">ریال</span>
                          </>
                        )}
                      </div>
                      <p className="min-h-2 text-xs leading-5 text-[#94a3b8]">{p.descriptionFa || "—"}</p>
                      <ul className="space-y-2 text-xs text-[#dbe7ff]/85">
                        <li className="flex items-center gap-2">
                          <CheckCircle2Icon className="size-3.5 text-[#34d399]" />
                          انتشار ماهانه: {toPersianDigits(p.quota?.publishPerMonth ?? 0)}
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle2Icon className="size-3.5 text-[#34d399]" />
                          هوش مصنوعی ماهانه: {toPersianDigits(p.quota?.aiPerMonth ?? 0)}
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle2Icon className="size-3.5 text-[#34d399]" />
                          کانال‌ها: {toPersianDigits(p.quota?.channels ?? 0)}
                        </li>
                      </ul>
                      <Button
                        className="mt-2 cursor-pointer"
                        variant={highlighted ? "default" : "outline"}
                        onClick={() => (user ? navigate("/dashboard") : setRegisterOpen(true))}
                        style={
                          highlighted
                            ? { background: "#f59e0b", color: "#05070f", borderColor: "#f59e0b40" }
                            : { background: "transparent", color: "#22d3ee", borderColor: "#22d3ee60" }
                        }
                      >
                        انتخاب پلن
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ============== TRUST / SECURITY ============== */}
      <section id="trust" className="border-b border-white/10 bg-[#05070f] py-14">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-bold text-white md:text-3xl">امنیت و اعتماد</h2>
            <p className="mt-2 text-sm text-[#94a3b8]">پُست‌یار از رویکرد fail-closed استفاده می‌کند.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {TRUST.map((t, i) => {
              const Icon = t.icon;
              return (
                <Card key={i} className="border-white/10 bg-[#0d1322]/80 backdrop-blur">
                  <CardContent className="flex flex-col items-start gap-3 p-5">
                    <span
                      className="rounded-xl p-2.5 text-[#34d399]"
                      style={{
                        background: "linear-gradient(135deg, rgba(52,211,153,0.18), rgba(34,211,238,0.10))",
                        border: "1px solid rgba(52,211,153,0.30)",
                      }}
                    >
                      <Icon className="size-5" />
                    </span>
                    <div className="font-bold text-white">{t.title}</div>
                    <div className="text-sm leading-6 text-[#94a3b8]">{t.body}</div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* ============== FAQ ============== */}
      <section id="faq" className="border-b border-white/10 py-14">
        <div className="mx-auto max-w-3xl px-4">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-bold text-white md:text-3xl">سؤالات پرتکرار</h2>
          </div>
          <Accordion type="single" collapsible defaultValue="0" className="rounded-2xl border border-white/10 bg-[#0d1322]/60 px-4">
            {FAQ.map((f, i) => (
              <AccordionItem key={i} value={String(i)} className="border-b border-white/10 last:border-b-0">
                <AccordionTrigger className="text-right text-sm font-semibold text-white hover:text-[#22d3ee] hover:no-underline">
                  {f.q}
                </AccordionTrigger>
                <AccordionContent className="pt-2 text-sm leading-7 text-[#94a3b8]">
                  {f.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* ============== CTA ============== */}
      <section className="border-b border-white/10 py-16">
        <div
          className="mx-auto max-w-4xl px-4"
          style={{ background: "linear-gradient(120deg, rgba(245,158,11,0.12), rgba(168,85,247,0.12))" }}
        >
          <div className="rounded-3xl border border-[#f59e0b]/30 bg-[#0f172a]/60 p-8 text-center backdrop-blur md:p-12">
            <h2 className="text-2xl font-black text-white md:text-3xl">همین حالا شروع کنید</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-[#dbe7ff]/85">
              ثبت‌نام در کمتر از یک دقیقه؛ بدون نیاز به کارت اعتباری. اولین کاربر به‌طور خودکار مدیر سامانه می‌شود.
            </p>
            <Button
              size="lg"
              onClick={() => setRegisterOpen(true)}
              className="mt-6 cursor-pointer bg-[#f59e0b] text-[#05070f] font-bold hover:bg-[#f59e0b]/90 border border-[#f59e0b]/40"
            >
              {user ? "ورود به داشبورد" : "ایجاد حساب کاربری"}
              <ArrowLeftIcon className="size-4" />
            </Button>
          </div>
        </div>
      </section>

      {/* ============== FOOTER (sticky bottom) ============== */}
      <footer className="mt-auto border-t border-white/10 bg-[#05070f] py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 text-center md:flex-row md:justify-between md:text-right">
          <div className="flex flex-col items-center gap-2 md:items-start">
            <Logo textClassName="text-white" />
            <p className="max-w-md text-xs leading-5 text-[#94a3b8]">
              پُست‌یار؛ پلتفرم همه‌کارهٔ فارسی برای مدیریت محتوا، انتشار، بات‌سازی و پرداخت.
            </p>
          </div>
          <nav className="flex flex-wrap items-center justify-center gap-4 text-xs text-[#94a3b8]" aria-label="پیوندهای پایین">
            <button type="button" onClick={() => navigate("/rules")} className="cursor-pointer hover:text-[#22d3ee] motion-safe:transition-colors">قوانین و مقررات</button>
            <a href="#features" onClick={scrollToId("features")} className="cursor-pointer hover:text-[#22d3ee] motion-safe:transition-colors">امکانات</a>
            <a href="#pricing" onClick={scrollToId("pricing")} className="cursor-pointer hover:text-[#22d3ee] motion-safe:transition-colors">پلن‌ها</a>
          </nav>
          <div className="text-xs text-[#94a3b8]">
            © {toPersianDigits(new Date().getFullYear() - 621)} پُست‌یار
          </div>
        </div>
      </footer>

      {/* ============== LOGIN DIALOG (separate popup) ============== */}
      <LoginDialog
        open={loginOpen}
        onOpenChange={setLoginOpen}
        navigate={navigate}
        refresh={refresh}
        onSwitchToRegister={() => {
          setLoginOpen(false);
          setRegisterOpen(true);
        }}
      />

      {/* ============== REGISTER DIALOG (separate popup) ============== */}
      <RegisterDialog
        open={registerOpen}
        onOpenChange={setRegisterOpen}
        navigate={navigate}
        refresh={refresh}
        onSwitchToLogin={() => {
          setRegisterOpen(false);
          setLoginOpen(true);
        }}
      />
    </div>
  );
}

/* ===================================================================== */
/* LOGIN DIALOG — Tabs: email/password | mobile+OTP (3-step)              */
/* ===================================================================== */
function LoginDialog({
  open, onOpenChange, navigate, refresh, onSwitchToRegister,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  navigate: (to: string) => void;
  refresh: () => Promise<void>;
  onSwitchToRegister: () => void;
}) {
  const [tab, setTab] = useState<"email" | "mobile">("email");

  // email state
  const [emailLogin, setEmailLogin] = useState("");
  const [pwdLogin, setPwdLogin] = useState("");

  // mobile+OTP state
  const [mobile, setMobile] = useState("");
  const [otpStep, setOtpStep] = useState<"request" | "verify" | "complete">("request");
  const [cooldown, setCooldown] = useState(0);
  const [verifyToken, setVerifyToken] = useState("");

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // reset internal state when dialog closes
  useEffect(() => {
    if (!open) {
      const h = setTimeout(() => {
        setTab("email");
        setOtpStep("request");
        setMobile("");
        setVerifyToken("");
        setCooldown(0);
        setEmailLogin("");
        setPwdLogin("");
      }, 250);
      return () => clearTimeout(h);
    }
  }, [open]);

  async function handleEmailLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isValidEmail(emailLogin)) return toast.error("ایمیل نامعتبر است.");
    const r = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emailLogin, password: pwdLogin }),
      credentials: "same-origin",
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return toast.error(data?.errorFa ?? "ورود ناموفق بود.");
    toast.success("خوش آمدید!");
    await refresh();
    onOpenChange(false);
    navigate("/dashboard");
  }

  async function requestOtp() {
    if (!isValidIranMobile(mobile)) return toast.error("شماره موبایل نامعتبر است (۰۹XXXXXXXXX).");
    setCooldown(0);
    const r = await fetch("/api/auth/otp-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mobile, purpose: "login" }),
      credentials: "same-origin",
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      toast.error(data?.errorFa ?? "درخواست کد ناموفق بود.");
      if (data?.cooldownSec) setCooldown(Math.ceil(data.cooldownSec));
      return;
    }
    toast.success("کد یکبار مصرف ارسال شد.");
    setOtpStep("verify");
    if (data?.cooldownSec) setCooldown(Math.ceil(data.cooldownSec));
  }

  async function verifyOtp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const code = String(f.get("code") ?? "").replace(/\D/g, "");
    if (!/^\d{6}$/.test(code)) return toast.error("کد ۶ رقمی را وارد کنید.");
    const r = await fetch("/api/auth/otp-verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mobile, code, purpose: "login" }),
      credentials: "same-origin",
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return toast.error(data?.errorFa ?? "تأیید کد ناموفق بود.");
    if (data?.purpose === "login" && data?.user) {
      toast.success("خوش آمدید!");
      await refresh();
      onOpenChange(false);
      navigate("/dashboard");
      return;
    }
    if (data?.verifyToken) {
      setVerifyToken(data.verifyToken);
      setOtpStep("complete");
      toast.info("برای تکمیل ثبت‌نام، اطلاعات حساب را وارد کنید.");
    }
  }

  async function completeRegister(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = {
      mobile,
      verifyToken,
      firstName: String(f.get("firstName") ?? ""),
      lastName: String(f.get("lastName") ?? ""),
      email: String(f.get("email") ?? ""),
      password: String(f.get("password") ?? ""),
      activityType: String(f.get("activityType") ?? "personal"),
      businessName: String(f.get("businessName") ?? ""),
      referralCode: String(f.get("referralCode") ?? ""),
    };
    if (!isValidEmail(body.email)) return toast.error("ایمیل نامعتبر است.");
    if (body.password.length < 8) return toast.error("رمز عبور باید حداقل ۸ نویسه باشد.");
    const r = await fetch("/api/auth/complete-mobile-register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return toast.error(data?.errorFa ?? "تکمیل ثبت‌نام ناموفق بود.");
    toast.success("حساب شما ساخته شد!");
    await refresh();
    onOpenChange(false);
    navigate("/dashboard");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md overflow-y-auto rounded-2xl border border-white/10 bg-[#0d1322] text-[#e2e8ff] p-0" style={FONT_STACK}>
        <DialogHeader className="px-6 pt-6 text-center">
          <DialogTitle className="text-lg font-bold text-white">ورود به پُست‌یار</DialogTitle>
          <DialogDescription className="text-[#94a3b8]">
            با ایمیل و رمز عبور یا شماره موبایل وارد شوید.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-6">
          <Tabs value={tab} onValueChange={(v) => setTab(v as "email" | "mobile")} dir="rtl">
            <TabsList className="grid w-full grid-cols-2 bg-[#05070f] border border-white/10">
              <TabsTrigger value="email" className="data-[state=active]:bg-[#22d3ee]/15 data-[state=active]:text-[#22d3ee] text-[#94a3b8]">
                ایمیل
              </TabsTrigger>
              <TabsTrigger value="mobile" className="data-[state=active]:bg-[#22d3ee]/15 data-[state=active]:text-[#22d3ee] text-[#94a3b8]">
                موبایل
              </TabsTrigger>
            </TabsList>

            {/* EMAIL TAB */}
            <TabsContent value="email" dir="rtl">
              <form onSubmit={handleEmailLogin} className="space-y-3 pt-3">
                <FieldDark label="ایمیل" htmlFor="login-email" >
                  <Input
                    id="login-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    dir="ltr"
                    value={emailLogin}
                    onChange={(e) => setEmailLogin(e.target.value)}
                    placeholder="you@example.com"
                    className="border-white/10 bg-[#05070f] text-white placeholder:text-[#94a3b8]"
                  />
                </FieldDark>
                <FieldDark label="رمز عبور" htmlFor="login-password">
                  <Input
                    id="login-password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    dir="ltr"
                    value={pwdLogin}
                    onChange={(e) => setPwdLogin(e.target.value)}
                    className="border-white/10 bg-[#05070f] text-white placeholder:text-[#94a3b8]"
                  />
                </FieldDark>
                <Button
                  type="submit"
                  className="w-full cursor-pointer bg-[#22d3ee] text-[#05070f] font-bold hover:bg-[#22d3ee]/90"
                >
                  ورود
                  <ArrowLeftIcon className="size-4" />
                </Button>
                <p className="text-center text-xs text-[#94a3b8]">
                  حساب ندارید؟{" "}
                  <button
                    type="button"
                    onClick={onSwitchToRegister}
                    className="cursor-pointer text-[#22d3ee] hover:underline"
                  >
                    ثبت‌نام کنید
                  </button>
                </p>
              </form>
            </TabsContent>

            {/* MOBILE TAB */}
            <TabsContent value="mobile" dir="rtl">
              {otpStep === "request" && (
                <div className="space-y-3 pt-3">
                  <FieldDark label="شماره موبایل" htmlFor="login-mobile">
                    <Input
                      id="login-mobile"
                      inputMode="numeric"
                      value={mobile}
                      onChange={(e) => setMobile(normalizeMobile(e.target.value))}
                      dir="ltr"
                      placeholder="۰۹۱۲۳۴۵۶۷۸۹"
                      className="border-white/10 bg-[#05070f] text-white placeholder:text-[#94a3b8]"
                    />
                  </FieldDark>
                  <Button
                    type="button"
                    onClick={requestOtp}
                    disabled={cooldown > 0}
                    className="w-full cursor-pointer bg-[#22d3ee] text-[#05070f] font-bold hover:bg-[#22d3ee]/90 disabled:opacity-50"
                  >
                    {cooldown > 0
                      ? `ارسال مجدد در ${toPersianDigits(cooldown)} ثانیه`
                      : "ارسال کد"}
                  </Button>
                  <div className="text-xs leading-5 text-[#94a3b8]">
                    کد یکبار مصرف از طریق پیامک ارسال می‌شود. در محیط پیش‌نمایش می‌توانید کد را از{" "}
                    <a
                      href="/api/auth/dev/otp-test?mobile=09123456789"
                      className="cursor-pointer text-[#22d3ee] underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      آدرس تست
                    </a>{" "}
                    بخوانید.
                  </div>
                </div>
              )}

              {otpStep === "verify" && (
                <form onSubmit={verifyOtp} className="space-y-3 pt-3">
                  <FieldDark label="کد یکبار مصرف" htmlFor="login-code">
                    <Input
                      id="login-code"
                      name="code"
                      inputMode="numeric"
                      maxLength={6}
                      required
                      dir="ltr"
                      placeholder="۱۲۳۴۵۶"
                      className="border-white/10 bg-[#05070f] text-white placeholder:text-[#94a3b8]"
                    />
                  </FieldDark>
                  <Button type="submit" className="w-full cursor-pointer bg-[#22d3ee] text-[#05070f] font-bold hover:bg-[#22d3ee]/90">
                    تأیید و ورود
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setOtpStep("request")}
                    className="w-full cursor-pointer text-[#94a3b8] hover:text-white"
                  >
                    بازگشت
                  </Button>
                </form>
              )}

              {otpStep === "complete" && (
                <form onSubmit={completeRegister} className="space-y-3 pt-3">
                  <p className="text-center text-xs text-[#94a3b8]">برای تکمیل ثبت‌نام، اطلاعات زیر را وارد کنید.</p>
                  <FieldDark label="نام" htmlFor="cmp-firstName">
                    <Input id="cmp-firstName" name="firstName" required dir="rtl" className="border-white/10 bg-[#05070f] text-white placeholder:text-[#94a3b8]" />
                  </FieldDark>
                  <FieldDark label="نام خانوادگی" htmlFor="cmp-lastName">
                    <Input id="cmp-lastName" name="lastName" required dir="rtl" className="border-white/10 bg-[#05070f] text-white placeholder:text-[#94a3b8]" />
                  </FieldDark>
                  <FieldDark label="ایمیل" htmlFor="cmp-email">
                    <Input id="cmp-email" name="email" type="email" required dir="ltr" className="border-white/10 bg-[#05070f] text-white placeholder:text-[#94a3b8]" />
                  </FieldDark>
                  <FieldDark label="رمز عبور (حداقل ۸ نویسه)" htmlFor="cmp-password">
                    <Input id="cmp-password" name="password" type="password" required dir="ltr" className="border-white/10 bg-[#05070f] text-white placeholder:text-[#94a3b8]" />
                  </FieldDark>
                  <ActivityFieldDark />
                  <FieldDark label="نام کسب‌وکار" htmlFor="cmp-business">
                    <Input id="cmp-business" name="businessName" dir="rtl" className="border-white/10 bg-[#05070f] text-white placeholder:text-[#94a3b8]" />
                  </FieldDark>
                  <FieldDark label="کد معرف (اختیاری)" htmlFor="cmp-ref">
                    <Input id="cmp-ref" name="referralCode" dir="ltr" className="border-white/10 bg-[#05070f] text-white placeholder:text-[#94a3b8]" />
                  </FieldDark>
                  <Button type="submit" className="w-full cursor-pointer gap-2 bg-[#f59e0b] text-[#05070f] font-bold hover:bg-[#f59e0b]/90">
                    تکمیل ثبت‌نام
                    <ArrowLeftIcon className="size-4" />
                  </Button>
                </form>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ===================================================================== */
/* REGISTER DIALOG — 7 fields, auto-login on success                      */
/* ===================================================================== */
function RegisterDialog({
  open, onOpenChange, navigate, refresh, onSwitchToLogin,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  navigate: (to: string) => void;
  refresh: () => Promise<void>;
  onSwitchToLogin: () => void;
}) {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    mobile: "",
    password: "",
    activityType: "personal",
    businessName: "",
    referralCode: "",
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      const h = setTimeout(() => {
        setForm({
          firstName: "", lastName: "", email: "", mobile: "",
          password: "", activityType: "personal", businessName: "", referralCode: "",
        });
      }, 250);
      return () => clearTimeout(h);
    }
  }, [open]);

  function setField<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleRegister(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isValidEmail(form.email)) return toast.error("ایمیل نامعتبر است.");
    if (!isValidIranMobile(form.mobile)) return toast.error("موبایل نامعتبر است (۰۹XXXXXXXXX).");
    if (form.password.length < 8) return toast.error("رمز عبور باید حداقل ۸ نویسه باشد.");
    setSubmitting(true);
    try {
      const r = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
        credentials: "same-origin",
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) return toast.error(data?.errorFa ?? "ثبت‌نام ناموفق بود.");
      toast.success("حساب شما ساخته شد!");
      await refresh();
      onOpenChange(false);
      navigate("/dashboard");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto rounded-2xl border border-white/10 bg-[#0d1322] text-[#e2e8ff] p-0" style={FONT_STACK}>
        <DialogHeader className="px-6 pt-6 text-center">
          <DialogTitle className="text-lg font-bold text-white">ساخت حساب کاربری</DialogTitle>
          <DialogDescription className="text-[#94a3b8]">
            تمامی فیلدها به جز «نام کسب‌وکار» و «کد معرف» الزامی هستند.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleRegister} className="space-y-3 px-6 pb-6">
          <FieldDark label="نام" htmlFor="reg-firstName">
            <Input
              id="reg-firstName"
              name="firstName"
              required
              dir="rtl"
              value={form.firstName}
              onChange={(e) => setField("firstName", e.target.value)}
              className="border-white/10 bg-[#05070f] text-white placeholder:text-[#94a3b8]"
            />
          </FieldDark>
          <FieldDark label="نام خانوادگی" htmlFor="reg-lastName">
            <Input
              id="reg-lastName"
              name="lastName"
              required
              dir="rtl"
              value={form.lastName}
              onChange={(e) => setField("lastName", e.target.value)}
              className="border-white/10 bg-[#05070f] text-white placeholder:text-[#94a3b8]"
            />
          </FieldDark>
          <FieldDark label="ایمیل" htmlFor="reg-email">
            <Input
              id="reg-email"
              name="email"
              type="email"
              required
              dir="ltr"
              value={form.email}
              onChange={(e) => setField("email", e.target.value)}
              className="border-white/10 bg-[#05070f] text-white placeholder:text-[#94a3b8]"
            />
          </FieldDark>
          <FieldDark label="موبایل" htmlFor="reg-mobile">
            <Input
              id="reg-mobile"
              name="mobile"
              required
              dir="ltr"
              inputMode="numeric"
              value={form.mobile}
              onChange={(e) => setField("mobile", normalizeMobile(e.target.value))}
              placeholder="۰۹XXXXXXXXX"
              className="border-white/10 bg-[#05070f] text-white placeholder:text-[#94a3b8]"
            />
          </FieldDark>
          <FieldDark label="رمز عبور (حداقل ۸ نویسه)" htmlFor="reg-password">
            <Input
              id="reg-password"
              name="password"
              type="password"
              required
              dir="ltr"
              value={form.password}
              onChange={(e) => setField("password", e.target.value)}
              className="border-white/10 bg-[#05070f] text-white placeholder:text-[#94a3b8]"
            />
          </FieldDark>
          <ActivityFieldDark
            value={form.activityType}
            onChange={(v) => setField("activityType", v)}
          />
          <FieldDark label="نام کسب‌وکار" htmlFor="reg-business">
            <Input
              id="reg-business"
              name="businessName"
              dir="rtl"
              value={form.businessName}
              onChange={(e) => setField("businessName", e.target.value)}
              className="border-white/10 bg-[#05070f] text-white placeholder:text-[#94a3b8]"
            />
          </FieldDark>
          <FieldDark label="کد معرف (اختیاری)" htmlFor="reg-ref">
            <Input
              id="reg-ref"
              name="referralCode"
              dir="ltr"
              value={form.referralCode}
              onChange={(e) => setField("referralCode", e.target.value)}
              className="border-white/10 bg-[#05070f] text-white placeholder:text-[#94a3b8]"
            />
          </FieldDark>

          <Button
            type="submit"
            disabled={submitting}
            className="w-full cursor-pointer bg-[#f59e0b] text-[#05070f] font-bold hover:bg-[#f59e0b]/90 disabled:opacity-60"
          >
            {submitting ? "در حال ساخت حساب…" : "ساخت حساب کاربری"}
            <ArrowLeftIcon className="size-4" />
          </Button>

          <p className="text-center text-xs text-[#94a3b8]">
            قبلاً ثبت‌نام کرده‌اید؟{" "}
            <button
              type="button"
              onClick={onSwitchToLogin}
              className="cursor-pointer text-[#22d3ee] hover:underline"
            >
              وارد شوید
            </button>
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ============================== helpers ============================== */
function FieldDark({
  label, htmlFor, children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-[#dbe7ff]">{label}</Label>
      {children}
    </div>
  );
}

function ActivityFieldDark({
  value = "personal",
  onChange,
}: {
  value?: string;
  onChange?: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="activityType-dark" className="text-[#dbe7ff]">نوع فعالیت</Label>
      <Select
        value={value}
        onValueChange={(v) => onChange?.(v)}
      >
        <SelectTrigger id="activityType-dark" className="border-white/10 bg-[#05070f] text-white w-full">
          <SelectValue placeholder="نوع فعالیت" />
        </SelectTrigger>
        <SelectContent className="border-white/10 bg-[#0d1322] text-[#e2e8ff]">
          <SelectItem value="personal">شخصی</SelectItem>
          <SelectItem value="business">کسب‌وکار</SelectItem>
          <SelectItem value="marketer">بازاریاب</SelectItem>
          <SelectItem value="service">خدماتی</SelectItem>
          <SelectItem value="media">رسانه</SelectItem>
          <SelectItem value="other">سایر</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

export default Landing;
