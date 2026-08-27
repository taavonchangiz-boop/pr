"use client";
// =====================================================================
// POSTYAR — Payment View (checkout)
// ---------------------------------------------------------------------
// Receives a `planId` and the `navigate` function. On mount, creates a
// subscription order (idempotent — the orderId is persisted in localStorage
// keyed by `${userId}:${planId}` so a page refresh reuses the same order).
//
// Layout:
//   - Order summary (plan name + price + discount input + «اعتبارسنجی»)
//   - Payment method radio cards (3 options):
//       1) کارت به کارت — destination bank cards + receipt upload
//       2) درگاه بانکی (مستقیم / واسطه) — POST /api/payments/bank → redirect
//       3) پرداخت باه — POST /api/payments/bale → show botInvoiceUrl
// =====================================================================
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertCircleIcon,
  ArrowLeftIcon,
  BanknoteIcon,
  CheckCircle2Icon,
  CreditCardIcon,
  ExternalLinkIcon,
  Loader2Icon,
  ReceiptIcon,
  ShieldCheckIcon,
  UploadIcon,
  WalletIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { api, type PlanRow } from "@/components/postyar/api";
import { useSession } from "@/components/layout/session-provider";
import {
  formatRials,
  toPersianDigits,
} from "@/lib/persian";

export interface PaymentViewProps {
  navigate: (to: string) => void;
  planId: string;
}

type PaymentMethod = "card" | "bank" | "bale";

const METHOD_LABELS: Record<PaymentMethod, string> = {
  card: "کارت به کارت",
  bank: "درگاه بانکی",
  bale: "پرداخت باه",
};

const BANK_MODE_LABELS: Record<"direct" | "intermediary", string> = {
  direct: "مستقیم",
  intermediary: "واسطه",
};

function planOrderStorageKey(userId: string | undefined, planId: string) {
  return `postyar:order:${userId ?? "anon"}:${planId}`;
}

