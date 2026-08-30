"use client";
// =====================================================================
// POSTYAR — Admin Orders Review (manual approve / reject)
// ---------------------------------------------------------------------
// Full admin order review view. Features:
//   - Server-side filter form (status, kind, provider, q search, Jalali
//     date range, page, pageSize).
//   - Paginated table: order id (short), user, kind (Persian), amount
//     (Rials + Persian digits), provider (Persian), status (Badge with
//     Persian + tone), createdAt (Jalali).
//   - Row actions: «مشاهده» (detail Dialog), «تأیید دستی» (approve),
//     «رد دستی» (reject with reason Dialog).
//   - Detail Dialog: full order info + card receipt summary + bank/bale
//     refs + timeline + admin notes textarea + inline approve/reject.
//   - Approve: POST /api/admin/orders/[id]/approve (idempotent — already-
//     paid orders return success without double-fulfilling).
//   - Reject: POST /api/admin/orders/[id]/reject { reason } — stores the
//     reason inside the order's metadata JSON under `rejectionReason`
//     and the per-event `rejections[]` array.
//
// All Persian, RTL, lucide icons only. Persian digits + Jalali via
// `src/lib/persian`. Toasts via sonner. Loading / empty / error states
// on every async surface. `cursor-pointer` + `focus-visible:ring-2` on
// every custom clickable.
// =====================================================================
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertCircleIcon,
  BanknoteIcon,
  CalendarIcon,
  CheckIcon,
  ChevronLeftIcon,
  ClockIcon,
  CreditCardIcon,
  EyeIcon,
  FilterIcon,
  InfoIcon,
  ListOrderedIcon,
  Loader2Icon,
  RefreshCwIcon,
  SearchIcon,
  ShieldCheckIcon,
  WalletIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { AdminGate } from "@/components/postyar/admin/gate";
import { api, type AdminOrderRow, type AdminOrdersQuery, type OrderDetailRow } from "@/components/postyar/api";
import {
  formatJalaliDateTime,
  formatRials,
  toPersianDigits,
  fromPersianDigits,
} from "@/lib/persian";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 10;

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "همهٔ وضعیت‌ها" },
  { value: "pending", label: "در انتظار پرداخت" },
  { value: "awaiting_payment", label: "در انتظار پرداخت" },
  { value: "awaiting_review", label: "در انتظار بررسی" },
  { value: "paid", label: "پرداخت‌شده" },
  { value: "rejected", label: "رد‌شده" },
  { value: "failed", label: "ناموفق" },
  { value: "expired", label: "منقضی" },
];

const KIND_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "همهٔ نوع‌ها" },
  { value: "subscription", label: "اشتراک" },
  { value: "wallet_credit", label: "شارژ کیف پول" },
  { value: "ad_campaign", label: "کمپین تبلیغاتی" },
];

const PROVIDER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "همهٔ پروایدرها" },
  { value: "card", label: "کارت به کارت" },
  { value: "bank", label: "درگاه بانکی" },
  { value: "bale", label: "پرداخت با بله" },
];

function statusBadgeTone(status: string): {
  label: string;
  className: string;
} {
  switch (status) {
    case "paid":
      return { label: "پرداخت‌شده", className: "bg-emerald-600 text-white" };
    case "awaiting_review":
      return { label: "در انتظار بررسی", className: "border-amber-500 text-amber-700" };
    case "awaiting_payment":
    case "pending":
      return { label: "در انتظار پرداخت", className: "bg-secondary text-secondary-foreground" };
    case "rejected":
    case "failed":
      return { label: status === "rejected" ? "رد‌شده" : "ناموفق", className: "bg-destructive text-destructive-foreground" };
    case "expired":
      return { label: "منقضی", className: "bg-secondary text-secondary-foreground" };
    case "cancelled":
      return { label: "لغوشده", className: "bg-secondary text-secondary-foreground" };
    default:
      return { label: status, className: "" };
  }
}

function StatusBadge({ status }: { status: string }) {
  const meta = statusBadgeTone(status);
  return <Badge className={cn(meta.className)}>{meta.label}</Badge>;
}

