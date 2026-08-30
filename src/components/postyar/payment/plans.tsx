"use client";
// =====================================================================
// POSTYAR — Plans View (subscription pricing cards + no-plan checkout)
// ---------------------------------------------------------------------
// Lists the public plans as pricing cards. Each card shows:
//   - name (Persian)
//   - price (Rials, formatted with thousands separator + Persian digits)
//   - interval (Persian months)
//   - feature list derived from the quota JSON
//   - «انتخاب پلن» button → /dashboard/payment/<planId>
//
// ITEM 13 — «تسویه‌حساب (بدون پلن)»: an inline Card above the plan grid
// lets the user enter an arbitrary amount in Rials (Persian digits) +
// choose a provider (card / bank / bale), submit, and proceed to the
// existing payment provider flow (POST /api/orders with kind=
// "wallet_credit" + amount + provider, NO planId). The order is created
// idempotently with a random idempotency key, then the appropriate
// payment section (card-to-card receipt upload / bank redirect / bale
// invoice) is rendered inline.
// =====================================================================
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertCircleIcon,
  BanknoteIcon,
  CheckIcon,
  CreditCardIcon,
  ExternalLinkIcon,
  Loader2Icon,
  PlusIcon,
  ReceiptIcon,
  ShieldCheckIcon,
  SparklesIcon,
  UploadIcon,
  WalletIcon,
  ZapIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { api, type BankCardRow, type BotRow, type PlanRow } from "@/components/postyar/api";
import { formatRials, fromPersianDigits, toPersianDigits } from "@/lib/persian";
import { randomToken } from "@/lib/security/crypto";
import { cn } from "@/lib/utils";

export interface PlansViewProps {
  navigate: (to: string) => void;
}

// Quota dimension → Persian label map. The plans seed uses these 4 keys.
const QUOTA_LABELS: Record<string, string> = {
  publishPerMonth: "انتشار پست در ماه",
  aiPerMonth: "تولید هوش مصنوعی در ماه",
  channels: "تعداد کانال‌ها",
  automation: "اتوماسیون",
};

function quotaFeatures(plan: PlanRow): Array<{ label: string; value: string }> {
  const out: Array<{ label: string; value: string }> = [];
  for (const [key, val] of Object.entries(plan.quota ?? {})) {
    if (typeof val !== "number") continue;
    const label = QUOTA_LABELS[key] ?? key;
    out.push({ label, value: toPersianDigits(val) });
  }
  return out;
}

function PlanCard({ plan, onPick }: { plan: PlanRow; onPick: () => void }) {
  const isFree = plan.priceRials === 0;
  const isHighlight = plan.code === "pro" || plan.code === "basic";
  return (
    <Card
      className={cn(
        "relative flex flex-col gap-4 border-2 transition-all hover:shadow-lg",
        isHighlight ? "border-primary/60 shadow-md" : "border-border",
      )}
      dir="rtl"
    >
      {isHighlight && (
        <div className="absolute -top-3 right-4">
          <Badge className="gap-1 bg-primary text-primary-foreground">
            <SparklesIcon className="size-3" />
            پیشنهاد ما
          </Badge>
        </div>
      )}
      <CardHeader className="gap-2 pb-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-2xl">{plan.nameFa}</CardTitle>
          {isFree ? <ZapIcon className="size-5 text-muted-foreground" /> : null}
        </div>
        <CardDescription className="text-xs leading-relaxed">{plan.descriptionFa}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="flex flex-col gap-0.5">
          <div className="text-3xl font-bold tabular-nums" dir="rtl">
            {isFree ? "رایگان" : formatRials(plan.priceRials)}
          </div>
          <div className="text-xs text-muted-foreground">
            به ازای هر {toPersianDigits(plan.intervalMonths)} ماه
          </div>
        </div>

        <div className="flex-1">
          <ul className="flex flex-col gap-2 text-sm">
            {quotaFeatures(plan).map((f) => (
              <li key={f.label} className="flex items-center gap-2">
                <CheckIcon className="size-4 shrink-0 text-primary" />
                <span className="text-muted-foreground">{f.label}:</span>
                <span className="font-medium tabular-nums">{f.value}</span>
              </li>
            ))}
            {quotaFeatures(plan).length === 0 && (
              <li className="text-xs text-muted-foreground">بدون سهمیهٔ مشخص.</li>
            )}
          </ul>
        </div>

        <Button
          onClick={onPick}
          disabled={!plan.active}
          className="w-full gap-2 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {isFree ? "شروع رایگان" : "انتخاب پلن"}
        </Button>
      </CardContent>
    </Card>
  );
}

function PlansSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" dir="rtl">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-80 w-full" />
      ))}
    </div>
  );
}

// =====================================================================
// ITEM 13 — «تسویه‌حساب (بدون پلن)»
// =====================================================================
const NO_PLAN_METHODS = [
  { id: "card" as const, label: "کارت به کارت", desc: "واریز به کارت مقصد و بارگذاری فیش", icon: ReceiptIcon },
  { id: "bank" as const, label: "درگاه بانکی", desc: "پرداخت آنلاین از طریق درگاه بانکی", icon: BanknoteIcon },
  { id: "bale" as const, label: "پرداخت با بله", desc: "پرداخت از کیف پول بله (ربات)", icon: WalletIcon },
];

const MIN_AMOUNT_RIALS = 100_000; // server enforces — 10,000 toman

function NoPlanCheckout({ navigate }: { navigate: (to: string) => void }) {
  const qc = useQueryClient();
  const [amountInput, setAmountInput] = useState(""); // Persian digits string
  const [method, setMethod] = useState<"card" | "bank" | "bale">("card");
  const [orderId, setOrderId] = useState<string | null>(null);
  const [orderAmount, setOrderAmount] = useState<number | null>(null);

  // Parse the Persian-digit amount string into integer rials.
  const amountRials = useMemo(() => {
    if (!amountInput) return 0;
    const digits = fromPersianDigits(amountInput).replace(/[^\d]/g, "");
    if (!digits) return 0;
    return parseInt(digits, 10) || 0;
  }, [amountInput]);

  const valid = amountRials >= MIN_AMOUNT_RIALS;

  // Create a wallet_credit order idempotently. The idempotency key is
  // randomized per submit so a fresh order is created when the user
  // changes the amount or method.
  const createOrder = useMutation({
    mutationFn: () =>
      api.createOrder({
        kind: "wallet_credit",
        amount: amountRials,
        provider: method,
        idempotencyKey: `wallet:noplan:${randomToken(12)}`,
      }),
    onSuccess: (data) => {
      setOrderId(data.order.id);
      setOrderAmount(data.order.amountRials);
      toast.success("سفارش شارژ کیف پول ایجاد شد. اکنون پرداخت را تکمیل کنید.");
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (e: Error) => {
      toast.error(e.message ?? "ایجاد سفارش ناموفق بود.");
    },
  });

  function reset() {
    setOrderId(null);
    setOrderAmount(null);
    setAmountInput("");
  }

  return (
    <Card dir="rtl" className="border-2 border-primary/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <WalletIcon className="size-4 text-primary" />
          تسویه‌حساب (بدون پلن)
        </CardTitle>
        <CardDescription className="text-xs">
          شارژ مستقیم کیف پول با مبلغ دلخواه — بدون انتخاب پلن. حداقل مبلغ{" "}
          {formatRials(MIN_AMOUNT_RIALS)} است.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!orderId ? (
          <>
            {/* Amount input */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="np-amount" className="text-xs text-muted-foreground">
                مبلغ (ریال)
              </Label>
              <Input
                id="np-amount"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                placeholder="مثلاً ۱۰۰٬۰۰۰"
                dir="ltr"
                inputMode="numeric"
                className={cn(
                  "text-left tabular-nums focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  amountInput && !valid && "border-destructive",
                )}
              />
              {amountInput && (
                <span className={cn("text-[10px]", valid ? "text-muted-foreground" : "text-destructive")}>
                  معادل: {formatRials(amountRials)}
                  {!valid && " — کمتر از حداقل مجاز."}
                </span>
              )}
            </div>

            {/* Provider radio */}
            <div className="flex flex-col gap-2">
              <Label className="text-xs text-muted-foreground">روش پرداخت</Label>
              <RadioGroup
                value={method}
                onValueChange={(v) => setMethod(v as "card" | "bank" | "bale")}
                className="flex flex-col gap-2"
              >
                {NO_PLAN_METHODS.map((m) => {
                  const Icon = m.icon;
                  const active = method === m.id;
                  return (
                    <label
                      key={m.id}
                      htmlFor={`np-method-${m.id}`}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-md border-2 p-3 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                        active ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                      )}
                    >
                      <RadioGroupItem value={m.id} id={`np-method-${m.id}`} className="mt-1" />
                      <Icon className="mt-0.5 size-5 shrink-0 text-primary" />
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium">{m.label}</span>
                        <span className="text-xs text-muted-foreground">{m.desc}</span>
                      </div>
                    </label>
                  );
                })}
              </RadioGroup>
            </div>

            <Button
              onClick={() => createOrder.mutate()}
              disabled={!valid || createOrder.isPending}
              className="gap-2 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {createOrder.isPending ? <Loader2Icon className="size-4 animate-spin" /> : <PlusIcon className="size-4" />}
              ایجاد سفارش و ادامهٔ پرداخت
            </Button>
          </>
        ) : (
          // Payment flow section — rendered inline after order creation.
          <>
            <Alert>
              <CheckIcon className="size-4" />
              <AlertTitle>سفارش ایجاد شد</AlertTitle>
              <AlertDescription className="text-xs">
                شناسهٔ سفارش: <span className="font-mono" dir="ltr">{orderId}</span>
                {orderAmount !== null && <> — مبلغ: <span className="tabular-nums">{formatRials(orderAmount)}</span></>}
              </AlertDescription>
            </Alert>
            <Separator />
            {method === "card" && orderAmount !== null && (
              <NoPlanCardFlow orderId={orderId} amount={orderAmount} navigate={navigate} onReset={reset} />
            )}
            {method === "bank" && <NoPlanBankFlow orderId={orderId} />}
            {method === "bale" && <NoPlanBaleFlow orderId={orderId} />}
            <Button
              variant="ghost"
              size="sm"
              onClick={reset}
              className="gap-2 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              بازگشت به فرم
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------
// NoPlanCardFlow — destination cards + upload receipt (mirrors the
// plan-based CardToCardSection, specialized for the wallet_credit order).
// ---------------------------------------------------------------------
function NoPlanCardFlow({
  orderId,
  amount,
  navigate,
  onReset,
}: {
  orderId: string;
  amount: number;
  navigate: (to: string) => void;
  onReset: () => void;
}) {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);

  const cards = useQuery({
    queryKey: ["payment", "bank-cards"],
    queryFn: () => api.getBankCards(),
    staleTime: 60_000,
  });

  const submit = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("ابتدا فیش پرداخت را بارگذاری کنید.");
      const up = await api.uploadMedia(file, "image");
      return api.uploadReceipt({ orderId, mediaId: up.id });
    },
    onSuccess: () => {
      toast.success("فیش با موفقیت ثبت شد. پس از تأیید توسط پشتیبانی، کیف پول شما شارژ خواهد شد.");
      setFile(null);
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
      onReset();
      navigate("/dashboard/orders");
    },
    onError: (e: Error) => toast.error(e.message ?? "بارگذاری فیش ناموفق بود."),
  });

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      {/* Destination cards */}
      <div>
        <h4 className="mb-3 flex items-center gap-2 text-sm font-medium">
          <CreditCardIcon className="size-4 text-primary" />
          کارت‌های مقصد
        </h4>
        {cards.isLoading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-24 w-full max-w-md" />
            <Skeleton className="h-24 w-full max-w-md" />
          </div>
        ) : cards.error ? (
          <Alert variant="destructive">
            <AlertCircleIcon className="size-4" />
            <AlertTitle>بارگذاری ناموفق</AlertTitle>
            <AlertDescription className="text-xs">کارت‌های مقصد بارگذاری نشدند.</AlertDescription>
          </Alert>
        ) : cards.data && cards.data.length > 0 ? (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {cards.data.map((c: BankCardRow) => (
              <li
                key={c.id}
                className="rounded-md border bg-muted/30 p-3 text-xs"
                dir="rtl"
              >
                <div className="font-medium">{c.bankName}</div>
                <div className="mt-1 font-mono tabular-nums" dir="ltr">{c.cardNumberMask}</div>
                <div className="mt-0.5 text-muted-foreground">{c.holderName}</div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">
            کارت مقصدی توسط مدیر سامانه تنظیم نشده است. بعداً تلاش کنید.
          </p>
        )}
      </div>

      {/* Amount box */}
      {amount > 0 && (
        <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3" dir="rtl">
          <span className="text-sm text-muted-foreground">مبلغ قابل پرداخت</span>
          <span className="text-xl font-bold tabular-nums">{formatRials(amount)}</span>
        </div>
      )}

      <Alert>
        <AlertCircleIcon className="size-4" />
        <AlertTitle>روند کارت به کارت</AlertTitle>
        <AlertDescription className="text-xs">
          مبلغ سفارش را به یکی از کارت‌های بالا واریز کنید، سپس فیش پرداخت را به‌صورت
          تصویر بارگذاری نمایید. پس از تأیید پشتیبانی، کیف پول شما شارژ می‌شود.
        </AlertDescription>
      </Alert>

      <div className="flex flex-col gap-2">
        <Label htmlFor="np-receipt-file" className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <UploadIcon className="size-3.5" />
          بارگذاری رسید (تصویر فیش)
        </Label>
        <Input
          id="np-receipt-file"
          type="file"
          accept="image/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        />
        {file && (
          <div className="text-xs text-muted-foreground">
            فایل انتخابی: <span className="font-medium">{file.name}</span> —{" "}
            {toPersianDigits(Math.round(file.size / 1024))} کیلوبایت
          </div>
        )}
        <Button
          onClick={() => submit.mutate()}
          disabled={!file || submit.isPending}
          className="gap-2 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {submit.isPending ? <Loader2Icon className="size-4 animate-spin" /> : <UploadIcon className="size-4" />}
          بارگذاری رسید
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// NoPlanBankFlow — single button to redirect to the bank gateway.
// ---------------------------------------------------------------------
function NoPlanBankFlow({ orderId }: { orderId: string }) {
  const qc = useQueryClient();
  const create = useMutation({
    mutationFn: () => api.createBankRequest({ orderId }),
    onSuccess: (data) => {
      if (data.ok && data.redirectUrl) {
        toast.success("در حال انتقال به درگاه بانکی...");
        qc.invalidateQueries({ queryKey: ["orders"] });
        window.location.href = data.redirectUrl;
      } else {
        toast.error(data.errorFa ?? "ایجاد درخواست درگاه ناموفق بود.");
      }
    },
    onError: (e: Error) => toast.error(e.message ?? "ایجاد درخواست درگاه ناموفق بود."),
  });

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      <Alert>
        <ShieldCheckIcon className="size-4" />
        <AlertTitle>امنیت تراکنش</AlertTitle>
        <AlertDescription className="text-xs">
          درگاه بانکی با رمزنگاری TLS و کد یکبار‌مصرف بانکی انجام می‌شود. پس از
          پرداخت، به‌صورت خودکار به پُست‌یار بازمی‌گردید.
        </AlertDescription>
      </Alert>
      <Button
        onClick={() => create.mutate()}
        disabled={create.isPending}
        className="gap-2 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {create.isPending ? <Loader2Icon className="size-4 animate-spin" /> : <CreditCardIcon className="size-4" />}
        پرداخت از طریق درگاه
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------
// NoPlanBaleFlow — bot select + chat id input → create bale invoice.
// ---------------------------------------------------------------------
function NoPlanBaleFlow({ orderId }: { orderId: string }) {
  const [botId, setBotId] = useState("");
  const [chatId, setChatId] = useState("");
  const [invoiceUrl, setInvoiceUrl] = useState<string | null>(null);

  const bots = useQuery({
    queryKey: ["payment", "bale-bots"],
    queryFn: async () => {
      const all = await api.getBots();
      return all.filter((b: BotRow) => b.provider === "bale" && b.status === "active");
    },
    staleTime: 30_000,
  });

  const create = useMutation({
    mutationFn: () => api.createBaleRequest({ orderId, botId, chatId }),
    onSuccess: (data) => {
      if (data.ok && data.botInvoiceUrl) {
        setInvoiceUrl(data.botInvoiceUrl);
        toast.success("فاکتور پرداخت با بله ایجاد شد.");
      } else {
        toast.error(data.errorFa ?? "ایجاد فاکتور بله ناموفق بود.");
      }
    },
    onError: (e: Error) => toast.error(e.message ?? "ایجاد فاکتور بله ناموفق بود."),
  });

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      {bots.isLoading ? (
        <Skeleton className="h-10 w-full" />
      ) : bots.data && bots.data.length > 0 ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="np-bale-bot" className="text-xs text-muted-foreground">
            ربات بله
          </Label>
          <select
            id="np-bale-bot"
            value={botId}
            onChange={(e) => setBotId(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <option value="">— انتخاب ربات —</option>
            {bots.data.map((b: BotRow) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      ) : (
        <Alert>
          <AlertCircleIcon className="size-4" />
          <AlertTitle>ربات بله فعال ندارید</AlertTitle>
          <AlertDescription className="text-xs">
            برای پرداخت با بله، ابتدا یک ربات بله فعال در بخش «بات‌ساز» اضافه کنید و
            سپس /start را در ربات بزنید تا چت آی‌دی شما مشخص شود.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="np-bale-chat-id" className="text-xs text-muted-foreground">
          چت آی‌دی شما در بله
        </Label>
        <Input
          id="np-bale-chat-id"
          value={chatId}
          onChange={(e) => setChatId(e.target.value)}
          placeholder="مثلاً 123456789"
          dir="ltr"
          className="text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          inputMode="numeric"
        />
        <p className="text-xs text-muted-foreground">
          چت آی‌دی عددی که ربات بله شما را با آن می‌شناسد.
        </p>
      </div>

      <Button
        onClick={() => create.mutate()}
        disabled={!botId || !chatId || create.isPending}
        className="gap-2 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {create.isPending ? <Loader2Icon className="size-4 animate-spin" /> : <WalletIcon className="size-4" />}
        ایجاد فاکتور بله
      </Button>

      {invoiceUrl && (
        <Alert>
          <CheckIcon className="size-4" />
          <AlertTitle>فاکتور ایجاد شد</AlertTitle>
          <AlertDescription className="flex flex-col gap-2 text-xs">
            <span>برای پرداخت، روی دکمهٔ زیر بزنید تا وارد ربات بله شوید.</span>
            <a
              href={invoiceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-fit cursor-pointer items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ExternalLinkIcon className="size-3.5" />
              باز کردن فاکتور بله
            </a>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

export default function PlansView({ navigate }: PlansViewProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["plans"],
    queryFn: () => api.getPlans(),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (error) toast.error("بارگذاری پلن‌ها ناموفق بود.");
  }, [error]);

  if (isLoading) return <PlansSkeleton />;
  if (error) {
    return (
      <div className="flex flex-col gap-4" dir="rtl">
        <NoPlanCheckout navigate={navigate} />
        <Card dir="rtl">
          <CardHeader>
            <CardTitle>خطا</CardTitle>
            <CardDescription>بارگذاری پلن‌ها ناموفق بود. بعداً تلاش کنید.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }
  const plans = (data ?? []).filter((p) => p.isPublic);

  return (
    <div className="flex flex-col gap-6" dir="rtl">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">پلن‌های اشتراک</h1>
        <p className="text-sm text-muted-foreground">
          پلن مناسب کسب‌وکار خود را انتخاب کنید. همهٔ پلن‌ها شامل انتشار خودکار، تقویم
          محتوایی و پشتیبانی فارسی هستند.
        </p>
      </header>

      <NoPlanCheckout navigate={navigate} />

      {plans.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>پلنی منتشر نشده است</CardTitle>
            <CardDescription>
              در حال حاضر هیچ پلن عمومی‌ای فعال نیست. بعداً تلاش کنید.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              onPick={() => navigate(`/dashboard/payment/${plan.id}`)}
            />
          ))}
        </div>
      )}

      <div className="rounded-md border bg-muted/30 p-4 text-xs text-muted-foreground" dir="rtl">
        <div className="mb-1 flex items-center gap-2 font-medium text-foreground">
          <ShieldCheckIcon className="size-3.5" />
          نکته
        </div>
        پرداخت از طریق کارت به کارت، درگاه بانکی (مستقیم / واسطه) و پرداخت با بله انجام
        می‌شود. پس از پرداخت، اشتراک به‌صورت خودکار فعال می‌شود. در صورت انتخاب
        «تسویه‌حساب بدون پلن»، مبلغ مستقیم به کیف پول شما شارژ می‌شود.
      </div>
    </div>
  );
}