function PlanSummary({
  plan,
  amount,
  discountApplied,
  newAmount,
}: {
  plan: PlanRow;
  amount: number;
  discountApplied: { amountOff: number; newAmount: number; descriptionFa?: string } | null;
  newAmount?: number;
}) {
  const effective = discountApplied ? discountApplied.newAmount : (newAmount ?? amount);
  const discount = discountApplied?.amountOff ?? (newAmount !== undefined ? amount - newAmount : 0);
  return (
    <Card dir="rtl">
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span>خلاصهٔ سفارش</span>
          <Badge variant="outline" className="text-xs">اشتراک</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">طرح</span>
          <span className="font-medium">{plan.nameFa}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">دوره</span>
          <span className="font-medium tabular-nums">
            {toPersianDigits(plan.intervalMonths)} ماهه
          </span>
        </div>
        <Separator />
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">مبلغ اصلی</span>
          <span className="tabular-nums">{formatRials(amount)}</span>
        </div>
        {discount > 0 && (
          <>
            <div className="flex items-center justify-between text-success">
              <span className="text-muted-foreground">تخفیف</span>
              <span className="tabular-nums">− {formatRials(discount)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">مبلغ قابل پرداخت</span>
              <span className="font-bold tabular-nums">{formatRials(effective)}</span>
            </div>
          </>
        )}
        {discount === 0 && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">مبلغ قابل پرداخت</span>
            <span className="font-bold tabular-nums">{formatRials(amount)}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DiscountValidator({
  planId,
  amount,
  onApplied,
}: {
  planId: string;
  amount: number;
  onApplied: (r: { amountOff: number; newAmount: number; descriptionFa?: string } | null) => void;
}) {
  const [code, setCode] = useState("");
  const [result, setResult] = useState<{ amountOff: number; newAmount: number; descriptionFa?: string } | null>(null);
  const qc = useQueryClient();

  const validate = useMutation({
    mutationFn: () => api.validateDiscount({ code: code.trim(), planId, amount }),
    onSuccess: (data) => {
      if (data.ok && data.amountOff !== undefined && data.newAmount !== undefined) {
        const r = { amountOff: data.amountOff, newAmount: data.newAmount, descriptionFa: data.descriptionFa };
        setResult(r);
        onApplied(r);
        toast.success(`تخفیف اعمال شد: ${formatRials(data.amountOff)}`);
      } else {
        setResult(null);
        onApplied(null);
        toast.error(data.errorFa ?? "کد تخفیف نامعتبر است.");
      }
      qc.invalidateQueries({ queryKey: ["wallet"] });
    },
    onError: (e: Error) => {
      toast.error(e.message ?? "اعتبارسنجی ناموفق بود.");
    },
  });

  return (
    <div className="flex flex-col gap-2" dir="rtl">
      <Label htmlFor="discount-code" className="text-xs text-muted-foreground">
        کد تخفیف
      </Label>
      <div className="flex gap-2">
        <Input
          id="discount-code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="مثلاً POSTYAR20"
          dir="ltr"
          className="text-left"
        />
        <Button
          variant="secondary"
          onClick={() => validate.mutate()}
          disabled={!code.trim() || validate.isPending}
          className="gap-2"
        >
          {validate.isPending ? <Loader2Icon className="size-4 animate-spin" /> : <ShieldCheckIcon className="size-4" />}
          اعتبارسنجی
        </Button>
      </div>
      {result && (
        <p className="text-xs text-muted-foreground">
          {result.descriptionFa ?? `تخفیف ${formatRials(result.amountOff)} — مبلغ نهایی: ${formatRials(result.newAmount)}`}
        </p>
      )}
    </div>
  );
}

function CardToCardSection({
  orderId,
  navigate,
}: {
  orderId: string;
  navigate: (to: string) => void;
}) {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const cards = useQuery({
    queryKey: ["payment", "bank-cards"],
    queryFn: () => api.getBankCards(),
    staleTime: 60_000,
  });

  const submit = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("ابتدا فیش پرداخت را بارگذاری کنید.");
      setUploading(true);
      try {
        const up = await api.uploadMedia(file, "image");
        const r = await api.uploadReceipt({ orderId, mediaId: up.id });
        return r;
      } finally {
        setUploading(false);
      }
    },
    onSuccess: () => {
      toast.success("فیش با موفقیت ثبت شد. پس از تأیید توسط پشتیبانی، سفارش فعال خواهد شد.");
      setFile(null);
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
      navigate("/dashboard/wallet");
    },
    onError: (e: Error) => {
      toast.error(e.message ?? "بارگذاری فیش ناموفق بود.");
    },
  });

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      <div>
        <h4 className="mb-2 text-sm font-medium">کارت‌های مقصد</h4>
        {cards.isLoading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : cards.data && cards.data.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {cards.data.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between rounded-md border bg-muted/30 p-3 text-sm"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium tabular-nums" dir="ltr">
                    {c.cardNumberMask}
                  </span>
                  <span className="text-xs text-muted-foreground">{c.bankName}</span>
                </div>
                <span className="text-xs">{c.holderName}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">
            کارت مقصدی توسط مدیر سامانه تنظیم نشده است. بعداً تلاش کنید.
          </p>
        )}
      </div>

      <Alert>
        <AlertCircleIcon className="size-4" />
        <AlertTitle>روند کارت به کارت</AlertTitle>
        <AlertDescription className="text-xs">
          مبلغ سفارش را به یکی از کارت‌های بالا واریز کنید، سپس فیش پرداخت را به‌صورت
          تصویر بارگذاری نمایید. پس از تأیید پشتیبانی، اشتراک فعال می‌شود.
        </AlertDescription>
      </Alert>

      <div className="flex flex-col gap-2">
        <Label htmlFor="receipt-file" className="text-xs text-muted-foreground">
          فیش پرداخت (تصویر)
        </Label>
        <Input
          id="receipt-file"
          type="file"
          accept="image/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-xs"
        />
        {file && (
          <div className="text-xs text-muted-foreground">
            فایل انتخابی: <span className="font-medium">{file.name}</span> —{" "}
            {toPersianDigits(Math.round(file.size / 1024))} کیلوبایت
          </div>
        )}
        <Button
          onClick={() => submit.mutate()}
          disabled={!file || uploading || submit.isPending}
          className="gap-2"
        >
          {uploading || submit.isPending ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <UploadIcon className="size-4" />
          )}
          ثبت فیش
        </Button>
      </div>
    </div>
  );
}

