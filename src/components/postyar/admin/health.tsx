"use client";
// =====================================================================
// POSTYAR — Admin Health View
// ---------------------------------------------------------------------
// Cards per component: app, db, queue, worker, storage, AI provider
// config presence, gold provider, SMS provider, email provider,
// redis-shim marker. Each shows status badge (ok/warn/down) +
// message + lastCheckedAt Jalali. «به‌روزرسانی» button.
// =====================================================================
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ActivityIcon,
  DatabaseIcon,
  HardDriveIcon,
  Loader2Icon,
  MailIcon,
  MessageSquareIcon,
  RefreshCwIcon,
  ServerIcon,
  TrendingUpIcon,
  CpuIcon,
  CircuitBoardIcon,
  CheckCircle2Icon,
  AlertTriangleIcon,
  XCircleIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { api, type AdminHealthCheck } from "@/components/postyar/api";
import { AdminGate } from "@/components/postyar/admin/gate";

const ICONS: Record<string, typeof DatabaseIcon> = {
  db: DatabaseIcon,
  queue: ActivityIcon,
  worker: CpuIcon,
  storage: HardDriveIcon,
  ai: CircuitBoardIcon,
  gold: TrendingUpIcon,
  sms: MessageSquareIcon,
  email: MailIcon,
  "redis-shim": ServerIcon,
  app: ActivityIcon,
};

const LABELS: Record<string, string> = {
  db: "پایگاه داده",
  queue: "صف",
  worker: "کارگر پس‌زمینه",
  storage: "فضای ذخیره‌سازی",
  ai: "ارائه‌دهندهٔ هوش مصنوعی",
  gold: "ارائه‌دهندهٔ طلا",
  sms: "ارائه‌دهندهٔ پیامک",
  email: "ارائه‌دهندهٔ ایمیل",
  "redis-shim": "شیم Redis",
  app: "برنامه",
};

function statusIcon(status: "ok" | "warn" | "down") {
  if (status === "ok") return <CheckCircle2Icon className="size-5 text-emerald-600" />;
  if (status === "warn") return <AlertTriangleIcon className="size-5 text-amber-600" />;
  return <XCircleIcon className="size-5 text-destructive" />;
}

function statusBadge(status: "ok" | "warn" | "down") {
  if (status === "ok") return <Badge variant="default">سالم</Badge>;
  if (status === "warn") return <Badge variant="secondary">هشدار</Badge>;
  return <Badge variant="destructive">از کار افتاده</Badge>;
}

export interface AdminHealthViewProps {
  navigate: (to: string) => void;
}

function AdminHealthInner({ navigate: _navigate }: AdminHealthViewProps) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin", "health"],
    queryFn: () => api.getAdminHealthTyped(),
    staleTime: 30_000,
  });

  const checks = q.data?.checks ?? [];
  const overall = q.data?.overall ?? "down";
  const checkedAtFa = q.data?.checkedAtFa ?? "—";

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <ActivityIcon className="size-6" />
            وضعیت سامانه
          </h1>
          <p className="text-sm text-muted-foreground">
            پایش زندهٔ اجزای کلیدی پُست‌یار.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ["admin", "health"] })}>
          <RefreshCwIcon className="size-4" /> به‌روزرسانی
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3 text-sm">
            <span>وضعیت کلی:</span>
            {statusBadge(overall)}
            {q.isFetching && <Loader2Icon className="size-4 animate-spin" />}
          </CardTitle>
          <CardDescription>آخرین بررسی: {checkedAtFa}</CardDescription>
        </CardHeader>
        <CardContent>
          {q.isLoading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {checks.map((c: AdminHealthCheck) => {
                const Icon = ICONS[c.component] ?? ActivityIcon;
                return (
                  <div key={c.component} className="rounded-md border bg-card p-3">
                    <div className="flex items-center gap-2">
                      {statusIcon(c.status)}
                      <Icon className="size-4 text-muted-foreground" />
                      <span className="font-medium">{LABELS[c.component] ?? c.component}</span>
                      <span className="mr-auto">{statusBadge(c.status)}</span>
                    </div>
                    {c.message && (
                      <div dir="ltr" className="mt-2 truncate text-[11px] text-muted-foreground" title={c.message}>
                        {c.message}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function AdminHealthView(props: AdminHealthViewProps) {
  return (
    <AdminGate>
      <AdminHealthInner {...props} />
    </AdminGate>
  );
}

export default AdminHealthView;
