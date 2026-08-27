"use client";
// =====================================================================
// POSTYAR — Plans View (subscription pricing cards)
// ---------------------------------------------------------------------
// Lists the public plans as pricing cards. Each card shows:
//   - name (Persian)
//   - price (Rials, formatted with thousands separator + Persian digits)
//   - interval (Persian months)
//   - feature list derived from the quota JSON
//   - «انتخاب پلن» button → /dashboard/payment/<planId>
//
// The «رایگان» plan is highlighted as the current/entry-level tier when the
// user has no active subscription.
// =====================================================================
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckIcon, Loader2Icon, SparklesIcon, ZapIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { api, type PlanRow } from "@/components/postyar/api";
import { formatRials, toPersianDigits } from "@/lib/persian";
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

        <Button onClick={onPick} disabled={!plan.active} className="w-full gap-2">
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
      <Card dir="rtl">
        <CardHeader>
          <CardTitle>خطا</CardTitle>
          <CardDescription>بارگذاری پلن‌ها ناموفق بود. بعداً تلاش کنید.</CardDescription>
        </CardHeader>
      </Card>
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
          <Loader2Icon className="size-3.5" />
          نکته
        </div>
        پرداخت از طریق کارت به کارت، درگاه بانکی (مستقیم / واسطه) و پرداخت باه انجام
        می‌شود. پس از پرداخت، اشتراک به‌صورت خودکار فعال می‌شود.
      </div>
    </div>
  );
}