function BankGatewaySection({
  orderId,
}: {
  orderId: string;
}) {
  const [mode, setMode] = useState<"direct" | "intermediary">("direct");
  const qc = useQueryClient();

  const create = useMutation({
    mutationFn: () => api.createBankRequest({ orderId, mode }),
    onSuccess: (data) => {
      if (data.ok && data.redirectUrl) {
        toast.success("در حال انتقال به درگاه بانکی...");
        qc.invalidateQueries({ queryKey: ["orders"] });
        // Use a full-page navigation so the user lands on the bank gateway.
        window.location.href = data.redirectUrl;
      } else {
        toast.error(data.errorFa ?? "ایجاد درخواست درگاه ناموفق بود.");
      }
    },
    onError: (e: Error) => {
      toast.error(e.message ?? "ایجاد درخواست درگاه ناموفق بود.");
    },
  });

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      <div>
        <Label className="mb-2 block text-xs text-muted-foreground">نوع درگاه</Label>
        <RadioGroup
          value={mode}
          onValueChange={(v) => setMode(v as "direct" | "intermediary")}
          className="grid grid-cols-2 gap-2"
        >
          {(["direct", "intermediary"] as const).map((m) => (
            <label
              key={m}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-md border p-3 text-sm transition-colors",
                mode === m ? "border-primary bg-primary/5" : "hover:bg-muted/50",
              )}
              htmlFor={`bank-mode-${m}`}
            >
              <RadioGroupItem value={m} id={`bank-mode-${m}`} />
              <span>{BANK_MODE_LABELS[m]}</span>
            </label>
          ))}
        </RadioGroup>
      </div>
      <Alert>
        <ShieldCheckIcon className="size-4" />
        <AlertTitle>امنیت تراکنش</AlertTitle>
        <AlertDescription className="text-xs">
          درگاه بانکی با رمزنگاری TLS و کد یکبار‌مصرف بانکی انجام می‌شود. پس از
          پرداخت، به‌صورت خودکار به پُست‌یار بازمی‌گردید.
        </AlertDescription>
      </Alert>
      <Button onClick={() => create.mutate()} disabled={create.isPending} className="gap-2">
        {create.isPending ? <Loader2Icon className="size-4 animate-spin" /> : <CreditCardIcon className="size-4" />}
        پرداخت از طریق درگاه
      </Button>
    </div>
  );
}

