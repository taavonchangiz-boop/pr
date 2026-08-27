"use client";
// POSTYAR landing page — Persian, RTL, Jalali, Vazirmatn, all spec §92 sections.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  SendIcon, MessageCircleIcon, BotIcon, SparklesIcon, Wand2Icon, MegaphoneIcon,
  WalletIcon, GiftIcon, TrendingUpIcon, ShoppingCartIcon, BellIcon, TicketIcon,
  CalendarClockIcon, ShieldCheckIcon, ZapIcon, LayoutGridIcon, GlobeIcon,
  LanguagesIcon, SmartphoneIcon, ChevronDownIcon, CheckCircle2Icon, ArrowLeftIcon,
} from "lucide-react";
import { toPersianDigits } from "@/lib/persian";
import { api } from "@/components/postyar/api";
import { useSession } from "@/components/layout/session-provider";

export interface LandingProps {
  navigate: (to: string) => void;
}

type LandingPlan = {
  id: string;
  nameFa: string;
  priceRials: number;
  descriptionFa: string;
  quota: Record<string, number | undefined>;
};

const FEATURES: { icon: any; title: string; body: string }[] = [
  { icon: SendIcon, title: "انتشار چندکاناله", body: "همگام‌سازی یک کلیک روی تلگرام، باله و روبیکا." },
  { icon: CalendarClockIcon, title: "زمان‌بندی جلالی", body: "تقویم حرفه‌ای فارسی برای انتشار دقیق در هر ساعت." },
  { icon: SparklesIcon, title: "هوش مصنوعی", body: "تولید کپشن، متن هوشمند و پاسخ خودکار با پشتیبانی ۱۰ ارائه‌دهنده." },
  { icon: BotIcon, title: "بات‌ساز بدون کدنویسی", body: "ساخت بات تلگرام/باله/روبیکا با گردش کار واقعی و اتصال به پرداخت." },
  { icon: WalletIcon, title: "کیف پول و دفتر کل", body: "مدیریت مالیه با ثبت دقیق هر تراکنش و جلوگیری از دو-bar‌گذاری." },
  { icon: GiftIcon, title: "معرفی دوستان", body: "سامانه ارجاع با کد اختصاصی و پاداش خودکار." },
  { icon: TrendingUpIcon, title: "پایش طلا", body: "قیمت لحظه‌ای طلای ۱۸، سکه امامی و انس جهانی + بات هشدار." },
  { icon: ShoppingCartIcon, title: "اتصال ووکامرس", body: "همگام‌سازی محصولات و انتشار خودکار روی کانال‌ها." },
  { icon: MegaphoneIcon, title: "تبلیغات هدفمند", body: "ثبت کمپین، بازبینی مدیر و گزارش کلیک و نمایش." },
  { icon: BellIcon, title: "اعلان‌های هوشمند", body: "اعلان درون‌برنامه‌ای، ایمیلی و پیامکی با تنظیمات کاربر." },
  { icon: TicketIcon, title: "تیکت و پشتیبانی", body: "سامانه تیکت با اولویت‌بندی و پاسخگوی پشتیبان." },
  { icon: ShieldCheckIcon, title: "امنیت تولید", body: "احراز هویت دو روشی، OTP رمزنگاری‌شده، Webhook با HMAC." },
];

const FAQ: { q: string; a: string }[] = [
  { q: "آیا پُست‌یار فقط برای تلگرام است؟", a: "خیر؛ سه پلتفرم تلگرام، باله و روبیکا به‌صورت هم‌زمان پشتیبانی می‌شوند و هر کدام دکمه‌های شیشه‌ای مختص خود را دارند." },
  { q: "آیا پرداخت با باله واقعی است؟", a: "بله؛ پُست‌یار از پروتکل واقعی بات باله (sendInvoice → pre_checkout_query → successful_payment) با تأیید سمت-سرور مبلغ و امضای HMAC استفاده می‌کند." },
  { q: "آیا داده‌های مالی من امن هستند؟", a: "هر تراکنش مالیه با کلید یکتا idempotency ثبت می‌شود تا تحت هیچ شرایطی دو بار اعتبار نگیرد. مبالغ به‌صورت اعداد صحیح ریال نگهداری می‌شوند." },
  { q: "آیا برای استفاده نیاز به دانش فنی است؟", a: "خیر؛ رابط کاربری کاملاً فارسی و راست‌چین است. بات‌ساز بدون کدنویسی، تنظیم‌گراف گردش کار و تقویم جلالی مخصوص فارسی‌زبان‌ها طراحی شده است." },
  { q: "آیا روی هاست cPanel قابل نصب است؟", a: "بله؛ پُست‌یار برای محیط cPanel/Passenger + Node.js + MariaDB + Redis طراحی و بهینه شده است." },
];

