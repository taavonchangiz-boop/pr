"use client";
// POSTYAR — admin platform analytics view ("آمار سامانه").
// Consumes GET /api/stats/admin — renders big KPI grid, weekly growth,
// segregated breakdowns by role/status and top publishers. All Persian +
// RTL + Vazirmatn; lucide icons only (no emoji). 403 → "دسترسی غیرمجاز".
import { useEffect, useState } from "react";
import {
  ActivityIcon,
  AlertTriangleIcon,
  BadgeCheckIcon,
  BellIcon,
  BotIcon,
  CalendarClockIcon,
  CreditCardIcon,
  FileTextIcon,
  LayoutGridIcon,
  MegaphoneIcon,
  RefreshCwIcon,
  SendIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  ShoppingBagIcon,
  SparklesIcon,
  TicketIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  UserIcon,
  UsersIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { toPersianDigits } from "@/lib/persian";

// NOTE (ITEM 35): این بخش فقط برای مدیر سامانه قابل مشاهده است.
// The route /api/stats/admin enforces `requireRole(["admin"])`; the dashboard
// only renders this view for admins. The displayed `generatedAtFa` is a
// Tehran-TZ Jalali date+time (۱۵۰۵/۰۶/۰۷ - ۱۵:۳۰) — never Gregorian.

// ---------- API types (mirrors /api/stats/admin response) ----------
type UsersStat = {
  total: number;
  byRole: Record<string, number>;
  byStatus: Record<string, number>;
  newThisWeek: number;
  admins: number;
};
type SubscriptionsStat = {
  total: number;
  active: number;
  expired: number;
  cancelled: number;
};
type RevenueStat = { rials: number; fa: string };
type OrdersStat = { total: number; paid: number };
type ContentStat = { total: number; byStatus: Record<string, number> };
type PublishStat = {
  total: number;
  byStatus: Record<string, number>;
  delivered: number;
  failed: number;
  queued: number;
  scheduled: number;
};
type BotsStat = { total: number; active: number };
type NotificationsStat = { total: number; unread: number };
type TicketsStat = { total: number; byStatus: Record<string, number> };
type AdsStat = { total: number; approved: number };
type TopPublisher = {
  id: string;
  name: string;
  email: string | null;
  contentCount: number;
};
type AdminStatsResponse = {
  users: UsersStat;
  subscriptions: SubscriptionsStat;
  revenue: RevenueStat;
  orders: OrdersStat;
  content: ContentStat;
  destinations: number;
  publish: PublishStat;
  bots: BotsStat;
  notifications: NotificationsStat;
  tickets: TicketsStat;
  ads: AdsStat;
  aiJobs: number;
  audit: number;
  growth: { thisWeek: number; lastWeek: number; pct: number };
  topPublishers: TopPublisher[];
  generatedAtFa: string;
  generatedAt?: string;
};

// ---------- Loading skeleton ----------
function AdminStatsSkeleton() {
  return (
    <div className="flex flex-col gap-4" dir="rtl">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

// ---------- Error state ----------
function ErrorState({
  title,
  detail,
  onRetry,
}: {
  title: string;
  detail: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center" dir="rtl">
      <ShieldAlertIcon className="size-10 text-destructive" />
      <div className="text-sm font-medium">{title}</div>
      <div className="max-w-md text-xs text-muted-foreground">{detail}</div>
      <Button variant="outline" size="sm" onClick={onRetry} className="gap-1.5 cursor-pointer">
        <RefreshCwIcon className="size-4" />
        تلاش دوباره
      </Button>
    </div>
  );
}

// ---------- KPI card ----------
function KpiCard({
  icon: Icon,
  iconTint,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconTint: string;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="gap-2 p-4">
      <div className="flex items-start justify-between">
        <span className={cn("rounded-md p-1.5", iconTint)}>
          <Icon className="size-4" />
        </span>
        <span className="text-[10px] text-muted-foreground">{label}</span>
      </div>
      <div className="text-xl font-bold tabular-nums">{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
    </Card>
  );
}

// ---------- Segregated breakdown bar ----------
function BreakdownRow({
  label,
  count,
  total,
  tone,
}: {
  label: string;
  count: number;
  total: number;
  tone: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex flex-col gap-1 py-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs">{label}</span>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {toPersianDigits(count)} ({toPersianDigits(pct)}٪)
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full transition-all motion-safe:duration-700", tone)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ---------- Status label map (Persian) ----------
function userRoleFa(role: string): string {
  switch (role) {
    case "admin":
      return "مدیر";
    case "support":
      return "پشتیبان";
    case "user":
      return "کاربر";
    default:
      return role || "—";
  }
}
function userStatusFa(s: string): string {
  return s === "active" ? "فعال" : s === "suspended" ? "معلق" : s || "—";
}
function contentStatusFa(s: string): string {
  switch (s) {
    case "draft":
      return "پیش‌نویس";
    case "scheduled":
      return "زمان‌بندی‌شده";
    case "queued":
      return "در صف";
    case "processing":
      return "در حال پردازش";
    case "delivered":
      return "تحویل‌شده";
    case "failed":
      return "ناموفق";
    case "cancelled":
      return "لغو‌شده";
    default:
      return s || "—";
  }
}
function publishStatusFa(s: string): string {
  return contentStatusFa(s);
}
function ticketStatusFa(s: string): string {
  switch (s) {
    case "open":
      return "باز";
    case "answered":
      return "پاسخ‌داده‌شده";
    case "closed":
      return "بسته‌شده";
    default:
      return s || "—";
  }
}

// ---------- Main component ----------
export default function AdminStatsView({ navigate: _navigate }: { navigate: (to: string) => void }) {
  const [data, setData] = useState<AdminStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    setForbidden(false);
    fetch("/api/stats/admin", { credentials: "same-origin" })
      .then((r) => {
        if (r.status === 403) {
          // 403 → "دسترسی غیرمجاز" — set the forbidden branch and bail out.
          setForbidden(true);
          throw new Error("forbidden");
        }
        if (!r.ok) throw new Error("خطا در دریافت آمار سامانه");
        return r.json() as Promise<AdminStatsResponse>;
      })
      .then((d) => setData(d))
      .catch((e: unknown) => {
        // The forbidden path already set its own state; skip error overwriting.
        if (e instanceof Error && e.message === "forbidden") return;
        setError(e instanceof Error ? e.message : "خطای ناشناخته");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) return <AdminStatsSkeleton />;
  if (forbidden)
    return (
      <ErrorState
        title="دسترسی غیرمجاز"
        detail="این بخش تنها برای مدیران سامانه قابل دسترس است."
        onRetry={load}
      />
    );
  if (error || !data)
    return (
      <ErrorState
        title="خطا در بارگذاری آمار سامانه"
        detail="امکان دریافت آمار تفکیکی سامانه نبود. لطفاً دوباره تلاش کنید."
        onRetry={load}
      />
    );

  const {
    users,
    subscriptions,
    revenue,
    orders,
    content,
    destinations,
    publish,
    bots,
    notifications,
    tickets,
    ads,
    aiJobs,
    audit,
    growth,
    topPublishers,
  } = data;
  const growthUp = growth.pct >= 0;

  // Compute totals for breakdown percentages
  const usersByRoleTotal = Object.values(users.byRole).reduce((a, b) => a + b, 0) || users.total;
  const usersByStatusTotal = Object.values(users.byStatus).reduce((a, b) => a + b, 0) || users.total;
  const contentByStatusTotal = Object.values(content.byStatus).reduce((a, b) => a + b, 0) || content.total;
  const publishByStatusTotal = Object.values(publish.byStatus).reduce((a, b) => a + b, 0) || publish.total;
  const ticketsByStatusTotal = Object.values(tickets.byStatus).reduce((a, b) => a + b, 0) || tickets.total;

  return (
    <div className="flex flex-col gap-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">آمار سامانه</h1>
          <p className="text-sm text-muted-foreground">
            نمایی دقیق و تفکیک‌شده از وضعیت پلتفرم، کاربران، انتشار و درآمد.
          </p>
        </div>
        {data.generatedAtFa && (
          <Badge variant="outline" className="tabular-nums">
            <CalendarClockIcon className="size-3" />
            {data.generatedAtFa}
          </Badge>
        )}
      </div>

      {/* ===== Section 1: big KPI grid ===== */}
      <section>
        <div className="mb-2 flex items-center gap-2">
          <ActivityIcon className="size-4 text-primary" />
          <h2 className="text-sm font-semibold">شاخص‌های کلیدی</h2>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
          <KpiCard
            icon={UsersIcon}
            iconTint="bg-teal-100 text-teal-700"
            label="کاربران کل"
            value={toPersianDigits(users.total)}
            hint={`${toPersianDigits(users.newThisWeek)} نفر این هفته`}
          />
          <KpiCard
            icon={ShieldCheckIcon}
            iconTint="bg-amber-100 text-amber-700"
            label="مدیران"
            value={toPersianDigits(users.admins)}
          />
          <KpiCard
            icon={UserIcon}
            iconTint="bg-sky-100 text-sky-700"
            label="کاربران جدید این هفته"
            value={toPersianDigits(users.newThisWeek)}
          />
          <KpiCard
            icon={BadgeCheckIcon}
            iconTint="bg-emerald-100 text-emerald-700"
            label="اشتراک فعال"
            value={toPersianDigits(subscriptions.active)}
            hint={`از ${toPersianDigits(subscriptions.total)} اشتراک`}
          />
          <KpiCard
            icon={CreditCardIcon}
            iconTint="bg-violet-100 text-violet-700"
            label="درآمد"
            value={revenue.fa}
          />
          <KpiCard
            icon={ShoppingBagIcon}
            iconTint="bg-rose-100 text-rose-700"
            label="سفارش‌های موفق"
            value={toPersianDigits(orders.paid)}
            hint={`از ${toPersianDigits(orders.total)} سفارش`}
          />
          <KpiCard
            icon={FileTextIcon}
            iconTint="bg-cyan-100 text-cyan-700"
            label="محتوا"
            value={toPersianDigits(content.total)}
          />
          <KpiCard
            icon={LayoutGridIcon}
            iconTint="bg-teal-100 text-teal-700"
            label="مقاصد"
            value={toPersianDigits(destinations)}
          />
          <KpiCard
            icon={SendIcon}
            iconTint="bg-emerald-100 text-emerald-700"
            label="انتشار کل"
            value={toPersianDigits(publish.total)}
          />
          <KpiCard
            icon={BadgeCheckIcon}
            iconTint="bg-emerald-100 text-emerald-700"
            label="تحویل‌شده"
            value={toPersianDigits(publish.delivered)}
          />
          <KpiCard
            icon={AlertTriangleIcon}
            iconTint="bg-rose-100 text-rose-700"
            label="ناموفق"
            value={toPersianDigits(publish.failed)}
          />
          <KpiCard
            icon={BotIcon}
            iconTint="bg-violet-100 text-violet-700"
            label="بات‌های فعال"
            value={toPersianDigits(bots.active)}
            hint={`از ${toPersianDigits(bots.total)} بات`}
          />
          <KpiCard
            icon={BellIcon}
            iconTint="bg-amber-100 text-amber-700"
            label="اعلان‌های خوانده‌نشده"
            value={toPersianDigits(notifications.unread)}
            hint={`از ${toPersianDigits(notifications.total)} اعلان`}
          />
          <KpiCard
            icon={TicketIcon}
            iconTint="bg-sky-100 text-sky-700"
            label="تیکت‌های باز"
            value={toPersianDigits(tickets.byStatus.open ?? 0)}
            hint={`از ${toPersianDigits(tickets.total)} تیکت`}
          />
          <KpiCard
            icon={MegaphoneIcon}
            iconTint="bg-rose-100 text-rose-700"
            label="تبلیغ‌های تأییدشده"
            value={toPersianDigits(ads.approved)}
            hint={`از ${toPersianDigits(ads.total)} تبلیغ`}
          />
          <KpiCard
            icon={SparklesIcon}
            iconTint="bg-violet-100 text-violet-700"
            label="درخواست‌های هوش مصنوعی"
            value={toPersianDigits(aiJobs)}
          />
          <KpiCard
            icon={ShieldCheckIcon}
            iconTint="bg-teal-100 text-teal-700"
            label="رویدادهای ممیزی"
            value={toPersianDigits(audit)}
          />
        </div>
      </section>

      {/* ===== Section 2: weekly growth ===== */}
      <section>
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {growthUp ? (
                <TrendingUpIcon className="size-4 text-emerald-500" />
              ) : (
                <TrendingDownIcon className="size-4 text-rose-500" />
              )}
              <h2 className="text-sm font-semibold">رشد هفتگی انتشار سامانه</h2>
            </div>
            <Badge variant={growthUp ? "default" : "destructive"}>
              {growthUp ? "+" : ""}
              {toPersianDigits(growth.pct)}٪
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-[11px] text-muted-foreground">این هفته</div>
              <div className="mt-1 text-xl font-bold tabular-nums">
                {toPersianDigits(growth.thisWeek)}
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-emerald-500 transition-all motion-safe:duration-700"
                  style={{
                    width: `${Math.min(100, (growth.thisWeek / Math.max(1, Math.max(growth.thisWeek, growth.lastWeek))) * 100)}%`,
                  }}
                />
              </div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">هفتهٔ گذشته</div>
              <div className="mt-1 text-xl font-bold tabular-nums">
                {toPersianDigits(growth.lastWeek)}
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-muted-foreground/50 transition-all motion-safe:duration-700"
                  style={{
                    width: `${Math.min(100, (growth.lastWeek / Math.max(1, Math.max(growth.thisWeek, growth.lastWeek))) * 100)}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </Card>
      </section>

      {/* ===== Section 3: segregated breakdowns (تفکیک شده) ===== */}
      <section>
        <div className="mb-2 flex items-center gap-2">
          <UsersIcon className="size-4 text-primary" />
          <h2 className="text-sm font-semibold">تفکیک دقیق</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {/* Users by role */}
          <Card className="gap-3 p-4">
            <CardHeader className="pb-1">
              <CardTitle className="flex items-center gap-2 text-sm">
                <UserIcon className="size-4 text-primary" />
                کاربران بر اساس نقش
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-1">
              {Object.entries(users.byRole).length === 0 ? (
                <div className="text-xs text-muted-foreground">موردی ثبت نشده است.</div>
              ) : (
                Object.entries(users.byRole).map(([role, count]) => (
                  <BreakdownRow
                    key={role}
                    label={userRoleFa(role)}
                    count={count}
                    total={usersByRoleTotal}
                    tone="bg-teal-500"
                  />
                ))
              )}
            </CardContent>
          </Card>

          {/* Users by status */}
          <Card className="gap-3 p-4">
            <CardHeader className="pb-1">
              <CardTitle className="flex items-center gap-2 text-sm">
                <ActivityIcon className="size-4 text-primary" />
                کاربران بر اساس وضعیت
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-1">
              {Object.entries(users.byStatus).length === 0 ? (
                <div className="text-xs text-muted-foreground">موردی ثبت نشده است.</div>
              ) : (
                Object.entries(users.byStatus).map(([status, count]) => (
                  <BreakdownRow
                    key={status}
                    label={userStatusFa(status)}
                    count={count}
                    total={usersByStatusTotal}
                    tone={status === "active" ? "bg-emerald-500" : "bg-rose-500"}
                  />
                ))
              )}
            </CardContent>
          </Card>

          {/* Content by status */}
          <Card className="gap-3 p-4">
            <CardHeader className="pb-1">
              <CardTitle className="flex items-center gap-2 text-sm">
                <FileTextIcon className="size-4 text-primary" />
                محتوا بر اساس وضعیت
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-1">
              {Object.entries(content.byStatus).length === 0 ? (
                <div className="text-xs text-muted-foreground">موردی ثبت نشده است.</div>
              ) : (
                Object.entries(content.byStatus).map(([status, count]) => (
                  <BreakdownRow
                    key={status}
                    label={contentStatusFa(status)}
                    count={count}
                    total={contentByStatusTotal}
                    tone={
                      status === "delivered"
                        ? "bg-emerald-500"
                        : status === "failed" || status === "cancelled"
                          ? "bg-rose-500"
                          : "bg-sky-500"
                    }
                  />
                ))
              )}
            </CardContent>
          </Card>

          {/* Publish jobs by status */}
          <Card className="gap-3 p-4">
            <CardHeader className="pb-1">
              <CardTitle className="flex items-center gap-2 text-sm">
                <SendIcon className="size-4 text-primary" />
                انتشار بر اساس وضعیت
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-1">
              {Object.entries(publish.byStatus).length === 0 ? (
                <div className="text-xs text-muted-foreground">موردی ثبت نشده است.</div>
              ) : (
                Object.entries(publish.byStatus).map(([status, count]) => (
                  <BreakdownRow
                    key={status}
                    label={publishStatusFa(status)}
                    count={count}
                    total={publishByStatusTotal}
                    tone={
                      status === "delivered"
                        ? "bg-emerald-500"
                        : status === "failed" || status === "cancelled"
                          ? "bg-rose-500"
                          : "bg-amber-500"
                    }
                  />
                ))
              )}
            </CardContent>
          </Card>

          {/* Tickets by status */}
          <Card className="gap-3 p-4 md:col-span-2">
            <CardHeader className="pb-1">
              <CardTitle className="flex items-center gap-2 text-sm">
                <TicketIcon className="size-4 text-primary" />
                تیکت‌ها بر اساس وضعیت
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-1">
              {Object.entries(tickets.byStatus).length === 0 ? (
                <div className="text-xs text-muted-foreground">موردی ثبت نشده است.</div>
              ) : (
                <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                  {Object.entries(tickets.byStatus).map(([status, count]) => (
                    <BreakdownRow
                      key={status}
                      label={ticketStatusFa(status)}
                      count={count}
                      total={ticketsByStatusTotal}
                      tone={
                        status === "closed"
                          ? "bg-muted-foreground"
                          : status === "answered"
                            ? "bg-emerald-500"
                            : "bg-amber-500"
                      }
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ===== Section 4: top publishers ===== */}
      <section>
        <Card className="gap-3 p-4">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <TrendingUpIcon className="size-4 text-primary" />
              برترین ناشران
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topPublishers.length === 0 ? (
              <div className="flex h-24 flex-col items-center justify-center gap-1 text-center" dir="rtl">
                <UsersIcon className="size-6 text-muted-foreground" />
                <div className="text-xs text-muted-foreground">هنوز ناشری ثبت نشده است.</div>
              </div>
            ) : (
              <div className="max-h-96 overflow-y-auto scrollbar-thin">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12 text-right">ردیف</TableHead>
                      <TableHead className="text-right">نام</TableHead>
                      <TableHead className="text-right">ایمیل</TableHead>
                      <TableHead className="text-right">تعداد محتوا</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topPublishers.map((p, i) => (
                      <TableRow key={p.id}>
                        <TableCell className="tabular-nums">{toPersianDigits(i + 1)}</TableCell>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell dir="ltr" className="text-right text-xs text-muted-foreground">
                          {p.email ?? "—"}
                        </TableCell>
                        <TableCell className="tabular-nums font-bold">
                          {toPersianDigits(p.contentCount)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
