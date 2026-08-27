"use client";
// =====================================================================
// POSTYAR — Admin WooCommerce Stores View
// ---------------------------------------------------------------------
// Table of all woo stores across users: owner, URL, status, masked
// consumerKey, lastSyncAt Jalali.
// =====================================================================
import { useQuery } from "@tanstack/react-query";
import {
  ExternalLinkIcon,
  Loader2Icon,
  ShoppingCartIcon,
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
import { api, type AdminWooStoreRow } from "@/components/postyar/api";
import { AdminGate } from "@/components/postyar/admin/gate";
import { toPersianDigits } from "@/lib/persian";

function statusBadge(s: string) {
  if (s === "active") return <Badge variant="default">فعال</Badge>;
  if (s === "inactive") return <Badge variant="secondary">غیرفعال</Badge>;
  if (s === "error") return <Badge variant="destructive">خطا</Badge>;
  return <Badge variant="outline">{s}</Badge>;
}

export interface AdminWooViewProps {
  navigate: (to: string) => void;
}

function AdminWooInner({ navigate: _navigate }: AdminWooViewProps) {
  const q = useQuery({
    queryKey: ["admin", "woo"],
    queryFn: () => api.getAdminWooTyped(),
    staleTime: 30_000,
  });

  const items = q.data?.items ?? [];

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <ShoppingCartIcon className="size-6" />
          فروشگاه‌های ووکامرس
        </h1>
        <p className="text-sm text-muted-foreground">
          همهٔ فروشگاه‌های ووکامرس متصل کاربران.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex flex-wrap items-center gap-3">
            <span>فهرست فروشگاه‌ها ({toPersianDigits(items.length)})</span>
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
              <ShoppingCartIcon className="size-8 opacity-50" />
              <div>فروشگاهی ثبت نشده است.</div>
            </div>
          )}
          {items.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>مالک</TableHead>
                    <TableHead>URL</TableHead>
                    <TableHead>وضعیت</TableHead>
                    <TableHead>Consumer Key</TableHead>
                    <TableHead>آخرین همگام‌سازی</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((s: AdminWooStoreRow) => (
                    <TableRow key={s.id}>
                      <TableCell className="text-xs">
                        <div>{s.ownerName ?? "—"}</div>
                        {s.ownerEmail && <div className="text-[10px] text-muted-foreground" dir="ltr">{s.ownerEmail}</div>}
                      </TableCell>
                      <TableCell>
                        <a href={s.storeUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-primary" dir="ltr">
                          <ExternalLinkIcon className="size-3.5" /> {s.storeUrl}
                        </a>
                      </TableCell>
                      <TableCell>{statusBadge(s.status)}</TableCell>
                      <TableCell dir="ltr" className="font-mono text-xs">{s.consumerKeyMasked || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{s.lastSyncAtFa ?? "—"}</TableCell>
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

export function AdminWooView(props: AdminWooViewProps) {
  return (
    <AdminGate>
      <AdminWooInner {...props} />
    </AdminGate>
  );
}

export default AdminWooView;