const TRUST: { icon: any; title: string; body: string }[] = [
  { icon: ShieldCheckIcon, title: "احراز هویت چندعاملی", body: "ایمیل + رمز عبور یا موبایل + کد یکبار مصرف رمزنگاری‌شده." },
  { icon: GlobeIcon, title: "رمزنگاری در حال استراحت", body: "توکن‌ها و کلیدها با AES-256-GCM رمزنگاری می‌شوند." },
  { icon: ZapIcon, title: "پاسخ‌گوی خودکار", body: "پاسخ هوشمند به پیام‌های دریافتی با حفاظ از حلقه و سهمیه." },
  { icon: LanguagesIcon, title: "فارسی‌محور، راست‌چین", body: "تقویم جلالی، ارقام فارسی و فونت وزیرمتن به‌صورت بومی." },
];

export function Landing({ navigate }: LandingProps) {
  const { user } = useSession();
  const [plans, setPlans] = useState<LandingPlan[]>([]);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  useEffect(() => {
    api.getPlans().then(setPlans).catch(() => {});
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-background" dir="rtl">
      {/* Sticky top nav */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-primary p-1.5 text-primary-foreground">
              <SendIcon className="size-5" />
            </div>
            <span className="text-lg font-bold">پُست‌یار</span>
            <Badge variant="secondary" className="mr-2 text-xs">پیش‌نمایش</Badge>
          </div>
          <nav className="hidden items-center gap-6 text-sm font-medium md:flex">
            <a href="#features" className="hover:text-primary">امکانات</a>
            <a href="#pricing" className="hover:text-primary">پلن‌ها</a>
            <a href="#faq" className="hover:text-primary">سؤالات</a>
            <a href="#trust" className="hover:text-primary">امنیت</a>
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate("/auth")}>ورود</Button>
            <Button size="sm" onClick={() => navigate("/auth")}>{user ? "داشبورد" : "ثبت‌نام"}</Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/10 to-transparent" />
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-4 py-16 text-center md:py-24">
          <Badge variant="secondary" className="text-xs">پلتفرم همه‌کارهٔ فارسی</Badge>
          <h1 className="max-w-3xl text-3xl font-black leading-tight md:text-5xl">
            پُست‌یار؛ مدیریت محتوا، انتشار، بات‌ساز و پرداخت در یک سامانه
          </h1>
          <p className="max-w-2xl text-base text-muted-foreground md:text-lg">
            از صفر تا صد؛ انتشار هم‌زمان روی تلگرام، باله و روبیکا، زمان‌بندی با تقویم جلالی، بات‌ساز بدون کدنویسی، پرداخت با کارت، درگاه بانکی و باله، کیف پول و دفتر کل شفاف، ارجاع و پاداش خودکار، پایش قیمت طلا و اتصال به ووکامرس.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button size="lg" onClick={() => navigate("/auth")} className="gap-2">
              {user ? "ورود به داشبورد" : "شروع رایگان"}
              <ArrowLeftIcon className="size-4" />
            </Button>
            <Button size="lg" variant="outline" onClick={() => navigate("/auth")}>
              مشاهدهٔ پلن‌ها
            </Button>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><CheckCircle2Icon className="size-3" /> بدون نیاز به دانش فنی</span>
            <span className="inline-flex items-center gap-1"><CheckCircle2Icon className="size-3" /> پشتیبانی تلگرام، باله و روبیکا</span>
            <span className="inline-flex items-center gap-1"><CheckCircle2Icon className="size-3" /> تقویم جلالی و ارقام فارسی</span>
            <span className="inline-flex items-center gap-1"><CheckCircle2Icon className="size-3" /> نصب‌پذیر روی cPanel</span>
          </div>
        </div>
      </section>

      {/* Value proposition */}
      <section className="border-b py-12">
        <div className="mx-auto max-w-6xl px-4">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <Card>
              <CardHeader><CardTitle className="text-base">یک منبع، چندین خروجی</CardTitle></CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                محتوای خود را یک بار بنویسید و با یک کلیک روی همهٔ کانال‌های تلگرام، باله و روبیکا منتشر کنید.
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">زمان‌بندی دقیق جلالی</CardTitle></CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                تقویم فارسی حرفه‌ای با انتخاب ساعت و دقیقه؛ زمان اجرا دقیقاً با زمان انتخاب‌شده مطابقت دارد.
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">هوش مصنوعی در دل کار</CardTitle></CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                کپشن هوشمند، متن هوشمند و پاسخ هوشمند در همان ویرایشگر محتوا در دسترس شماست.
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Features grid */}
      <section id="features" className="border-b py-12">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-bold md:text-3xl">امکانات پُست‌یار</h2>
            <p className="mt-2 text-sm text-muted-foreground">هر آنچه برای مدیریت یک کسب‌وکار فارسی‌زبان لازم دارید.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => {
              const Icon = f.icon;
              return (
                <Card key={i} className="hover:border-primary/50 transition-colors">
                  <CardContent className="flex flex-col items-start gap-3 p-5">
                    <div className="rounded-md bg-primary/10 p-2 text-primary">
                      <Icon className="size-5" />
                    </div>
                    <div className="font-semibold">{f.title}</div>
                    <div className="text-sm text-muted-foreground">{f.body}</div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Bot builder highlight */}
      <section className="border-b bg-muted/30 py-12">
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-8 px-4 md:grid-cols-2">
          <div>
            <Badge variant="secondary" className="mb-3">بات‌ساز بدون کدنویسی</Badge>
            <h2 className="text-2xl font-bold md:text-3xl">بات خود را بسازید و گردش کار واقعی تعریف کنید</h2>
            <p className="mt-3 text-sm text-muted-foreground">
              بات تلگرام، باله یا روبیکا را با چند کلیک بسازید؛ توکن شما رمزنگاری می‌شود، وب‌هوک با امضای HMAC تأیید می‌شود و گردش کار قابلیت‌های واقعی پرداخت، کیف پول، طلا و پشتیبانی را به‌هم متصل می‌کند.
            </p>
            <ul className="mt-4 space-y-2 text-sm">
              <li className="flex items-start gap-2"><CheckCircle2Icon className="size-4 mt-0.5 text-primary" /> اتصال کاربران به حساب پُست‌یار با کد یکبار مصرف امضا‌دار</li>
              <li className="flex items-start gap-2"><CheckCircle2Icon className="size-4 mt-0.5 text-primary" /> ارسال فاکتور باله با تأیید سمت-سرور مبلغ</li>
              <li className="flex items-start gap-2"><CheckCircle2Icon className="size-4 mt-0.5 text-primary" /> تاریخچهٔ کامل پیام‌ها برای تحلیل و پشتیبانی</li>
              <li className="flex items-start gap-2"><CheckCircle2Icon className="size-4 mt-0.5 text-primary" /> پرسش و پاسخ هوشمند با حفاظ از حلقه و سهمیه</li>
            </ul>
          </div>
          <Card>
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2 text-base"><BotIcon className="size-4" /> پیش‌نمایش گردش کار</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="space-y-3 text-xs">
                <StepChip label="شروع" />
                <StepArrow />
                <StepChip label="پیام خوش‌آمدگویی" />
                <StepArrow />
                <StepChip label="شرط: کاربر پیوند شده؟" />
                <StepArrow />
                <StepChip label="اقدام: نمایش منوی پرداخت" tone="primary" />
                <StepArrow />
                <StepChip label="اقدام: صدور فاکتور باله" tone="accent" />
                <StepArrow />
                <StepChip label="پایان" />
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-b py-12">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-bold md:text-3xl">پلن‌ها</h2>
            <p className="mt-2 text-sm text-muted-foreground">پلن متناسب با نیاز خود انتخاب کنید.</p>
          </div>
          {plans.length === 0 ? (
            <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
              در حال بارگذاری پلن‌ها…
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {plans.map((p, i) => (
                <Card key={p.id} className={i === 1 ? "border-primary" : ""}>
                  <CardContent className="flex flex-col gap-3 p-6">
                    <div className="flex items-center justify-between">
                      <div className="text-lg font-bold">{p.nameFa}</div>
                      {i === 1 && <Badge>پیشنهادی</Badge>}
                    </div>
                    <div className="text-2xl font-black">
                      {p.priceRials === 0 ? "رایگان" : <>{Intl.NumberFormat("fa-IR").format(p.priceRials)} <span className="text-sm font-normal">ریال</span></>}
                    </div>
                    <p className="text-xs text-muted-foreground">{p.descriptionFa || "—"}</p>
                    <ul className="space-y-1 text-xs">
                      <li className="flex items-center gap-1"><CheckCircle2Icon className="size-3 text-primary" /> انتشار ماهانه: {toPersianDigits(p.quota?.publishPerMonth ?? 0)}</li>
                      <li className="flex items-center gap-1"><CheckCircle2Icon className="size-3 text-primary" /> هوش مصنوعی ماهانه: {toPersianDigits(p.quota?.aiPerMonth ?? 0)}</li>
                      <li className="flex items-center gap-1"><CheckCircle2Icon className="size-3 text-primary" /> کانال‌ها: {toPersianDigits(p.quota?.channels ?? 0)}</li>
                    </ul>
                    <Button className="mt-2" variant={i === 1 ? "default" : "outline"} onClick={() => navigate("/auth")}>انتخاب</Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Trust / Security */}
      <section id="trust" className="border-b py-12">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-bold md:text-3xl">امنیت و اعتماد</h2>
            <p className="mt-2 text-sm text-muted-foreground">پُست‌یار از رویکرد fail-closed استفاده می‌کند.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {TRUST.map((t, i) => {
              const Icon = t.icon;
              return (
                <Card key={i}>
                  <CardContent className="flex flex-col items-start gap-3 p-5">
                    <Icon className="size-6 text-primary" />
                    <div className="font-semibold">{t.title}</div>
                    <div className="text-sm text-muted-foreground">{t.body}</div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="border-b py-12">
        <div className="mx-auto max-w-3xl px-4">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-bold md:text-3xl">سؤالات پرتکرار</h2>
          </div>
          <div className="space-y-2">
            {FAQ.map((f, i) => (
              <div key={i} className="rounded-lg border">
                <button
                  type="button"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="flex w-full items-center justify-between gap-2 p-4 text-right"
                  aria-expanded={openFaq === i}
                >
                  <span className="font-medium">{f.q}</span>
                  <ChevronDownIcon className={`size-4 transition-transform ${openFaq === i ? "rotate-180" : ""}`} />
                </button>
                {openFaq === i && <div className="border-t p-4 text-sm text-muted-foreground">{f.a}</div>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-b bg-primary/5 py-16">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2 className="text-2xl font-bold md:text-3xl">همین حالا شروع کنید</h2>
          <p className="mt-2 text-sm text-muted-foreground">ثبت‌نام در کمتر از یک دقیقه؛ بدون نیاز به کارت اعتباری.</p>
          <Button size="lg" className="mt-6 gap-2" onClick={() => navigate("/auth")}>
            {user ? "ورود به داشبورد" : "ایجاد حساب کاربری"}
            <ArrowLeftIcon className="size-4" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto bg-background py-8">
        <div className="mx-auto max-w-6xl px-4 text-center text-xs text-muted-foreground" dir="rtl">
          <div className="mb-2 flex items-center justify-center gap-2">
            <div className="rounded-md bg-primary p-1 text-primary-foreground">
              <SendIcon className="size-3" />
            </div>
            <span className="font-bold">پُست‌یار</span>
          </div>
          <p>© {toPersianDigits(new Date().getFullYear())} پُست‌یار. تمامی حقوق محفوظ است.</p>
          <p className="mt-1">ساخته‌شده با فونت وزیرمتن، تقویم جلالی و رابط راست‌چین.</p>
        </div>
      </footer>
    </div>
  );
}

function StepChip({ label, tone }: { label: string; tone?: "primary" | "accent" }) {
  const cls = tone === "primary"
    ? "bg-primary text-primary-foreground"
    : tone === "accent"
    ? "bg-accent text-accent-foreground"
    : "bg-muted";
  return <div className={`inline-block rounded-md px-3 py-1 text-xs font-medium ${cls}`}>{label}</div>;
}
function StepArrow() {
  return <div className="text-muted-foreground text-xs" aria-hidden="true">↓</div>;
}

export default Landing;
