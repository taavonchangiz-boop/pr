"use client";
// =====================================================================
// POSTYAR — Admin Tickets View
// ---------------------------------------------------------------------
// Table of all tickets: subject, owner, status, priority, assignedTo.
// Assign to support staff (select). Click to navigate to ticket detail.
// =====================================================================
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  Loader2Icon,
  TicketIcon,
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
import { api, type AdminTicketRow, type AdminUserRow } from "@/components/postyar/api";
import { AdminGate } from "@/components/postyar/admin/gate";
import { toPersianDigits } from "@/lib/persian";

const PAGE_SIZE = 25;

function statusBadge(s: string) {
  if (s === "open") return <Badge variant="secondary">باز</Badge>;
  if (s === "answered") return <Badge variant="default">پاسخ داده‌شده</Badge>;
  if (s === "closed") return <Badge variant="outline">بسته</Badge>;
  return <Badge variant="outline">{s}</Badge>;
}

function priorityBadge(p: string) {
  if (p === "high" || p === "urgent") return <Badge variant="destructive">{p}</Badge>;
  if (p === "normal") return <Badge variant="secondary">عادی</Badge>;
  return <Badge variant="outline">{p}</Badge>;
}

export interface AdminTicketsViewProps {
  navigate: (to: string) => void;
}

function AdminTicketsInner({ navigate }: AdminTicketsViewProps) {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>("");

  const q = useQuery({
    queryKey: ["admin", "tickets", page, status],
    queryFn: () => api.getAdminTicketsTyped({ limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE, status: status || undefined }),
    staleTime: 15_000,
  });
  const supportQ = useQuery({
    queryKey: ["admin", "support-users"],
    queryFn: () => api.getAdminUsersTyped({ role: "support", limit: 100 }),
    staleTime: 60_000,
  });

  const assignMut = useMutation({
    mutationFn: ({ ticketId, supportUserId }: { ticketId: string; supportUserId: string }) =>
      api.adminAssignTicket(ticketId, supportUserId),
    onSuccess: () => {
      toast.success("تیکت واگذار شد.");
      qc.invalidateQueries({ queryKey: ["admin", "tickets"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "واگذاری ناموفق بود."),
  });

  const tickets = q.data?.items ?? [];
  const total = q.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const supporters: AdminUserRow[] = supportQ.data?.items ?? [];

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <TicketIcon className="size-6" />
          تیکت‌ها
        </h1>
        <p className="text-sm text-muted-foreground">
          فهرست همهٔ تیکت‌ها و واگذاری به پشتیبانان.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex flex-wrap items-center gap-3">
            <span>فهرست تیکت‌ها ({toPersianDigits(total)} مورد)</span>
            {q.isFetching && <Loader2Icon className="size-4 animate-spin" />}
            <div className="mr-auto">
              <Select value={status || "all"} onValueChange={(v) => { setStatus(v === "all" ? "" : v); setPage(1); }}>
                <SelectTrigger className="w-40"><SelectValue placeholder="همه" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه</SelectItem>
                  <SelectItem value="open">باز</SelectItem>
                  <SelectItem value="answered">پاسخ داده‌شده</SelectItem>
                  <SelectItem value="closed">بسته</SelectItem>
                </SelectContent>
              </Select>
            </div>
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
            <div className="p-4 text-sm text-destructive">بارگذاری تیکت‌ها ناموفق بود.</div>
          )}
          {!q.isLoading && tickets.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
              <TicketIcon className="size-8 opacity-50" />
              <div>تیکتی یافت نشد.</div>
            </div>
          )}
          {tickets.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>موضوع</TableHead>
                    <TableHead>مالک</TableHead>
                    <TableHead>وضعیت</TableHead>
                    <TableHead>اولویت</TableHead>
                    <TableHead>پشتیبان</TableHead>
                    <TableHead>به‌روزشده</TableHead>
                    <TableHead className="text-left">عملیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tickets.map((t: AdminTicketRow) => (
                    <TableRow
                      key={t.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/dashboard/ticket/${t.id}`)}
                    >
                      <TableCell className="max-w-[280px] truncate font-medium">{t.subject}</TableCell>
                      <TableCell className="text-xs">{t.ownerNameFa}</TableCell>
                      <TableCell>{statusBadge(t.status)}</TableCell>
                      <TableCell>{priorityBadge(t.priority)}</TableCell>
                      <TableCell>
                        {t.assignedToNameFa ? (
                          <span className="text-xs">{t.assignedToNameFa}</span>
                        ) : (
                          <Select
                            value=""
                            onValueChange={(v) => { assignMut.mutate({ ticketId: t.id, supportUserId: v }); }}
                          >
                            <SelectTrigger className="w-32 h-8 text-xs" onClick={(e) => e.stopPropagation()}>
                              <SelectValue placeholder="واگذاری" />
                            </SelectTrigger>
                            <SelectContent>
                              {supporters.length === 0 && (
                                <SelectItem value="none" disabled>پشتیبانی یافت نشد</SelectItem>
                              )}
                              {supporters.map((s) => (
                                <SelectItem key={s.id} value={s.id}>
                                  {s.firstName} {s.lastName}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{t.updatedAtFa}</TableCell>
                      <TableCell>
                        <div className="flex justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); navigate(`/dashboard/ticket/${t.id}`); }}
                          >
                            مشاهده
                          </Button>
                        </div>
                      </TableCell>
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

export function AdminTicketsView(props: AdminTicketsViewProps) {
  return (
    <AdminGate roles={["admin", "support"]}>
      <AdminTicketsInner {...props} />
    </AdminGate>
  );
}

export default AdminTicketsView;