function BalePaymentSection({
  orderId,
}: {
  orderId: string;
}) {
  const [botId, setBotId] = useState("");
  const [chatId, setChatId] = useState("");
  const [invoiceUrl, setInvoiceUrl] = useState<string | null>(null);

  const bots = useQuery({
    queryKey: ["payment", "bale-bots"],
    queryFn: async () => {
      const all = await api.getBots();
      return all.filter((b) => b.provider === "bale" && b.status === "active");
    },
    staleTime: 30_000,
  });

  const create = useMutation({
    mutationFn: () => api.createBaleRequest({ orderId, botId, chatId }),
    onSuccess: (data) => {
      if (data.ok && data.botInvoiceUrl) {
        setInvoiceUrl(data.botInvoiceUrl);
        toast.success("فاکتور پرداخت باه ایجاد شد.");
      } else {
        toast.error(data.errorFa ?? "ایجاد فاکتور باه ناموفق بود.");
      }
    },
    onError: (e: Error) => {
      toast.error(e.message ?? "ایجاد فاکتور باه ناموفق بود.");
    },
  });

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      {bots.isLoading ? (
        <Skeleton className="h-10 w-full" />
      ) : bots.data && bots.data.length > 0 ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="bale-bot" className="text-xs text-muted-foreground">
            ربات باه
          </Label>
          <select
            id="bale-bot"
            value={botId}
            onChange={(e) => setBotId(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">— انتخاب ربات —</option>
            {bots.data.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <Alert>
          <AlertCircleIcon className="size-4" />
          <AlertTitle>ربات باه فعال ندارید</AlertTitle>
          <AlertDescription className="text-xs">
            برای پرداخت باه، ابتدا یک ربات باه فعال در بخش «بات‌ساز» اضافه کنید و
            سپس /start را در ربات بزنید تا چت آی‌دی شما مشخص شود.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="bale-chat-id" className="text-xs text-muted-foreground">
          چت آی‌دی شما در باه
        </Label>
        <Input
          id="bale-chat-id"
          value={chatId}
          onChange={(e) => setChatId(e.target.value)}
          placeholder="مثلاً 123456789"
          dir="ltr"
          className="text-left"
          inputMode="numeric"
        />
        <p className="text-xs text-muted-foreground">
          چت آی‌دی عددی که ربات باه شما را با آن می‌شناسد.
        </p>
      </div>

      <Button
        onClick={() => create.mutate()}
        disabled={!botId || !chatId || create.isPending}
        className="gap-2"
      >
        {create.isPending ? <Loader2Icon className="size-4 animate-spin" /> : <WalletIcon className="size-4" />}
        ایجاد فاکتور باه
      </Button>

      {invoiceUrl && (
        <Alert>
          <CheckCircle2Icon className="size-4" />
          <AlertTitle>فاکتور ایجاد شد</AlertTitle>
          <AlertDescription className="flex flex-col gap-2 text-xs">
            <span>برای پرداخت، روی دکمهٔ زیر بزنید تا وارد ربات باه شوید.</span>
            <a href={invoiceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex w-fit items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground">
              <ExternalLinkIcon className="size-3.5" />
              باز کردن فاکتور باه
            </a>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function MethodCard({
  method,
  active,
  onPick,
}: {
  method: PaymentMethod;
  active: boolean;
  onPick: () => void;
}) {
  const Icon =
    method === "card" ? ReceiptIcon : method === "bank" ? BanknoteIcon : WalletIcon;
  return (
    <label
      htmlFor={`method-${method}`}
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-md border-2 p-3 transition-colors",
        active ? "border-primary bg-primary/5" : "hover:bg-muted/50",
      )}
      dir="rtl"
    >
      <RadioGroupItem value={method} id={`method-${method}`} className="mt-1" />
      <Icon className="mt-0.5 size-5 shrink-0 text-primary" />
      <div className="flex flex-col gap-0.5">
        <span className="font-medium">{METHOD_LABELS[method]}</span>
        <span className="text-xs text-muted-foreground">
          {method === "card" && "واریز به کارت مقصد و بارگذاری فیش"}
          {method === "bank" && "پرداخت آنلاین از طریق درگاه بانکی"}
          {method === "bale" && "پرداخت از کیف پول باه (ربات)"}
        </span>
      </div>
    </label>
  );
}

export default function PaymentView({ navigate, planId }: PaymentViewProps) {
  const { user } = useSession();
  const [method, setMethod] = useState<PaymentMethod>("card");
  const [orderId, setOrderId] = useState<string | null>(null);
  const [orderAmount, setOrderAmount] = useState<number | null>(null);
  const [discount, setDiscount] = useState<{ amountOff: number; newAmount: number; descriptionFa?: string } | null>(null);

  // Load the plan details (for the summary card).
  const plan = useQuery({
    queryKey: ["plans", planId],
    queryFn: async () => {
      const all = await api.getPlans();
      const found = all.find((p) => p.id === planId);
      if (!found) throw new Error("پلن یافت نشد.");
      return found as PlanRow;
    },
    staleTime: 60_000,
  });

  const idemKey = useMemo(() => `order:${user?.id ?? "anon"}:subscription:${planId}`, [user?.id, planId]);
  const storageKey = useMemo(() => planOrderStorageKey(user?.id, planId), [user?.id, planId]);

  // Create the order idempotently on mount. Persist the orderId so a refresh
  // reuses the same order instead of double-charging.
  const createOrder = useMutation({
    mutationFn: () =>
      api.createOrder({
        kind: "subscription",
        planId,
        idempotencyKey: idemKey,
      }),
    onSuccess: (data) => {
      setOrderId(data.order.id);
      setOrderAmount(data.order.amountRials);
      try {
        window.localStorage.setItem(storageKey, data.order.id);
      } catch {
        // localStorage unavailable — non-fatal.
      }
    },
    onError: (e: Error) => {
      toast.error(e.message ?? "ایجاد سفارش ناموفق بود.");
    },
  });

  useEffect(() => {
    if (!planId || !user) return;
    const cached = (() => {
      try {
        return window.localStorage.getItem(storageKey);
      } catch {
        return null;
      }
    })();
    if (cached) {
      // Re-validate the cached orderId by fetching it.
      api.getOrder(cached).then((detail) => {
        if (detail.status === "pending") {
          setOrderId(detail.id);
          setOrderAmount(detail.amountRials);
        } else {
          // Stale — create a fresh order.
          createOrder.mutate();
        }
      }).catch(() => {
        // Cached orderId no longer exists — create a new order.
        createOrder.mutate();
      });
    } else {
      createOrder.mutate();
    }
  }, [planId, user?.id, createOrder, storageKey]);

  const effectiveAmount = discount ? discount.newAmount : (orderAmount ?? 0);

  if (plan.isLoading) {
    return (
      <div className="flex flex-col gap-4" dir="rtl">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full lg:col-span-2" />
        </div>
      </div>
    );
  }
  if (plan.error || !plan.data) {
    return (
      <Card dir="rtl">
        <CardHeader>
          <CardTitle>پلن یافت نشد</CardTitle>
          <CardDescription>پلن انتخاب‌شده معتبر نیست یا حذف شده است.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="secondary" onClick={() => navigate("/dashboard/plans")} className="gap-2">
            <ArrowLeftIcon className="size-4" />
            بازگشت به پلن‌ها
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6" dir="rtl">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">تسویه‌حساب</h1>
          <p className="text-sm text-muted-foreground">
            پلن: <span className="font-medium">{plan.data.nameFa}</span> —{" "}
            {toPersianDigits(plan.data.intervalMonths)} ماهه
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard/plans")} className="gap-2">
        <ArrowLeftIcon className="size-4" />
          بازگشت
        </Button>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4">
          {orderAmount !== null && (
            <PlanSummary
              plan={plan.data}
              amount={orderAmount}
              discountApplied={discount}
              newAmount={discount?.newAmount}
            />
          )}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">کد تخفیف</CardTitle>
            </CardHeader>
            <CardContent>
              <DiscountValidator
                planId={planId}
                amount={orderAmount ?? plan.data.priceRials}
                onApplied={setDiscount}
              />
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">روش پرداخت</CardTitle>
              <CardDescription>یکی از روش‌های زیر را انتخاب کنید.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {!orderId && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground" dir="rtl">
                  <Loader2Icon className="size-4 animate-spin" />
                  در حال ایجاد سفارش...
                </div>
              )}
              {orderId && (
                <>
                  <RadioGroup
                    value={method}
                    onValueChange={(v) => setMethod(v as PaymentMethod)}
                    className="flex flex-col gap-2"
                  >
                    {(["card", "bank", "bale"] as const).map((m) => (
                      <MethodCard
                        key={m}
                        method={m}
                        active={method === m}
                        onPick={() => setMethod(m)}
                      />
                    ))}
                  </RadioGroup>

                  <Separator />

                  {method === "card" && <CardToCardSection orderId={orderId} navigate={navigate} />}
                  {method === "bank" && <BankGatewaySection orderId={orderId} />}
                  {method === "bale" && <BalePaymentSection orderId={orderId} />}
                </>
              )}
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardContent className="p-4 text-xs text-muted-foreground" dir="rtl">
              <div className="flex items-center gap-2 font-medium text-foreground">
                <ShieldCheckIcon className="size-4" />
                تراکنش امن
              </div>
              <p className="mt-1 leading-relaxed">
                تمام پرداخت‌ها رمزنگاری می‌شوند و در سوابق حساب شما ثبت می‌گردد. در صورت
                بروز مشکل، می‌توانید به بخش «تیکت» مراجعه کنید. مبلغ قابل پرداخت:{" "}
                <span className="font-bold tabular-nums">{formatRials(effectiveAmount)}</span>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
