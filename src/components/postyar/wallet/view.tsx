"use client";
// =====================================================================
// POSTYAR — Wallet View (balance + paginated history)
// ---------------------------------------------------------------------
// Top: a balance card showing the user's current wallet balance as a large
//      formatted Rial number, plus two quick links:
//        - شارژ کیف پول → /dashboard/plans
//        - انتقال به اشتراک → /dashboard/plans (only enabled if balance > 0)
// Below: paginated history table with columns:
//        تاریخ (Jalali) | نوع (credit/debit badge) | مبلغ | دلیل | موجودی پس از
// =====================================================================
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  ChevronLeftIcon,
  Loader2Icon,
  PlusIcon,
  RefreshCwIcon,
  WalletIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, type WalletTxnRow } from "@/components/postyar/api";
import { formatRials, formatJalaliDateTime, toPersianDigits } from "@/lib/persian";
import { cn } from "@/lib/utils";

export interface WalletViewProps {
  navigate: (to: string) => void;
}

const PAGE_SIZE = 15;

function BalanceCard({
  balance,
  navigate,
}: {
  balance: number;
  navigate: (to: string) => void;
}) {
  return (
    <Card className="relative overflow-hidden" dir="rtl">
      <div className="absolute inset-0 -z-10 bg-gradient-to-bl from-primary/10 via-transparent to-transparent" />
      <CardHeader>
        <CardDescription>موجودی فعلی</CardDescription>
        <CardTitle className="flex items-baseline gap-2 text-4xl font-bold tabular-nums">
          <WalletIcon className="size-7 text-primary" />
          {formatRials(balance)}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button
          onClick={() => {
            toast.success("برای شارژ کیف پول، یک پلن یا بستهٔ اعتباری انتخاب کنید.");
            navigate("/dashboard/plans");
          }}
          className="gap-2 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <PlusIcon className="size-4" />
          شارژ کیف پول
        </Button>
        <Button
          variant="secondary"
          disabled={balance <= 0}
          onClick={() => navigate("/dashboard/plans")}
          className="gap-2 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <ArrowUpRightIcon className="size-4" />
          انتقال به اشتراک
        </Button>
        <Button
          variant="outline"
          onClick={() => navigate("/dashboard/ledger")}
          className="gap-2 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <ArrowDownLeftIcon className="size-4" />
          دفتر کل
        </Button>
      </CardContent>
    </Card>
  );
}

function HistoryTable({ items, isLoading }: { items: WalletTxnRow[]; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 p-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 p-8 text-center" dir="rtl">
        <WalletIcon className="size-8 text-muted-foreground" />
        <div className="text-sm font-medium">تراکنشی ثبت نشده است.</div>
        <div className="text-xs text-muted-foreground">
          پس از اولین پرداخت یا دریافت پاداش معرفی، تراکنشها اینجا نمایش داده می‌شوند.
        </div>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <Table dir="rtl">
        <TableHeader>
          <TableRow>
            <TableHead>تاریخ</TableHead>
            <TableHead>نوع</TableHead>
            <TableHead>مبلغ</TableHead>
            <TableHead>دلیل</TableHead>
            <TableHead>موجودی پس از تراکنش</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((t) => (
            <TableRow key={t.id}>
              <TableCell className="text-xs text-muted-foreground">
                {formatJalaliDateTime(t.createdAt, { withTime: true })}
              </TableCell>
              <TableCell>
                {t.direction === "credit" ? (
                  <Badge className="gap-1 bg-emerald-600 text-white">
                    <ArrowDownLeftIcon className="size-3" />
                    افزایش
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="gap-1">
                    <ArrowUpRightIcon className="size-3" />
                    کاهش
                  </Badge>
                )}
              </TableCell>
              <TableCell
                className={cn(
                  "tabular-nums font-medium",
                  t.direction === "credit" ? "text-emerald-600" : "text-foreground",
                )}
              >
                {t.direction === "credit" ? "+ " : "− "}
                {t.amountFa ?? formatRials(t.amountRials)}
              </TableCell>
              <TableCell>{t.reason}</TableCell>
              <TableCell className="tabular-nums">{formatRials(t.balanceAfter)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default function WalletView({ navigate }: WalletViewProps) {
  const [page, setPage] = useState(1);

  const balanceQ = useQuery({
    queryKey: ["wallet", "balance"],
    queryFn: () => api.getWalletBalance(),
    staleTime: 15_000,
  });
  const historyQ = useQuery({
    queryKey: ["wallet", "history", page, PAGE_SIZE],
    queryFn: () => api.getWalletHistory(page, PAGE_SIZE),
    staleTime: 15_000,
  });

  useEffect(() => {
    if (balanceQ.error) toast.error("بارگذاری موجودی ناموفق بود.");
  }, [balanceQ.error]);
  useEffect(() => {
    if (historyQ.error) toast.error("بارگذاری تاریخچه ناموفق بود.");
  }, [historyQ.error]);

  const balance = balanceQ.data?.balanceRials ?? 0;
  const items = useMemo<WalletTxnRow[]>(() => historyQ.data?.items ?? [], [historyQ.data]);
  const total = historyQ.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">کیف پول</h1>
          <p className="text-sm text-muted-foreground">
            موجودی و تاریخچهٔ تراکنش‌های شما.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            void balanceQ.refetch();
            void historyQ.refetch();
          }}
          disabled={balanceQ.isFetching || historyQ.isFetching}
          className="gap-2"
        >
          {balanceQ.isFetching || historyQ.isFetching ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <RefreshCwIcon className="size-4" />
          )}
          به‌روزرسانی
        </Button>
      </header>

      <BalanceCard balance={balance} navigate={navigate} />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">تاریخچهٔ تراکنش‌ها</CardTitle>
          <CardDescription className="text-xs">
            مجموعاً {toPersianDigits(total)} تراکنش.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <HistoryTable items={items} isLoading={historyQ.isLoading} />
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between" dir="rtl">
          <span className="text-xs text-muted-foreground">
            صفحهٔ {toPersianDigits(page)} از {toPersianDigits(totalPages)}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="gap-2"
            >
              <ChevronLeftIcon className="size-4" />
              قبلی
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="gap-2"
            >
              بعدی
              <ChevronLeftIcon className="size-4 rotate-180" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
