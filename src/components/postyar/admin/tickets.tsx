"use client";
// =====================================================================
// POSTYAR — Admin Tickets View
// ---------------------------------------------------------------------
// Table of all tickets: subject, owner, status, priority, department,
// assignedTo. Per-row controls let the admin:
//   - assign a department (Select «انتساب به دپارتمان»)
//   - assign a support-staff user (Select «انتساب به پشتیبان»)
//   - set ticket priority (Select low/normal/high/urgent)
// All three are wired to POST /api/admin/tickets/[id]/assign.
//
// Top filters: status (existing) + department (new). The page also has
// a «مدیریت دپارتمان‌ها» button that opens a Dialog hosting the
// <TicketDepartmentsManager embedded /> CRUD view.
//
// Click a row (outside the Selects) to navigate to ticket detail.
// =====================================================================
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  LayersIcon,
  Loader2Icon,
  TicketIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  api,
  type AdminTicketRow,
  type AdminUserRow,
  type TicketDepartmentRow,
} from "@/components/postyar/api";
import { AdminGate } from "@/components/postyar/admin/gate";
import { TicketDepartmentsManager } from "@/components/postyar/admin/ticket-departments";
import { toPersianDigits } from "@/lib/persian";

const PAGE_SIZE = 25;

const PRIORITY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "low", label: "کم" },
  { value: "normal", label: "عادی" },
  { value: "high", label: "زیاد" },
  { value: "urgent", label: "فوری" },
];

function statusBadge(s: string) {
  if (s === "open") return <Badge variant="secondary">باز</Badge>;
  if (s === "answered") return <Badge variant="default">پاسخ داده‌شده</Badge>;
  if (s === "closed") return <Badge variant="outline">بسته</Badge>;
  return <Badge variant="outline">{s}</Badge>;
}

export interface AdminTicketsViewProps {
  navigate: (to: string) => void;
}