function shortenId(id: string): string {
  if (id.length <= 10) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

function kindFa(k: string): string {
  if (k === "subscription") return "اشتراک";
  if (k === "wallet_credit") return "شارژ کیف پول";
  if (k === "ad_campaign") return "کمپین تبلیغاتی";
  return k;
}

function providerFa(p: string | null | undefined): string {
  if (!p) return "—";
  if (p === "card") return "کارت به کارت";
  if (p === "bank") return "درگاه بانکی";
  if (p === "bale") return "پرداخت با بله";
  return p;
}

function providerIcon(p: string | null | undefined) {
  if (p === "card") return CreditCardIcon;
  if (p === "bank") return BanknoteIcon;
  if (p === "bale") return WalletIcon;
  return InfoIcon;
}

function validateJalaliDate(raw: string): boolean {
  if (!raw) return true; // empty = OK (not filtering)
  const normalized = fromPersianDigits(raw).trim();
  return /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(normalized);
}

export interface AdminOrdersReviewProps {
  navigate: (to: string) => void;
}

function AdminOrdersReviewInner(_props: AdminOrdersReviewProps) {
  const qc = useQueryClient();
  const [filters, setFilters] = useState<AdminOrdersQuery>({
    page: 1,
    pageSize: PAGE_SIZE,
    status: "all",
    kind: "all",
    provider: "all",
    q: "",
    from: "",
    to: "",
  });

  // The actual query params we send to the server. `all` is the sentinel
  // meaning "no filter" — we strip those before sending.
  const queryParams: AdminOrdersQuery = useMemo(
    () => ({
      page: filters.page,
      pageSize: filters.pageSize,
      status: filters.status && filters.status !== "all" ? filters.status : undefined,
      kind: filters.kind && filters.kind !== "all" ? filters.kind : undefined,
      provider: filters.provider && filters.provider !== "all" ? filters.provider : undefined,
      q: filters.q && filters.q.trim() ? filters.q.trim() : undefined,
      from: filters.from && filters.from.trim() ? filters.from.trim() : undefined,
      to: filters.to && filters.to.trim() ? filters.to.trim() : undefined,
    }),
    [filters],
  );

  const fromValid = validateJalaliDate(filters.from ?? "");
  const toValid = validateJalaliDate(filters.to ?? "");
  const datesValid = fromValid && toValid;

  const q = useQuery({
    queryKey: ["admin", "orders-review", queryParams],
    queryFn: () => api.getAdminOrdersTyped(queryParams),
    enabled: datesValid,
    staleTime: 15_000,
  });

  // Refetch when filters change (mainly to reset the page back to 1 when a
  // filter changes — handled inline by the setter).
  useEffect(() => {
    if (q.error) toast.error("بارگذاری سفارش‌ها ناموفق بود.");
  }, [q.error]);

  const orders: AdminOrderRow[] = useMemo(() => q.data?.orders ?? [], [q.data]);
  const total = q.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // ---------------------------------------------------------------
  // Mutations: approve / reject. Both invalidate the list query and
  // the open detail query on success.
  // ---------------------------------------------------------------
  const [detailId, setDetailId] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [adminNotes, setAdminNotes] = useState("");

  const approveMut = useMutation({
    mutationFn: (id: string) => api.adminApproveOrder(id, adminNotes.trim() || undefined),
    onSuccess: (data) => {
      toast.success("سفارش تأیید شد و در صورت نیاز، اشتراک/کیف پول کاربر به‌روزرسانی شد.");
      setDetailId(null);
      setRejectId(null);
      setAdminNotes("");
      qc.invalidateQueries({ queryKey: ["admin", "orders-review"] });
      qc.invalidateQueries({ queryKey: ["orders", "detail", data.orderId ?? ""] });
    },
    onError: (e: Error) => toast.error(e.message ?? "تأیید ناموفق بود."),
  });

  const rejectMut = useMutation({
    mutationFn: (id: string) =>
      api.adminRejectOrder(id, rejectReason.trim() || undefined),
    onSuccess: () => {
      toast.success("سفارش رد شد.");
      setRejectId(null);
      setRejectReason("");
      setAdminNotes("");
      qc.invalidateQueries({ queryKey: ["admin", "orders-review"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "رد ناموفق بود."),
  });

  const isPaidRow = (o: AdminOrderRow) => o.status === "paid";
  const isRejectedRow = (o: AdminOrderRow) => o.status === "rejected";

  // ---------------------------------------------------------------
  // Filter bar
  // ---------------------------------------------------------------
  function applyFilters(patch: Partial<AdminOrdersQuery>) {
    setFilters((f) => ({ ...f, ...patch, page: 1 }));
  }

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <ListOrderedIcon className="size-6" />
            بررسی سفارش‌ها
          </h1>
          <p className="text-sm text-muted-foreground">
            تأیید یا رد دستی سفارش‌ها — مخصوصاً کارت‌به‌کارت‌های نیازمند بررسی.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => q.refetch()}
          disabled={q.isFetching}
          className="gap-2 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {q.isFetching ? <Loader2Icon className="size-4 animate-spin" /> : <RefreshCwIcon className="size-4" />}
          به‌روزرسانی
        </Button>
      </header>

      {/* ----------------------------- Filter card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <FilterIcon className="size-4" />
            فیلترها
          </CardTitle>
          <CardDescription className="text-xs">
            وضعیت، نوع، پروایدر، جستجوی متنی و بازهٔ تاریخ Jalali را مشخص کنید.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="flt-q" className="text-xs text-muted-foreground">
              جستجو
            </Label>
            <div className="relative">
              <SearchIcon className="absolute right-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="flt-q"
                value={filters.q ?? ""}
                onChange={(e) => applyFilters({ q: e.target.value })}
                placeholder="ایمیل / موبایل / شناسهٔ سفارش"
                dir="ltr"
                className="pr-8 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="flt-status" className="text-xs text-muted-foreground">
              وضعیت
            </Label>
            <Select
              value={filters.status ?? "all"}
              onValueChange={(v) => applyFilters({ status: v })}
            >
              <SelectTrigger id="flt-status" className="cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                <SelectValue placeholder="همه" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="flt-kind" className="text-xs text-muted-foreground">
              نوع سفارش
            </Label>
            <Select
              value={filters.kind ?? "all"}
              onValueChange={(v) => applyFilters({ kind: v })}
            >
              <SelectTrigger id="flt-kind" className="cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                <SelectValue placeholder="همه" />
              </SelectTrigger>
              <SelectContent>
                {KIND_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="flt-provider" className="text-xs text-muted-foreground">
              پروایدر پرداخت
            </Label>
            <Select
              value={filters.provider ?? "all"}
              onValueChange={(v) => applyFilters({ provider: v })}
            >
              <SelectTrigger id="flt-provider" className="cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                <SelectValue placeholder="همه" />
              </SelectTrigger>
              <SelectContent>
                {PROVIDER_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="flt-from" className="flex items-center gap-1 text-xs text-muted-foreground">
              <CalendarIcon className="size-3.5" />
              از تاریخ (Jalali)
            </Label>
            <Input
              id="flt-from"
              value={filters.from ?? ""}
              onChange={(e) => applyFilters({ from: e.target.value })}
              placeholder="1403-05-01"
              dir="ltr"
              className={cn(
                "text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                !fromValid && "border-destructive",
              )}
            />
            {!fromValid && (
              <span className="text-[10px] text-destructive">قالب: YYYY-MM-DD</span>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="flt-to" className="flex items-center gap-1 text-xs text-muted-foreground">
              <CalendarIcon className="size-3.5" />
              تا تاریخ (Jalali)
            </Label>
            <Input
              id="flt-to"
              value={filters.to ?? ""}
              onChange={(e) => applyFilters({ to: e.target.value })}
              placeholder="1403-05-31"
              dir="ltr"
              className={cn(
                "text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                !toValid && "border-destructive",
              )}
            />
            {!toValid && (
              <span className="text-[10px] text-destructive">قالب: YYYY-MM-DD</span>
            )}
          </div>

          <div className="flex items-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setFilters({
                  page: 1,
                  pageSize: PAGE_SIZE,
                  status: "all",
                  kind: "all",
                  provider: "all",
                  q: "",
                  from: "",
                  to: "",
                })
              }
              className="gap-2 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <XIcon className="size-4" />
              پاک کردن فیلترها
            </Button>
          </div>

          <div className="flex items-end justify-end text-xs text-muted-foreground">
            مجموعاً {toPersianDigits(total)} سفارش یافت شد.
          </div>
        </CardContent>
      </Card>

      {/* ----------------------------- Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ListOrderedIcon className="size-4" />
            فهرست سفارش‌ها
          </CardTitle>
          <CardDescription className="text-xs">
            برای مشاهدهٔ جزئیات، روی «مشاهده» بزنید. تأیید دستی فقط برای سفارش‌های
            پرداخت‌نشده امکان‌پذیر است.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {q.isLoading ? (
            <div className="flex flex-col gap-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : q.error ? (
            <Alert variant="destructive" className="m-4">
              <AlertCircleIcon className="size-4" />
              <AlertTitle>بارگذاری ناموفق</AlertTitle>
              <AlertDescription className="text-xs">
                بارگذاری سفارش‌ها ناموفق بود. بعداً تلاش کنید.
              </AlertDescription>
            </Alert>
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-8 text-center">
              <AlertCircleIcon className="size-8 text-muted-foreground" />
              <div className="text-sm font-medium">هیچ سفارشی با این فیلترها یافت نشد.</div>
              <div className="text-xs text-muted-foreground">
                فیلترها را تغییر دهید یا بعداً تلاش کنید.
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table dir="rtl">
                <TableHeader>
                  <TableRow>
                    <TableHead>سفارش</TableHead>
                    <TableHead>کاربر</TableHead>
                    <TableHead>نوع</TableHead>
                    <TableHead>مبلغ</TableHead>
                    <TableHead>پروایدر</TableHead>
                    <TableHead>وضعیت</TableHead>
                    <TableHead>تاریخ</TableHead>
                    <TableHead className="text-left">عملیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((o) => {
                    const Icon = providerIcon(o.provider);
                    const blocked = isPaidRow(o) || isRejectedRow(o);
                    return (
                      <TableRow key={o.id} className="hover:bg-muted/40">
                        <TableCell className="font-mono text-xs" dir="ltr">
                          {shortenId(o.id)}
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="font-medium">{o.userFullName}</div>
                          <div className="text-[10px] text-muted-foreground" dir="ltr">{o.userEmail}</div>
                          {o.userMobile && (
                            <div className="text-[10px] text-muted-foreground" dir="ltr">{o.userMobile}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">{o.kindFa ?? kindFa(o.kind)}</TableCell>
                        <TableCell className="tabular-nums text-xs">{o.amountFa ?? formatRials(o.amountRials)}</TableCell>
                        <TableCell className="text-xs">
                          <span className="inline-flex items-center gap-1">
                            <Icon className="size-3.5 text-muted-foreground" />
                            {o.providerFa ?? providerFa(o.provider)}
                          </span>
                        </TableCell>
                        <TableCell><StatusBadge status={o.status} /></TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {o.createdAtFa ?? formatJalaliDateTime(o.createdAt, { withTime: true })}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setDetailId(o.id);
                                setAdminNotes("");
                              }}
                              className="gap-1 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                              title="مشاهدهٔ جزئیات"
                            >
                              <EyeIcon className="size-4" />
                              مشاهده
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={isPaidRow(o) || approveMut.isPending}
                              onClick={() => {
                                setDetailId(o.id);
                                setAdminNotes("");
                                // Auto-open the approve action via the detail dialog
                              }}
                              className={cn(
                                "gap-1 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                                isPaidRow(o) ? "text-emerald-600" : "text-emerald-600 hover:text-emerald-700",
                              )}
                              title={isPaidRow(o) ? "قبلاً تأیید شده" : "تأیید دستی"}
                            >
                              <CheckIcon className="size-4" />
                              تأیید
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={isRejectedRow(o) || isPaidRow(o) || rejectMut.isPending}
                              onClick={() => {
                                setRejectId(o.id);
                                setRejectReason("");
                              }}
                              className="gap-1 text-destructive hover:text-destructive cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                              title="رد دستی"
                            >
                              <XIcon className="size-4" />
                              رد
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ----------------------------- Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between" dir="rtl">
          <span className="text-xs text-muted-foreground">
            صفحهٔ {toPersianDigits(filters.page ?? 1)} از {toPersianDigits(totalPages)}
          </span>
          <Pagination className="justify-end">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={(e: React.MouseEvent) => {
                    e.preventDefault();
                    setFilters((f) => ({ ...f, page: Math.max(1, (f.page ?? 1) - 1) }));
                  }}
                  className={cn(
                    "cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    (filters.page ?? 1) <= 1 && "pointer-events-none opacity-50",
                  )}
                />
              </PaginationItem>
              <PaginationItem>
                <span className="px-2 text-xs tabular-nums">
                  {toPersianDigits(filters.page ?? 1)} / {toPersianDigits(totalPages)}
                </span>
              </PaginationItem>
              <PaginationItem>
                <PaginationNext
                  onClick={(e: React.MouseEvent) => {
                    e.preventDefault();
                    setFilters((f) => ({ ...f, page: Math.min(totalPages, (f.page ?? 1) + 1) }));
                  }}
                  className={cn(
                    "cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    (filters.page ?? 1) >= totalPages && "pointer-events-none opacity-50",
                  )}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}

      {/* ----------------------------- Detail Dialog */}
      <DetailDialog
        orderId={detailId}
        onClose={() => { setDetailId(null); setAdminNotes(""); }}
        adminNotes={adminNotes}
        setAdminNotes={setAdminNotes}
        approvePending={approveMut.isPending}
        rejectPending={rejectMut.isPending}
        onApprove={() => detailId && approveMut.mutate(detailId)}
        onReject={() => {
          if (!detailId) return;
          setRejectId(detailId);
          setRejectReason("");
        }}
      />

      {/* ----------------------------- Reject (with reason) Dialog */}
      <Dialog open={!!rejectId} onOpenChange={(o) => !o && setRejectId(null)}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XIcon className="size-5 text-destructive" />
              رد سفارش
            </DialogTitle>
            <DialogDescription>
              با رد سفارش، وضعیت آن به «رد‌شده» تغییر می‌کند و دلیل رد در سوابق سفارش ثبت می‌شود.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="reject-reason" className="text-xs text-muted-foreground">
              دلیل رد (اختیاری)
            </Label>
            <Textarea
              id="reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="مثلاً: رسید ناخوانا، مبلغ واریزی ناقص، ..."
              rows={4}
              maxLength={500}
              className="focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            />
            <span className="text-[10px] text-muted-foreground">
              {toPersianDigits(rejectReason.length)} از {toPersianDigits(500)} حرف
            </span>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => { setRejectId(null); setRejectReason(""); }}
              className="gap-2 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              انصراف
            </Button>
            <Button
              variant="destructive"
              disabled={rejectMut.isPending}
              onClick={() => rejectId && rejectMut.mutate(rejectId)}
              className="gap-2 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {rejectMut.isPending ? <Loader2Icon className="size-4 animate-spin" /> : <XIcon className="size-4" />}
              رد سفارش
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------
// Detail Dialog — full order info + refs + timeline + admin notes +
// approve/reject buttons.
// ---------------------------------------------------------------------
function DetailDialog({
  orderId,
  onClose,
  adminNotes,
  setAdminNotes,
  approvePending,
  rejectPending,
  onApprove,
  onReject,
}: {
  orderId: string | null;
  onClose: () => void;
  adminNotes: string;
  setAdminNotes: (s: string) => void;
  approvePending: boolean;
  rejectPending: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const detail = useQuery({
    queryKey: ["orders", "detail", orderId],
    queryFn: () => api.getOrder(orderId!),
    enabled: !!orderId,
    staleTime: 30_000,
  });

  if (!orderId) return null;

  return (
    <Dialog open={!!orderId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <EyeIcon className="size-5 text-primary" />
            جزئیات سفارش
          </DialogTitle>
          <DialogDescription>
            اطلاعات کامل سفارش، رسید کارت‌به‌کارت، مراجع بانکی/بله و یادداشت‌های مدیر.
          </DialogDescription>
        </DialogHeader>

        {detail.isLoading ? (
          <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground" dir="rtl">
            <Loader2Icon className="size-4 animate-spin" />
            در حال بارگذاری جزئیات...
          </div>
        ) : detail.error ? (
          <Alert variant="destructive">
            <AlertCircleIcon className="size-4" />
            <AlertTitle>بارگذاری ناموفق</AlertTitle>
            <AlertDescription className="text-xs">{detail.error.message}</AlertDescription>
          </Alert>
        ) : detail.data ? (
          <OrderDetailBody
            order={detail.data}
            adminNotes={adminNotes}
            setAdminNotes={setAdminNotes}
            approvePending={approvePending}
            rejectPending={rejectPending}
            onApprove={onApprove}
            onReject={onReject}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function OrderDetailBody({
  order,
  adminNotes,
  setAdminNotes,
  approvePending,
  rejectPending,
  onApprove,
  onReject,
}: {
  order: OrderDetailRow;
  adminNotes: string;
  setAdminNotes: (s: string) => void;
  approvePending: boolean;
  rejectPending: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const isPaid = order.status === "paid";
  const isRejected = order.status === "rejected";

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      {/* Identity + amount */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <DetailRow label="شناسهٔ سفارش" value={<span className="font-mono text-xs" dir="ltr">{order.id}</span>} />
        <DetailRow label="نوع سفارش" value={kindFa(order.kind)} />
        <DetailRow label="مبلغ" value={<span className="tabular-nums">{order.amountFa ?? formatRials(order.amountRials)}</span>} />
        <DetailRow label="وضعیت" value={<StatusBadge status={order.status} />} />
        <DetailRow label="پروایدر" value={providerFa(order.provider)} />
        <DetailRow label="مرجع پروایدر" value={<span className="font-mono text-xs" dir="ltr">{order.providerRef ?? "—"}</span>} />
        {order.planName && <DetailRow label="طرح" value={order.planName} />}
        <DetailRow label="تاریخ ایجاد" value={formatJalaliDateTime(order.createdAt, { withTime: true })} />
        <DetailRow label="به‌روزرسانی" value={formatJalaliDateTime(order.updatedAt, { withTime: true })} />
      </div>

      <Separator />

      {/* Card receipt */}
      {order.cardReceipt && (
        <div className="rounded-md border bg-muted/30 p-3">
          <div className="mb-1 flex items-center gap-2 text-xs font-medium">
            <CreditCardIcon className="size-4 text-primary" />
            رسید کارت به کارت
          </div>
          <div className="text-xs text-muted-foreground">
            وضعیت: <StatusBadge status={order.cardReceipt.status === "pending" ? "awaiting_review" : order.cardReceipt.status} />
            {order.cardReceipt.reviewedAt && (
              <span className="mr-2">
                بررسی‌شده در: {formatJalaliDateTime(order.cardReceipt.reviewedAt, { withTime: true })}
              </span>
            )}
          </div>
          <div className="mt-2 text-[10px] text-muted-foreground">
            شناسهٔ فایل: <span className="font-mono" dir="ltr">{order.cardReceipt.publicId}</span>
          </div>
        </div>
      )}

      {/* Bank ref */}
      {order.bankRef && (
        <div className="rounded-md border bg-muted/30 p-3">
          <div className="mb-1 flex items-center gap-2 text-xs font-medium">
            <BanknoteIcon className="size-4 text-primary" />
            مرجع درگاه بانکی
          </div>
          <div className="text-xs text-muted-foreground">
            نوع: {order.bankRef.mode === "direct" ? "مستقیم" : "واسطه"}
            {order.bankRef.traceNo && (
              <span> — کد پیگیری: <span dir="ltr" className="font-mono">{order.bankRef.traceNo}</span></span>
            )}
            {order.bankRef.paidAt && (
              <span className="mr-2"> — پرداخت در: {formatJalaliDateTime(order.bankRef.paidAt, { withTime: true })}</span>
            )}
          </div>
        </div>
      )}

      {/* Bale ref */}
      {order.baleRef && (
        <div className="rounded-md border bg-muted/30 p-3">
          <div className="mb-1 flex items-center gap-2 text-xs font-medium">
            <WalletIcon className="size-4 text-primary" />
            مرجع پرداخت با بله
          </div>
          <div className="text-xs text-muted-foreground">
            ربات: <span dir="ltr" className="font-mono">{order.baleRef.botId ?? "—"}</span>
            {order.baleRef.chargeId && (
              <span> — شناسهٔ واریز: <span dir="ltr" className="font-mono">{order.baleRef.chargeId}</span></span>
            )}
            {order.baleRef.paidAt && (
              <span className="mr-2"> — پرداخت در: {formatJalaliDateTime(order.baleRef.paidAt, { withTime: true })}</span>
            )}
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="rounded-md border bg-background p-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-medium">
          <ClockIcon className="size-4 text-muted-foreground" />
          خط زمانی
        </div>
        <ol className="flex flex-col gap-1.5 text-xs">
          <li className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            <span>ایجاد سفارش — {formatJalaliDateTime(order.createdAt, { withTime: true })}</span>
          </li>
          {order.cardReceipt?.reviewedAt && (
            <li className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-amber-500" />
              <span>بررسی رسید — {formatJalaliDateTime(order.cardReceipt.reviewedAt, { withTime: true })}</span>
            </li>
          )}
          {order.bankRef?.paidAt && (
            <li className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-emerald-600" />
              <span>پرداخت درگاه — {formatJalaliDateTime(order.bankRef.paidAt, { withTime: true })}</span>
            </li>
          )}
          {order.baleRef?.paidAt && (
            <li className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-emerald-600" />
              <span>پرداخت بله — {formatJalaliDateTime(order.baleRef.paidAt, { withTime: true })}</span>
            </li>
          )}
          {isPaid && (
            <li className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-emerald-700" />
              <span>تأیید نهایی — {formatJalaliDateTime(order.updatedAt, { withTime: true })}</span>
            </li>
          )}
          {isRejected && (
            <li className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-destructive" />
              <span>رد سفارش — {formatJalaliDateTime(order.updatedAt, { withTime: true })}</span>
            </li>
          )}
        </ol>
      </div>

      {/* Admin notes */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="admin-notes" className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheckIcon className="size-3.5" />
          یادداشت مدیر (به تأیید دستی ضمیمه می‌شود)
        </Label>
        <Textarea
          id="admin-notes"
          value={adminNotes}
          onChange={(e) => setAdminNotes(e.target.value)}
          placeholder="یادداشت اختیاری برای کاربر یا سوابق..."
          rows={3}
          maxLength={500}
          className="focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        />
        <span className="text-[10px] text-muted-foreground">
          {toPersianDigits(adminNotes.length)} از {toPersianDigits(500)} حرف
        </span>
      </div>

      {/* Actions */}
      <DialogFooter className="gap-2 sm:justify-start">
        <Button
          variant="default"
          disabled={isPaid || approvePending || rejectPending}
          onClick={onApprove}
          className="gap-2 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {approvePending ? <Loader2Icon className="size-4 animate-spin" /> : <CheckIcon className="size-4" />}
          {isPaid ? "قبلاً تأیید شده" : "تأیید دستی"}
        </Button>
        <Button
          variant="destructive"
          disabled={isPaid || isRejected || approvePending || rejectPending}
          onClick={onReject}
          className="gap-2 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {rejectPending ? <Loader2Icon className="size-4 animate-spin" /> : <XIcon className="size-4" />}
          رد سفارش
        </Button>
      </DialogFooter>
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

export function AdminOrdersReviewView(props: AdminOrdersReviewProps) {
  return (
    <AdminGate>
      <AdminOrdersReviewInner {...props} />
    </AdminGate>
  );
}

export default AdminOrdersReviewView;
void ChevronLeftIcon;
