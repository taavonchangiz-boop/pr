"use client";
// =====================================================================
// POSTYAR — Orders View (history)
// ---------------------------------------------------------------------
// Table of the caller's orders with the columns:
//   شماره سفارش | نوع | مبلغ | وضعیت (color badge) | ارائه‌دهنده | تاریخ (Jalali)
// Clicking a row expands to reveal the order detail + ledger entries +
// wallet txn (matched by orderId).
// =====================================================================
import { useEffect, Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertCircleIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  Loader2Icon,
  RefreshCwIcon,
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
import { cn } from "@/lib/utils";
import { api, type OrderRow } from "@/components/postyar/api";
import { formatRials, formatJalaliDateTime, toPersianDigits } from "@/lib/persian";

export interface OrdersViewProps {
  navigate: (to: string) => void;
}

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  pending: { label: "در انتظار پرداخت", variant: "secondary" },
  paid: { label: "پرداخت‌شده", variant: "default" },
  awaiting_review: { label: "در انتظار بررسی", variant: "outline" },
  failed: { label: "ناموفق", variant: "destructive" },
  cancelled: { label: "لغوشده", variant: "secondary" },
  refunded: { label: "بازگشت‌داده‌شده", variant: "outline" },
  expired: { label: "منقضی", variant: "secondary" },
};

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_BADGE[status];
  if (!meta) return <Badge variant="outline">{status}</Badge>;
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

