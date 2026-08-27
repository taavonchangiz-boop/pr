"use client";
// =====================================================================
// POSTYAR — Admin Audit View
// ---------------------------------------------------------------------
// Paginated table: actor, action, targetType, targetId, ip, Jalali
// timestamp, meta (collapsible JSON). Filters: actor, action,
// targetType.
// =====================================================================
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  HistoryIcon,
  Loader2Icon,
  SearchIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { api, type AdminAuditRow } from "@/components/postyar/api";
import { AdminGate } from "@/components/postyar/admin/gate";
import { toPersianDigits } from "@/lib/persian";

const PAGE_SIZE = 50;

const ACTORS = [
  { value: "user", label: "کاربر" },
  { value: "admin", label: "مدیر" },
  { value: "system", label: "سیستم" },
  { value: "webhook", label: "هوک ربات" },
];

const COMMON_ACTIONS = [
  "user_updated", "user_login", "plan_created", "plan_updated", "plan_deleted",
  "discount_created", "discount_updated", "discount_deleted", "bot_created",
  "bot_updated", "bot_deleted", "bot_broadcast", "bot_workflow_created",
  "bot_workflow_updated", "bot_link_code_generated", "ad_draft_created",
  "ad_approved", "ad_rejected", "order_created", "order_paid", "card_order_approved",
  "card_order_rejected", "system_setting_updated",
];

const COMMON_TARGETS = [
  "user", "plan", "discount", "bot", "bot_workflow", "ad", "order",
  "subscription", "system_setting", "wallet", "ticket", "media", "destination",
];

export interface AdminAuditViewProps {
  navigate: (to: string) => void;
}

function AdminAuditInner({ navigate: _navigate }: AdminAuditViewProps) {
  const [actor, setActor] = useState<string>("");
  const [action, setAction] = useState<string>("");
  const [targetType, setTargetType] = useState<string>("");
  const [page, setPage] = useState(1);

  const q = useQuery({
    queryKey: ["admin", "audit", actor, action, targetType, page],
    queryFn: () => api.getAdminAuditTyped({
      actor: actor || undefined,
      action: action || undefined,
      targetType: targetType || undefined,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    staleTime: 15_000,
  });

  const rows = q.data?.items ?? [];
  const total = q.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <HistoryIcon className="size-6" />
          ممیزی رویدادها
        </h1>
        <p className="text-sm text-muted-foreground">
          رد رویدادهای حساس سیستم (ورود، تغییرات نقش، تنظیمات، پرداخت‌ها و...).
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex flex-wrap items-center gap-3">
            <span>فهرست رویدادها ({toPersianDigits(total)} مورد)</span>
            {q.isFetching && <Loader2Icon className="size-4 animate-spin" />}
          </CardTitle>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div>
              <label className="text-xs text-muted-foreground">بازیگر</label>
              <Select value={actor || "all"} onValueChange={(v) => { setActor(v === "all" ? "" : v); setPage(1); }}>
                <SelectTrigger className="w-full"><SelectValue placeholder="همه" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه</SelectItem>
                  {ACTORS.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">نوع عمل</label>
              <Select value={action || "all"} onValueChange={(v) => { setAction(v === "all" ? "" : v); setPage(1); }}>
                <SelectTrigger className="w-full"><SelectValue placeholder="همه" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه</SelectItem>
                  {COMMON_ACTIONS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">نوع هدف</label>
              <Select value={targetType || "all"} onValueChange={(v) => { setTargetType(v === "all" ? "" : v); setPage(1); }}>
                <SelectTrigger className="w-full"><SelectValue placeholder="همه" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه</SelectItem>
                  {COMMON_TARGETS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
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
            <div className="p-4 text-sm text-destructive">بارگذاری ممیزی ناموفق بود.</div>
          )}
          {!q.isLoading && rows.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
              <HistoryIcon className="size-8 opacity-50" />
              <div>رویدادی یافت نشد.</div>
            </div>
          )}
          {rows.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>بازیگر</TableHead>
                    <TableHead>کاربر</TableHead>
                    <TableHead>عمل</TableHead>
                    <TableHead>نوع هدف</TableHead>
                    <TableHead>شناسهٔ هدف</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead>زمان</TableHead>
                    <TableHead>متادیتا</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r: AdminAuditRow) => (
                    <AuditRow key={r.id} r={r} />
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

function AuditRow({ r }: { r: AdminAuditRow }) {
  const [open, setOpen] = useState(false);
  return (
    <TableRow>
      <TableCell><Badge variant="outline">{r.actor}</Badge></TableCell>
      <TableCell className="text-xs">
        {r.userName ?? "—"}
        {r.userEmail && <div className="text-[10px] text-muted-foreground" dir="ltr">{r.userEmail}</div>}
      </TableCell>
      <TableCell dir="ltr" className="font-mono text-[11px]">{r.action}</TableCell>
      <TableCell dir="ltr" className="font-mono text-[11px]">{r.targetType}</TableCell>
      <TableCell dir="ltr" className="font-mono text-[10px] text-muted-foreground">{r.targetId ? r.targetId.slice(0, 10) : "—"}</TableCell>
      <TableCell dir="ltr" className="text-[11px] text-muted-foreground">{r.ip ?? "—"}</TableCell>
      <TableCell className="text-xs text-muted-foreground">{r.createdAtFa}</TableCell>
      <TableCell>
        {r.meta ? (
          <Collapsible open={open} onOpenChange={setOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm">
                <ChevronDownIcon className={`size-4 transition-transform ${open ? "" : "-rotate-90"}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <pre dir="ltr" className="mt-2 max-h-40 max-w-md overflow-auto rounded-md border bg-muted/30 p-2 text-[10px]">
                {JSON.stringify(r.meta, null, 2)}
              </pre>
            </CollapsibleContent>
          </Collapsible>
        ) : "—"}
      </TableCell>
    </TableRow>
  );
}

export function AdminAuditView(props: AdminAuditViewProps) {
  return (
    <AdminGate>
      <AdminAuditInner {...props} />
    </AdminGate>
  );
}

void SearchIcon;
export default AdminAuditView;
