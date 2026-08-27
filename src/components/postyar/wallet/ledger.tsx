"use client";
// =====================================================================
// POSTYAR — Ledger View (general journal entries)
// ---------------------------------------------------------------------
// Paginated table of the user's ledger entries. Columns:
//   تاریخ | نوع رویداد | مبلغ (+/-) | ارز (ریال) | سفارش مرتبط
// Used as a financial-audit-grade journal of every economic event for the
// caller — wallet txns are a denormalized view; the ledger is the source of
// truth.
// =====================================================================
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BookOpenIcon,
  ChevronLeftIcon,
  Loader2Icon,
  RefreshCwIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, type LedgerEntryRow } from "@/components/postyar/api";
import { formatRials, formatJalaliDateTime, toPersianDigits } from "@/lib/persian";

export interface LedgerViewProps {
  navigate: (to: string) => void;
}

const PAGE_SIZE = 20;

function shortenId(id: string | null): string {
  if (!id) return "—";
  if (id.length <= 10) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

function LedgerTable({
  items,
  isLoading,
  navigate,
}: {
  items: LedgerEntryRow[];
  isLoading: boolean;
  navigate: (to: string) => void;
}) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 p-8 text-center" dir="rtl">
        <BookOpenIcon className="size-8 text-muted-foreground" />
        <div className="text-sm font-medium">رکورد دفتر کل ثبت نشده است.</div>
        <div className="text-xs text-muted-foreground">
          پس از اولین تراکنش مالی، رویدادها اینجا نمایش داده می‌شوند.
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
            <TableHead>نوع رویداد</TableHead>
            <TableHead>مبلغ</TableHead>
            <TableHead>ارز</TableHead>
            <TableHead>سفارش مرتبط</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((e) => {
            const positive = e.eventType.includes("افزایش") || e.eventType.includes("پاداش") || e.eventType.includes("پرداخت");
            return (
              <TableRow key={e.id}>
                <TableCell className="text-xs text-muted-foreground">
                  {formatJalaliDateTime(e.createdAt, { withTime: true })}
                </TableCell>
                <TableCell>{e.eventType}</TableCell>
                <TableCell className="tabular-nums">
                  {positive ? "+ " : "− "}
                  {e.amountFa ?? formatRials(e.amountRials)}
                </TableCell>
                <TableCell className="text-xs">{e.currency === "irr" ? "ریال" : e.currency}</TableCell>
                <TableCell className="font-mono text-xs">
                  {e.orderId ? (
                    <button
                      onClick={(ev) => {
                        ev.stopPropagation();
                        navigate("/dashboard/orders");
                      }}
                      className="text-primary hover:underline"
                      dir="ltr"
                      title={e.orderId}
                    >
                      {shortenId(e.orderId)}
                    </button>
                  ) : (
                    "—"
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export default function LedgerView({ navigate }: LedgerViewProps) {
  const [page, setPage] = useState(1);

  const ledgerQ = useQuery({
    queryKey: ["ledger", page, PAGE_SIZE],
    queryFn: () => api.getLedger(page, PAGE_SIZE),
    staleTime: 15_000,
  });

  useEffect(() => {
    if (ledgerQ.error) toast.error("بارگذاری دفتر کل ناموفق بود.");
  }, [ledgerQ.error]);

  const items = useMemo<LedgerEntryRow[]>(() => ledgerQ.data?.items ?? [], [ledgerQ.data]);
  const total = ledgerQ.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">دفتر کل</h1>
          <p className="text-sm text-muted-foreground">
            سوابق مالی شما به ترتیب زمانی — مجموعاً {toPersianDigits(total)} رکورد.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void ledgerQ.refetch()}
          disabled={ledgerQ.isFetching}
          className="gap-2"
        >
          {ledgerQ.isFetching ? <Loader2Icon className="size-4 animate-spin" /> : <RefreshCwIcon className="size-4" />}
          به‌روزرسانی
        </Button>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">رویدادهای مالی</CardTitle>
          <CardDescription className="text-xs">
            هر رکورد یک رویداد مالی است. رکوردهای با علامت مثبت، افزایش اعتبار شما را نشان می‌دهند.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <LedgerTable items={items} isLoading={ledgerQ.isLoading} navigate={navigate} />
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