function shortenId(id: string): string {
  if (id.length <= 10) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

function ExpandedDetail({ orderId }: { orderId: string }) {
  const detail = useQuery({
    queryKey: ["orders", "detail", orderId],
    queryFn: () => api.getOrder(orderId),
    staleTime: 30_000,
  });
  const wallet = useQuery({
    queryKey: ["wallet", "history", 1, 50],
    queryFn: () => api.getWalletHistory(1, 50),
    staleTime: 30_000,
  });

  const linkedTxn = useMemo(() => {
    if (!wallet.data || !detail.data) return null;
    return wallet.data.items.find((t) => t.orderId === detail.data!.id) ?? null;
  }, [wallet.data, detail.data]);

  if (detail.isLoading) {
    return (
      <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground" dir="rtl">
        <Loader2Icon className="size-4 animate-spin" />
        در حال بارگذاری جزئیات سفارش...
      </div>
    );
  }
  if (detail.error || !detail.data) {
    return (
      <div className="p-3 text-sm text-destructive" dir="rtl">
        بارگذاری جزئیات ناموفق بود.
      </div>
    );
  }
  const d = detail.data;
  return (
    <div className="flex flex-col gap-3 border-t bg-muted/20 p-4 text-sm" dir="rtl">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <DetailRow label="شناسهٔ کامل سفارش" value={<span className="font-mono text-xs" dir="ltr">{d.id}</span>} />
        <DetailRow label="نوع سفارش" value={d.kind === "subscription" ? "اشتراک" : d.kind === "wallet_credit" ? "شارژ کیف پول" : d.kind} />
        <DetailRow label="مبلغ" value={<span className="tabular-nums">{d.amountFa ?? formatRials(d.amountRials)}</span>} />
        <DetailRow label="وضعیت" value={<StatusBadge status={d.status} />} />
        <DetailRow label="ارائه‌دهنده" value={d.provider ? (d.provider === "card" ? "کارت به کارت" : d.provider === "bank" ? "درگاه بانکی" : d.provider === "bale" ? "پرداخت با بله" : d.provider) : "—"} />
        <DetailRow label="مرجع ارائه‌دهنده" value={<span className="font-mono text-xs" dir="ltr">{d.providerRef ?? "—"}</span>} />
        <DetailRow label="تاریخ ایجاد" value={formatJalaliDateTime(d.createdAt, { withTime: true })} />
        <DetailRow label="به‌روزرسانی" value={formatJalaliDateTime(d.updatedAt, { withTime: true })} />
      </div>

      {d.planName && (
        <DetailRow label="طرح" value={d.planName} />
      )}

      {d.cardReceipt && (
        <div className="rounded-md border bg-background p-3" dir="rtl">
          <div className="mb-1 text-xs font-medium">فیش کارت به کارت</div>
          <div className="text-xs text-muted-foreground">
            وضعیت: <StatusBadge status={d.cardReceipt.status === "pending" ? "awaiting_review" : d.cardReceipt.status} />
            {d.cardReceipt.reviewedAt && (
              <span className="mr-2">بررسی‌شده در: {formatJalaliDateTime(d.cardReceipt.reviewedAt, { withTime: true })}</span>
            )}
          </div>
        </div>
      )}

      {d.bankRef && (
        <div className="rounded-md border bg-background p-3">
          <div className="mb-1 text-xs font-medium">مرجع درگاه بانکی</div>
          <div className="text-xs text-muted-foreground">
            نوع: {d.bankRef.mode === "direct" ? "مستقیم" : "واسطه"}{" "}
            {d.bankRef.traceNo && <span>— کد پیگیری: <span dir="ltr" className="font-mono">{d.bankRef.traceNo}</span></span>}
            {d.bankRef.paidAt && <span className="mr-2">پرداخت در: {formatJalaliDateTime(d.bankRef.paidAt, { withTime: true })}</span>}
          </div>
        </div>
      )}

      {d.baleRef && (
        <div className="rounded-md border bg-background p-3">
          <div className="mb-1 text-xs font-medium">مرجع پرداخت با بله</div>
          <div className="text-xs text-muted-foreground">
            ربات: <span dir="ltr" className="font-mono">{d.baleRef.botId ?? "—"}</span>{" "}
            {d.baleRef.chargeId && <span>— شناسهٔ واریز: <span dir="ltr" className="font-mono">{d.baleRef.chargeId}</span></span>}
            {d.baleRef.paidAt && <span className="mr-2">پرداخت در: {formatJalaliDateTime(d.baleRef.paidAt, { withTime: true })}</span>}
          </div>
        </div>
      )}

      <div className="rounded-md border bg-background p-3">
        <div className="mb-1 text-xs font-medium">تراکنش کیف پول مرتبط</div>
        {linkedTxn ? (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="tabular-nums">{linkedTxn.amountFa ?? formatRials(linkedTxn.amountRials)}</span>
            <Badge variant={linkedTxn.direction === "credit" ? "default" : "secondary"}>
              {linkedTxn.direction === "credit" ? "افزایش" : "کاهش"}
            </Badge>
            <span className="text-muted-foreground">{linkedTxn.reason}</span>
            <span className="text-muted-foreground">موجودی پس از تراکنش: <span className="tabular-nums">{formatRials(linkedTxn.balanceAfter)}</span></span>
            <span className="text-muted-foreground">{formatJalaliDateTime(linkedTxn.createdAt, { withTime: true })}</span>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">تراکنش مرتبط یافت نشد.</div>
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}

export default function OrdersView({ navigate }: OrdersViewProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["orders", page],
    queryFn: () => api.getOrders(),
    staleTime: 15_000,
  });

  useEffect(() => {
    if (error) toast.error("بارگذاری سفارش‌ها ناموفق بود.");
  }, [error]);

  const orders: OrderRow[] = useMemo(() => data ?? [], [data]);
  const total = data ? (data as unknown as { total?: number }).total ?? data.length : 0;

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">سفارش‌ها</h1>
          <p className="text-sm text-muted-foreground">
            تاریخچهٔ سفارش‌های شما — مجموعاً {toPersianDigits(total)} سفارش.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-2">
          {isFetching ? <Loader2Icon className="size-4 animate-spin" /> : <RefreshCwIcon className="size-4" />}
          به‌روزرسانی
        </Button>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">لیست سفارش‌ها</CardTitle>
          <CardDescription className="text-xs">
            برای مشاهدهٔ جزئیات، روی هر ردیف کلیک کنید.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex flex-col gap-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-8 text-center" dir="rtl">
              <AlertCircleIcon className="size-8 text-muted-foreground" />
              <div className="text-sm font-medium">هنوز سفارشی ثبت نشده است.</div>
              <Button variant="secondary" size="sm" onClick={() => navigate("/dashboard/plans")} className="mt-2 gap-2">
                <ChevronLeftIcon className="size-4" />
                مشاهدهٔ پلن‌ها
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table dir="rtl">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>شماره سفارش</TableHead>
                    <TableHead>نوع</TableHead>
                    <TableHead>مبلغ</TableHead>
                    <TableHead>وضعیت</TableHead>
                    <TableHead>ارائه‌دهنده</TableHead>
                    <TableHead>تاریخ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((o) => {
                    const isOpen = expanded === o.id;
                    return (
                      <Fragment key={o.id}>
                        <TableRow
                          className={cn("cursor-pointer hover:bg-muted/40", isOpen && "bg-muted/40")}
                          onClick={() => setExpanded(isOpen ? null : o.id)}
                        >
                          <TableCell className="p-2">
                            <div className="flex items-center justify-center">
                              {isOpen ? (
                                <ChevronDownIcon className="size-4" />
                              ) : (
                                <ChevronLeftIcon className="size-4 rotate-180" />
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-xs" dir="ltr">
                            {shortenId(o.id)}
                          </TableCell>
                          <TableCell>{o.kindFa ?? (o.kind === "subscription" ? "اشتراک" : o.kind === "wallet_credit" ? "شارژ کیف پول" : o.kind)}</TableCell>
                          <TableCell className="tabular-nums">
                            {o.amountFa ?? formatRials(o.amountRials)}
                          </TableCell>
                          <TableCell><StatusBadge status={o.status} /></TableCell>
                          <TableCell>{o.providerFa ?? (o.provider ? o.provider : "—")}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatJalaliDateTime(o.createdAt, { withTime: true })}
                          </TableCell>
                        </TableRow>
                        {isOpen && (
                          <TableRow className="hover:bg-transparent">
                            <TableCell colSpan={7} className="p-0">
                              <ExpandedDetail orderId={o.id} />
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {total > pageSize && (
        <div className="flex items-center justify-between" dir="rtl">
          <span className="text-xs text-muted-foreground">
            صفحهٔ {toPersianDigits(page)} از {toPersianDigits(Math.ceil(total / pageSize))}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              قبلی
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page * pageSize >= total}
              onClick={() => setPage((p) => p + 1)}
            >
              بعدی
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
