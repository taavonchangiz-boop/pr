"use client";
// =====================================================================
// POSTYAR — Admin Orders View
// ---------------------------------------------------------------------
// Table of all orders across users: user, kind, amount, status, provider,
// createdAt Jalali. For card-to-card awaiting_review orders: show
// receipt thumbnail + approve/reject buttons (POST /api/admin/orders/[id]
// /approve or /reject). Best-effort: if the admin list endpoint is not
// yet wired, the view shows a friendly notice instead of crashing.
// =====================================================================
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertCircleIcon,
  CheckIcon,
  ListOrderedIcon,
  Loader2Icon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, type AdminOrderRow } from "@/components/postyar/api";
import { AdminGate } from "@/components/postyar/admin/gate";
import { formatJalaliDateTime, toPersianDigits } from "@/lib/persian";

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

function kindFa(k: string): string {
  if (k === "subscription") return "اشتراک";
  if (k === "wallet_credit") return "شارژ کیف پول";
  if (k === "ad_campaign") return "کمپین تبلیغاتی";
  return k;
}

function providerFa(p: string | null): string {
  if (!p) return "—";
  if (p === "card") return "کارت به کارت";
  if (p === "bank") return "درگاه بانکی";
  if (p === "bale") return "باپ";
  return p;
}

export interface AdminOrdersViewProps {
  navigate: (to: string) => void;
}

function AdminOrdersInner({ navigate: _navigate }: AdminOrdersViewProps) {
  const qc = useQueryClient();
  const [orderIdInput, setOrderIdInput] = useState("");
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [approveId, setApproveId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["admin", "orders"],
    queryFn: () => api.getAdminOrdersTyped(),
    staleTime: 15_000,
  });

  const approveMut = useMutation({
    mutationFn: (id: string) => api.adminApproveOrder(id),
    onSuccess: () => {
      toast.success("سفارش تأیید شد و کیف پول کاربر شارژ شد.");
      setApproveId(null);
      qc.invalidateQueries({ queryKey: ["admin", "orders"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "تأیید ناموفق بود."),
  });
  const rejectMut = useMutation({
    mutationFn: (id: string) => api.adminRejectOrder(id),
    onSuccess: () => {
      toast.success("سفارش رد شد.");
      setRejectId(null);
      qc.invalidateQueries({ queryKey: ["admin", "orders"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "رد ناموفق بود."),
  });

  const orders = q.data?.items ?? [];

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <ListOrderedIcon className="size-6" />
          سفارش‌ها
        </h1>
        <p className="text-sm text-muted-foreground">
          مدیریت سفارش‌های سیستم و بررسی رسیدهای کارت‌به‌کارت.
        </p>
      </div>

      {orders.length === 0 && (
        <Alert>
          <AlertCircleIcon className="size-4" />
          <AlertTitle>فهرست سفارش‌ها</AlertTitle>
          <AlertDescription>
            در صورت نیاز، شناسهٔ سفارش را از بخش اعلان مدیران وارد کنید تا عملیات تأیید/رد روی آن اعمال شود. فهرست‌سازی کامل سفارش‌ها در نسخهٔ بعد فعال خواهد شد.
          </AlertDescription>
        </Alert>
      )}

      {orders.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">فهرست سفارش‌ها ({toPersianDigits(orders.length)})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>کاربر</TableHead>
                    <TableHead>نوع</TableHead>
                    <TableHead>مبلغ</TableHead>
                    <TableHead>وضعیت</TableHead>
                    <TableHead>پروایدر</TableHead>
                    <TableHead>تاریخ</TableHead>
                    <TableHead className="text-left">عملیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((o: AdminOrderRow) => (
                    <TableRow key={o.id}>
                      <TableCell className="text-xs">
                        <div>{o.userFullName}</div>
                        <div className="text-[10px] text-muted-foreground" dir="ltr">{o.userEmail}</div>
                      </TableCell>
                      <TableCell className="text-xs">{o.kindFa ?? kindFa(o.kind)}</TableCell>
                      <TableCell className="tabular-nums text-xs">{o.amountFa ?? toPersianDigits(o.amountRials)}</TableCell>
                      <TableCell><StatusBadge status={o.status} /></TableCell>
                      <TableCell className="text-xs">{o.providerFa ?? providerFa(o.provider)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{o.createdAtFa ?? formatJalaliDateTime(o.createdAt, { withTime: true })}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          {o.status === "awaiting_review" && (
                            <>
                              <Button variant="ghost" size="sm" className="text-emerald-600" onClick={() => setApproveId(o.id)} disabled={approveMut.isPending}>
                                <CheckIcon className="size-4" />
                              </Button>
                              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setRejectId(o.id)}>
                                <XIcon className="size-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">عملیات مستقیم روی شناسهٔ سفارش</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5 flex-1 min-w-48">
            <Label htmlFor="o-id">شناسهٔ سفارش</Label>
            <Input id="o-id" dir="ltr" value={orderIdInput} onChange={(e) => setOrderIdInput(e.target.value)} placeholder="ord_..." />
          </div>
          <Button
            variant="default"
            disabled={!orderIdInput.trim() || approveMut.isPending}
            onClick={() => { if (orderIdInput.trim()) { approveMut.mutate(orderIdInput.trim()); setApproveId(null); } }}
          >
            <CheckIcon className="size-4" /> تأیید
          </Button>
          <Button
            variant="outline"
            className="text-destructive hover:text-destructive"
            disabled={!orderIdInput.trim() || rejectMut.isPending}
            onClick={() => { if (orderIdInput.trim()) { rejectMut.mutate(orderIdInput.trim()); setRejectId(null); } }}
          >
            <XIcon className="size-4" /> رد
          </Button>
        </CardContent>
      </Card>

      <AlertDialog open={!!approveId} onOpenChange={(o) => !o && setApproveId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأیید سفارش</AlertDialogTitle>
            <AlertDialogDescription>
              با تأیید، مبلغ به کیف پول کاربر شارژ می‌شود و سفارش در حالت «پرداخت‌شده» قرار می‌گیرد. این عمل قابل بازگشت نیست.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction onClick={() => approveId && approveMut.mutate(approveId)}>تأیید</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!rejectId} onOpenChange={(o) => !o && setRejectId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>رد سفارش</AlertDialogTitle>
            <AlertDialogDescription>با رد سفارش، وضعیت به «ناموفق» تغییر می‌کند و رسید رد می‌شود.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => rejectId && rejectMut.mutate(rejectId)}
            >
              رد
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {q.isLoading && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      )}
    </div>
  );
}

export function AdminOrdersView(props: AdminOrdersViewProps) {
  return (
    <AdminGate>
      <AdminOrdersInner {...props} />
    </AdminGate>
  );
}

void Loader2Icon;
export default AdminOrdersView;
