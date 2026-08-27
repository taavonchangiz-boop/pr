"use client";
// =====================================================================
// POSTYAR — Gold Price View
// ---------------------------------------------------------------------
// Shows current prices for: طلای ۱۸ عیار، سکه امامی، سکه بهار آزادی،
// انس جهانی. Each as a card with formatted Rials + last updated Jalali
// relative time + staleness indicator (badge "در حال به‌روزرسانی" vs
// "اطلاعات قدیمی").
//
// CRITICAL: If provider returns ok=false (provider unconfigured or
// unreachable), show the truthful empty state "داده‌های زنده طلا در دسترس
// نیست". NEVER fabricate a price.
// =====================================================================
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangleIcon,
  Loader2Icon,
  RefreshCwIcon,
  TrendingUpIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { api, type GoldPriceView, type GoldPrices } from "@/components/postyar/api";
import { formatRials, formatRelative, toPersianDigits } from "@/lib/persian";

const INSTRUMENT_FA: Record<string, string> = {
  "18k": "طلای ۱۸ عیار",
  emami: "سکه امامی",
  bahar_azadi: "سکه بهار آزادی",
  ounce: "انس جهانی",
};

const INSTRUMENTS: Array<{ key: string; label: string }> = [
  { key: "18k", label: INSTRUMENT_FA["18k"] },
  { key: "emami", label: INSTRUMENT_FA.emami },
  { key: "bahar_azadi", label: INSTRUMENT_FA.bahar_azadi },
  { key: "ounce", label: INSTRUMENT_FA.ounce },
];

const STALE_AFTER_MS = 5 * 60 * 1000; // 5 minutes — older = stale

function isStale(fetchedAt?: string): boolean {
  if (!fetchedAt) return true;
  const d = new Date(fetchedAt).getTime();
  if (!Number.isFinite(d)) return true;
  return Date.now() - d > STALE_AFTER_MS;
}

export function GoldView() {
  const q = useQuery({
    queryKey: ["gold", "prices"],
    queryFn: () => api.getGoldPrice(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  // Truthful empty-state condition: provider returned an empty object OR
  // every instrument returns ok=false.
  const items = q.data ? (q.data as GoldPrices) : ({} as GoldPrices);
  const allDown = Object.keys(items).length > 0
    ? Object.values(items).every((v) => !v.ok || v.priceRials === null || v.priceRials === undefined)
    : true;

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <TrendingUpIcon className="size-6" />
            قیمت طلا
          </h1>
          <p className="text-sm text-muted-foreground">
            قیمت‌های زنده از ارائه‌دهندهٔ داده طلا. هر ۶۰ ثانیه به‌روز می‌شود.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => q.refetch()} disabled={q.isFetching}>
          {q.isFetching ? <Loader2Icon className="size-4 animate-spin" /> : <RefreshCwIcon className="size-4" />}
          به‌روزرسانی
        </Button>
      </div>

      {q.isLoading && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {INSTRUMENTS.map((it) => (
            <Skeleton key={it.key} className="h-32 w-full" />
          ))}
        </div>
      )}

      {!q.isLoading && allDown && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="rounded-full bg-muted p-3">
              <AlertTriangleIcon className="size-7 text-muted-foreground" />
            </div>
            <div className="text-base font-medium">داده‌های زنده طلا در دسترس نیست</div>
            <div className="max-w-md text-sm text-muted-foreground">
              ارائه‌دهندهٔ قیمت طلا هنوز تنظیم نشده یا در دسترس نیست. لطفاً بعداً تلاش کنید یا با پشتیبانی تماس بگیرید.
            </div>
            <Button variant="outline" size="sm" onClick={() => q.refetch()} disabled={q.isFetching}>
              {q.isFetching ? <Loader2Icon className="size-4 animate-spin" /> : <RefreshCwIcon className="size-4" />}
              تلاش مجدد
            </Button>
          </CardContent>
        </Card>
      )}

      {!q.isLoading && !allDown && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {INSTRUMENTS.map((it) => {
            const v: GoldPriceView | undefined = items[it.key];
            return <PriceCard key={it.key} instrument={it.key} label={it.label} view={v} />;
          })}
        </div>
      )}
    </div>
  );
}

function PriceCard({
  instrument,
  label,
  view,
}: {
  instrument: string;
  label: string;
  view?: GoldPriceView;
}) {
  if (!view || !view.ok || view.priceRials === null || view.priceRials === undefined) {
    return (
      <Card dir="rtl">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">{label}</CardTitle>
          <CardDescription>این مورد در دسترس نیست.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-lg font-bold text-muted-foreground">—</div>
          {view?.errorFa && (
            <div className="mt-2 text-xs text-destructive">{view.errorFa}</div>
          )}
        </CardContent>
      </Card>
    );
  }
  const stale = isStale(view.fetchedAt);
  return (
    <Card dir="rtl">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm">{label}</CardTitle>
          <Badge variant={stale ? "secondary" : "default"}>
            {stale ? "اطلاعات قدیمی" : "در حال به‌روزرسانی"}
          </Badge>
        </div>
        <CardDescription>
          {view.source ? `منبع: ${view.source}` : "آخرین قیمت ذخیره‌شده"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-lg font-bold tabular-nums">{formatRials(view.priceRials)}</div>
        <div className="mt-1 text-xs text-muted-foreground">
          {view.fetchedAt ? formatRelative(view.fetchedAt) : "بدون زمان"}
        </div>
        {view.stalePriceRials !== null && view.stalePriceRials !== undefined && view.stalePriceRials !== view.priceRials && (
          <div className="mt-1 text-xs text-muted-foreground">
            آخرین قیمت قدیمی: {toPersianDigits(view.stalePriceRials.toLocaleString("en-US"))} ریال
          </div>
        )}
        <div className="sr-only">
          شناسه: {instrument}
        </div>
      </CardContent>
    </Card>
  );
}

export default GoldView;
