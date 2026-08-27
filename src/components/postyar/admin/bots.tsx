"use client";
// =====================================================================
// POSTYAR — Admin Bots View
// ---------------------------------------------------------------------
// Table of all bots across users: owner, provider, name, status, masked
// token, createdAt Jalali. Hard-delete (admin only) — there is no
// admin-only delete endpoint today, so this view only lists; for the
// delete path we redirect to user-side bot list (the user must own the
// bot to delete it via /api/bots/[id]).
// =====================================================================
import { useQuery } from "@tanstack/react-query";
import {
  BotIcon,
  Loader2Icon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { api, type AdminBotRow } from "@/components/postyar/api";
import { AdminGate } from "@/components/postyar/admin/gate";
import { toPersianDigits } from "@/lib/persian";

function statusBadge(s: string) {
  if (s === "active") return <Badge variant="default">فعال</Badge>;
  if (s === "inactive") return <Badge variant="secondary">غیرفعال</Badge>;
  if (s === "error") return <Badge variant="destructive">خطا</Badge>;
  return <Badge variant="outline">{s}</Badge>;
}

function providerLabel(p: string): string {
  if (p === "telegram") return "تلگرام";
  if (p === "bale") return "بله";
  if (p === "rubika") return "روبیكا";
  return p;
}

export interface AdminBotsViewProps {
  navigate: (to: string) => void;
}

function AdminBotsInner({ navigate: _navigate }: AdminBotsViewProps) {
  const q = useQuery({
    queryKey: ["admin", "bots"],
    queryFn: () => api.getAdminBotsTyped(),
    staleTime: 15_000,
  });

  const bots = q.data?.items ?? [];

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <BotIcon className="size-6" />
          ربات‌های سامانه
        </h1>
        <p className="text-sm text-muted-foreground">
          فهرست همهٔ ربات‌های متصل کاربران.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex flex-wrap items-center gap-3">
            <span>فهرست ربات‌ها ({toPersianDigits(bots.length)} مورد)</span>
            {q.isFetching && <Loader2Icon className="size-4 animate-spin" />}
          </CardTitle>
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
            <div className="p-4 text-sm text-destructive">بارگذاری ربات‌ها ناموفق بود.</div>
          )}
          {!q.isLoading && bots.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
              <BotIcon className="size-8 opacity-50" />
              <div>رباتی ثبت نشده است.</div>
            </div>
          )}
          {bots.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>مالک</TableHead>
                    <TableHead>پروایدر</TableHead>
                    <TableHead>نام</TableHead>
                    <TableHead>یوزرنیم</TableHead>
                    <TableHead>وضعیت</TableHead>
                    <TableHead>ساخته‌شده</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bots.map((b: AdminBotRow) => (
                    <TableRow key={b.id}>
                      <TableCell className="text-xs">
                        <div>{b.ownerName ?? "—"}</div>
                        {b.ownerEmail && <div className="text-[10px] text-muted-foreground" dir="ltr">{b.ownerEmail}</div>}
                      </TableCell>
                      <TableCell className="text-xs">{providerLabel(b.provider)}</TableCell>
                      <TableCell className="font-medium">{b.name}</TableCell>
                      <TableCell dir="ltr" className="text-xs text-muted-foreground">{b.username ? `@${b.username}` : "—"}</TableCell>
                      <TableCell>{statusBadge(b.status)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{b.createdAtFa}</TableCell>
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

export function AdminBotsView(props: AdminBotsViewProps) {
  return (
    <AdminGate>
      <AdminBotsInner {...props} />
    </AdminGate>
  );
}

void Button;
export default AdminBotsView;
