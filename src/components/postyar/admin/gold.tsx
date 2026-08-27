"use client";
// =====================================================================
// POSTYAR — Admin Gold Bots View
// ---------------------------------------------------------------------
// Table of all gold bots across users: owner, instrument, direction,
// thresholdPct, enabled, lastFiredAt Jalali.
// =====================================================================
import { useQuery } from "@tanstack/react-query";
import {
  Loader2Icon,
  TrendingUpIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, type AdminGoldBotRow } from "@/components/postyar/api";
import { AdminGate } from "@/components/postyar/admin/gate";
import { toPersianDigits } from "@/lib/persian";

function directionFa(d: string): string {
  if (d === "up") return "صعودی";
  if (d === "down") return "نزولی";
  if (d === "both") return "هر دو";
  return d;
}

export interface AdminGoldViewProps {
  navigate: (to: string) => void;
}

function AdminGoldInner({ navigate: _navigate }: AdminGoldViewProps) {
  const q = useQuery({
    queryKey: ["admin", "gold"],
    queryFn: () => api.getAdminGoldTyped(),
    staleTime: 30_000,
  });

  const items = q.data?.items ?? [];

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <TrendingUpIcon className="size-6" />
          بات‌های طلای سامانه
        </h1>
        <p className="text-sm text-muted-foreground">
          پایش بات‌های طلای فعال کاربران.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex flex-wrap items-center gap-3">
            <span>فهرست بات‌ها ({toPersianDigits(items.length)})</span>
            {q.isFetching && <Loader2Icon className="size-4 animate-spin" />}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {q.isLoading && (
            <div className="flex flex-col gap-2 p-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          )}
          {items.length === 0 && !q.isLoading && (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
              <TrendingUpIcon className="size-8 opacity-50" />
              <div>بات طلایی ثبت نشده است.</div>
            </div>
          )}
          {items.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>مالک</TableHead>
                    <TableHead>نوع طلا</TableHead>
                    <TableHead>جهت</TableHead>
                    <TableHead>آستانه (٪)</TableHead>
                    <TableHead>وضعیت</TableHead>
                    <TableHead>آخرین شلیک</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((b: AdminGoldBotRow) => (
                    <TableRow key={b.id}>
                      <TableCell className="text-xs">
                        <div>{b.ownerName ?? "—"}</div>
                        {b.ownerEmail && <div className="text-[10px] text-muted-foreground" dir="ltr">{b.ownerEmail}</div>}
                      </TableCell>
                      <TableCell dir="ltr" className="font-mono text-xs">{b.instrument}</TableCell>
                      <TableCell className="text-xs">{directionFa(b.direction)}</TableCell>
                      <TableCell className="tabular-nums text-xs">{toPersianDigits(b.thresholdPct)}٪</TableCell>
                      <TableCell>
                        {b.enabled ? <Badge variant="default">فعال</Badge> : <Badge variant="secondary">غیرفعال</Badge>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{b.lastFiredAtFa ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function AdminGoldView(props: AdminGoldViewProps) {
  return (
    <AdminGate>
      <AdminGoldInner {...props} />
    </AdminGate>
  );
}

export default AdminGoldView;
