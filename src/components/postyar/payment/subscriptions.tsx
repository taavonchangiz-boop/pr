"use client";
// =====================================================================
// POSTYAR — Subscriptions View (current subscription + quota progress)
// ---------------------------------------------------------------------
// Shows:
//   - current active subscription: plan name, endsAt (Jalali)
//   - used quota vs limit per dimension (publishPerMonth, aiPerMonth,
//     channels, automation) with progress bars
//   - Buttons: تمدید | ارتقاء | لغو
// =====================================================================
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertCircleIcon,
  BotIcon,
  CalendarClockIcon,
  Loader2Icon,
  SparklesIcon,
  ZapIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { api } from "@/components/postyar/api";
import { formatJalaliDate, formatRelative, toPersianDigits } from "@/lib/persian";

export interface SubscriptionsViewProps {
  navigate: (to: string) => void;
}

const QUOTA_META: Array<{
  key: "publishPerMonth" | "aiPerMonth" | "channels" | "automation";
  label: string;
  unit: string;
}> = [
  { key: "publishPerMonth", label: "انتشار پست", unit: "پست" },
  { key: "aiPerMonth", label: "هوش مصنوعی", unit: "درخواست" },
  { key: "channels", label: "کانال‌ها", unit: "کانال" },
  { key: "automation", label: "اتوماسیون", unit: "گردشکار" },
];

function QuotaBar({
  label,
  used,
  limit,
  unit,
}: {
  label: string;
  used: number;
  limit: number;
  unit: string;
}) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const isOver = used > limit && limit > 0;
  const isNear = pct >= 80 && !isOver;
  return (
    <div className="flex flex-col gap-1" dir="rtl">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-xs text-muted-foreground">
          {toPersianDigits(used)} از {toPersianDigits(limit)} {unit}
        </span>
      </div>
      <Progress
        value={pct}
        className={isOver ? "[&>div]:bg-destructive" : isNear ? "[&>div]:bg-amber-500" : ""}
      />
      {isOver && (
        <span className="text-xs text-destructive">سهمیه این ماه تکمیل شد.</span>
      )}
      {isNear && (
        <span className="text-xs text-amber-600">به سقف سهمیه نزدیک هستید.</span>
      )}
    </div>
  );
}

function ActiveSubCard({
  subscription,
  quota,
  navigate,
}: {
  subscription: { id: string; planId: string; planNameFa: string; status: string; startedAt: string; endsAt: string } | null;
  quota: {
    publishPerMonth: { used: number; limit: number };
    aiPerMonth: { used: number; limit: number };
    channels: { used: number; limit: number };
    automation: { used: number; limit: number };
    planNameFa?: string;
    endsAt?: string;
  };
  navigate: (to: string) => void;
}) {
  if (!subscription) {
    return (
      <Card dir="rtl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertCircleIcon className="size-4" />
            اشتراک فعالی ندارید
          </CardTitle>
          <CardDescription className="text-xs">
            شما در حال استفاده از پلن رایگان هستید. برای دسترسی به سهمیه‌های بیشتر، یکی از پلن‌های پولی را انتخاب کنید.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => navigate("/dashboard/plans")} className="gap-2">
            <SparklesIcon className="size-4" />
            مشاهدهٔ پلن‌ها
          </Button>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card dir="rtl">
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <SparklesIcon className="size-4 text-primary" />
            اشتراک فعال
          </span>
          <Badge variant="default">{subscription.planNameFa}</Badge>
        </CardTitle>
        <CardDescription className="text-xs">
          {subscription.status === "active" ? "روشن و فعال" : subscription.status}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <CalendarClockIcon className="size-3.5" />
            پایان اشتراک: {formatJalaliDate(subscription.endsAt)}
          </span>
          <span className="text-muted-foreground">•</span>
          <span>مانده: {formatRelative(subscription.endsAt)}</span>
        </div>

        <div className="flex flex-col gap-3 rounded-md border bg-muted/20 p-4">
          <div className="text-xs font-medium text-foreground">سهمیه‌های این دوره</div>
          {QUOTA_META.map((q) => {
            const d = quota[q.key];
            return (
              <QuotaBar
                key={q.key}
                label={q.label}
                used={d.used}
                limit={d.limit}
                unit={q.unit}
              />
            );
          })}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => navigate("/dashboard/plans")} className="gap-2">
            <ZapIcon className="size-4" />
            تمدید
          </Button>
          <Button variant="secondary" onClick={() => navigate("/dashboard/plans")} className="gap-2">
            <SparklesIcon className="size-4" />
            ارتقاء
          </Button>
          <Button variant="outline" onClick={() => navigate("/dashboard/orders")} className="gap-2">
            <BotIcon className="size-4" />
            تاریخچهٔ سفارش‌ها
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SubscriptionsView({ navigate }: SubscriptionsViewProps) {
  const subQ = useQuery({
    queryKey: ["subscriptions", "mine"],
    queryFn: () => api.getMySubscription(),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (subQ.error) toast.error("بارگذاری اشتراک ناموفق بود.");
  }, [subQ.error]);

  if (subQ.isLoading) {
    return (
      <div className="flex flex-col gap-4" dir="rtl">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }
  if (subQ.error || !subQ.data) {
    return (
      <Card dir="rtl">
        <CardHeader>
          <CardTitle>خطا</CardTitle>
          <CardDescription>بارگذاری اشتراک ناموفق بود. بعداً تلاش کنید.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      <header>
        <h1 className="text-2xl font-bold">اشتراک</h1>
        <p className="text-sm text-muted-foreground">
          وضعیت اشتراک فعال و سهمیه‌های مصرفی شما.
        </p>
      </header>

      <ActiveSubCard
        subscription={subQ.data.subscription ?? null}
        quota={subQ.data.quota}
        navigate={navigate}
      />

      {subQ.isFetching && (
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground" dir="rtl">
          <Loader2Icon className="size-3.5 animate-spin" />
          در حال به‌روزرسانی...
        </div>
      )}
    </div>
  );
}