function AdminTicketsInner({ navigate }: AdminTicketsViewProps) {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>("");
  const [departmentId, setDepartmentId] = useState<string>("");
  const [showDepartments, setShowDepartments] = useState(false);

  const q = useQuery({
    queryKey: ["admin", "tickets", page, status, departmentId],
    queryFn: () =>
      api.getAdminTicketsTyped({
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
        status: status || undefined,
        departmentId:
          departmentId === "" ? undefined : departmentId === "none" ? null : departmentId,
      }),
    staleTime: 15_000,
  });
  const supportQ = useQuery({
    queryKey: ["admin", "support-users"],
    queryFn: () => api.getAdminUsersTyped({ role: "support", limit: 100 }),
    staleTime: 60_000,
  });
  const adminSupportQ = useQuery({
    queryKey: ["admin", "support+admin-users"],
    queryFn: () => api.getAdminUsersTyped({ role: "admin", limit: 100 }),
    staleTime: 60_000,
  });
  const depQ = useQuery({
    queryKey: ["admin", "ticket-departments"],
    queryFn: () => api.getTicketDepartments(),
    staleTime: 60_000,
  });

  // Legacy single-assign flow (still kept for the inline «واگذاری» Select when
  // the ticket has no assignee; routes through the existing PATCH endpoint).
  const assignMut = useMutation({
    mutationFn: ({ ticketId, supportUserId }: { ticketId: string; supportUserId: string }) =>
      api.adminAssignTicket(ticketId, supportUserId),
    onSuccess: () => {
      toast.success("تیکت واگذار شد.");
      qc.invalidateQueries({ queryKey: ["admin", "tickets"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "واگذاری ناموفق بود."),
  });

  // New combined-assign flow (department / support / priority).
  const assignFieldsMut = useMutation({
    mutationFn: (args: {
      ticketId: string;
      body: { departmentId?: string | null; assignedToId?: string | null; priority?: "low" | "normal" | "high" | "urgent" };
    }) => api.adminAssignTicketFields(args.ticketId, args.body),
    onSuccess: (_data, args) => {
      const summaryBits: string[] = [];
      if (args.body.departmentId !== undefined) summaryBits.push("دپارتمان");
      if (args.body.assignedToId !== undefined) summaryBits.push("پشتیبان");
      if (args.body.priority !== undefined) summaryBits.push("اولویت");
      const summary = summaryBits.length > 0 ? summaryBits.join("، ") : "تیکت";
      toast.success(`${summary} به‌روز شد.`);
      qc.invalidateQueries({ queryKey: ["admin", "tickets"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "به‌روزرسانی ناموفق بود."),
  });

  const tickets = q.data?.items ?? [];
  const total = q.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const supporters: AdminUserRow[] = supportQ.data?.items ?? [];
  const adminSupporters: AdminUserRow[] = adminSupportQ.data?.items ?? [];
  const combinedStaff: AdminUserRow[] = [...supporters, ...adminSupporters];
  const departments: TicketDepartmentRow[] = depQ.data?.items ?? [];

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <TicketIcon className="size-6" />
            تیکت‌ها
          </h1>
          <p className="text-sm text-muted-foreground">
            فهرست همهٔ تیکت‌ها، انتساب به دپارتمان و پشتیبان، و تعیین اولویت.
          </p>
        </div>
        <Button variant="outline" onClick={() => setShowDepartments(true)}>
          <LayersIcon className="size-4" />
          مدیریت دپارتمان‌ها
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex flex-wrap items-center gap-3">
            <span>فهرست تیکت‌ها ({toPersianDigits(total)} مورد)</span>
            {q.isFetching && <Loader2Icon className="size-4 animate-spin" />}
            <div className="mr-auto flex flex-wrap items-center gap-2">
              <Select
                value={departmentId || "all"}
                onValueChange={(v) => {
                  setDepartmentId(v === "all" ? "" : v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="همهٔ دپارتمان‌ها" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همهٔ دپارتمان‌ها</SelectItem>
                  <SelectItem value="none">بدون دپارتمان</SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.nameFa}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={status || "all"}
                onValueChange={(v) => {
                  setStatus(v === "all" ? "" : v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="همهٔ وضعیت‌ها" />
                </SelectTrigger>
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
                    <TableHead>دپارتمان</TableHead>
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
                      <TableCell className="max-w-[220px] truncate font-medium">{t.subject}</TableCell>
                      <TableCell className="text-xs">{t.ownerNameFa}</TableCell>
                      <TableCell>{statusBadge(t.status)}</TableCell>
                      <TableCell>
                        <Select
                          value={t.priority}
                          onValueChange={(v) => {
                            assignFieldsMut.mutate({
                              ticketId: t.id,
                              body: { priority: v as "low" | "normal" | "high" | "urgent" },
                            });
                          }}
                        >
                          <SelectTrigger
                            className="h-8 w-24 text-xs"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PRIORITY_OPTIONS.map((p) => (
                              <SelectItem key={p.value} value={p.value}>
                                {p.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={t.departmentId ?? "none"}
                          onValueChange={(v) => {
                            assignFieldsMut.mutate({
                              ticketId: t.id,
                              body: { departmentId: v === "none" ? null : v },
                            });
                          }}
                        >
                          <SelectTrigger
                            className="h-8 w-32 text-xs"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <SelectValue placeholder="انتساب" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">بدون دپارتمان</SelectItem>
                            {departments.map((d) => (
                              <SelectItem key={d.id} value={d.id}>
                                {d.nameFa}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={t.assignedToId ?? "none"}
                          onValueChange={(v) => {
                            if (v === "none") {
                              assignFieldsMut.mutate({
                                ticketId: t.id,
                                body: { assignedToId: null },
                              });
                            } else {
                              // Use the legacy single-assign endpoint when there's
                              // no existing assignee so the toast wording stays
                              // consistent; otherwise the new combined flow.
                              if (!t.assignedToId) {
                                assignMut.mutate({ ticketId: t.id, supportUserId: v });
                              } else {
                                assignFieldsMut.mutate({
                                  ticketId: t.id,
                                  body: { assignedToId: v },
                                });
                              }
                            }
                          }}
                        >
                          <SelectTrigger
                            className="h-8 w-32 text-xs"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <SelectValue placeholder="واگذاری" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">بدون پشتیبان</SelectItem>
                            {combinedStaff.length === 0 && (
                              <SelectItem value="empty" disabled>
                                پشتیبانی یافت نشد
                              </SelectItem>
                            )}
                            {combinedStaff.map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.firstName} {s.lastName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{t.updatedAtFa}</TableCell>
                      <TableCell>
                        <div className="flex justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/dashboard/ticket/${t.id}`);
                            }}
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                <ChevronRightIcon className="size-4" /> قبلی
              </Button>
              <span className="text-xs text-muted-foreground">
                صفحهٔ {toPersianDigits(page)} از {toPersianDigits(totalPages)}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                بعدی <ChevronLeftIcon className="size-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showDepartments} onOpenChange={setShowDepartments}>
        <DialogContent dir="rtl" className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LayersIcon className="size-5" />
              مدیریت دپارتمان‌های پشتیبانی
            </DialogTitle>
            <DialogDescription>
              دپارتمان‌ها را تعریف، ویرایش یا حذف کنید. تیکت‌ها از طریق فیلتر بالا
              و ستون «دپارتمان» به هر دپارتمان اختصاص می‌یابند.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-y-auto">
            <TicketDepartmentsManager embedded />
          </div>
        </DialogContent>
      </Dialog>
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
