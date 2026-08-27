"use client";
// =====================================================================
// POSTYAR — Admin Subscriptions View
// ---------------------------------------------------------------------
// Table of all subscriptions: user, plan, status, startedAt, endsAt
// Jalali. Cancel action — graceful fallback if backend endpoint is not
// yet wired (the only existing route is GET /api/admin/subscriptions).
// =====================================================================
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  Loader2Icon,
  PackageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { api, type AdminSubscriptionRow } from "@/components/postyar/api";
import { AdminGate } from "@/components/postyar/admin/gate";
import { toPersianDigits } from "@/lib/persian";

const PAGE_SIZE = 25;

function statusBadge(s: string) {
  if (s === "active") return <Badge variant="default">فعال</Badge>;
  if (s === "expired") return <Badge variant="secondary">منقضی</Badge>;
  if (s === "cancelled") return <Badge variant="outline">لغوشده</Badge>;
  if (s === "suspended") return <Badge variant="destructive">معلق</Badge>;
  return <Badge variant="outline">{s}</Badge>;
}

export interface AdminSubscriptionsViewProps {
  navigate: (to: string) => void;
}

function AdminSubscriptionsInner({ navigate: _navigate }: AdminSubscriptionsViewProps) {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>("");

  const q = useQuery({
    queryKey: ["admin", "subscriptions", page, status],
    queryFn: () => api.getAdminSubscriptionsTyped({ page, pageSize: PAGE_SIZE, status: status || undefined }),
    staleTime: 15_000,
  });

  const rows = q.data?.items ?? [];
  const total = q.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <PackageIcon className="size-6" />
          اشتراک‌ها
        </h1>
        <p className="text-sm text-muted-foreground">
          مشاهدهٔ همهٔ اشتراک‌های فعال، منقضی یا لغوشدهٔ کاربران.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex flex-wrap items-center gap-3">
            <span>فهرست اشتراک‌ها ({toPersianDigits(total)} مورد)</span>
            {q.isFetching && <Loader2Icon className="size-4 animate-spin" />}
          </CardTitle>
          <div className="mt-2 max-w-xs">
            <Select value={status || "all"} onValueChange={(v) => { setStatus(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-full"><SelectValue placeholder="همهٔ وضعیت‌ها" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همهٔ وضعیت‌ها</SelectItem>
                <SelectItem value="active">فعال</SelectItem>
                <SelectItem value="expired">منقضی</SelectItem>
                <SelectItem value="cancelled">لغوشده</SelectItem>
                <SelectItem value="suspended">معلق</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {q.isLoading && (
            <div className="flex flex-col gap-2 p-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          )}
          {q.error && (
            <div className="p-4 text-sm text-destructive">بارگذاری اشتراک‌ها ناموفق بود.</div>
          )}
          {!q.isLoading && rows.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
              <PackageIcon className="size-8 opacity-50" />
              <div>اشتراکی یافت نشد.</div>
            </div>
          )}
          {rows.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>کاربر</TableHead>
                    <TableHead>پلن</TableHead>
                    <TableHead>وضعیت</TableHead>
                    <TableHead>شروع</TableHead>
                    <TableHead>پایان</TableHead>
                    <TableHead>مبلغ پلن</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((s: AdminSubscriptionRow) => (
                    <TableRow key={s.id}>
                      <TableCell className="text-xs">
                        <div>{s.userFullName}</div>
                        <div className="text-[10px] text-muted-foreground" dir="ltr">{s.userEmail}</div>
                      </TableCell>
                      <TableCell className="font-medium">{s.planName}</TableCell>
                      <TableCell>{statusBadge(s.status)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{s.startedAtFa}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{s.endsAtFa}</TableCell>
                      <TableCell className="tabular-nums text-xs">{s.priceFa}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t p-3">
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                <ChevronRightIcon className="size-4" /> قبلی
              </Button>
              <span className="text-xs text-muted-foreground">
                صفحهٔ {toPersianDigits(page)} از {toPersianDigits(totalPages)}
              </span>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                بعدی <ChevronLeftIcon className="size-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function AdminSubscriptionsView(props: AdminSubscriptionsViewProps) {
  return (
    <AdminGate>
      <AdminSubscriptionsInner {...props} />
    </AdminGate>
  );
}

export default AdminSubscriptionsView;
