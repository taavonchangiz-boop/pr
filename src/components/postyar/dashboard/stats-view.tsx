"use client";
// POSTYAR — user analytics dashboard view ("آمار").
// Consumes GET /api/stats/me — renders usage counter cards, summary KPIs,
// weekly growth, per-channel + per-post tables, and top-clicked glass
// buttons. All Persian + RTL + Vazirmatn; lucide icons only (no emoji).
import { useEffect, useState } from "react";
import {
  ActivityIcon,
  BarChart3Icon,
  BellIcon,
  CalendarClockIcon,
  EyeIcon,
  FileTextIcon,
  HandIcon,
  LayoutGridIcon,
  ListChecksIcon,
  MousePointerClickIcon,
  PackageIcon,
  RefreshCwIcon,
  SendIcon,
  ShieldCheckIcon,
  SparklesIcon,
  TrendingDownIcon,
  TrendingUpIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
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

// ---------- API types (mirrors /api/stats/me response) ----------
type Summary = {
  totalContents: number;
  totalDestinations: number;
  totalPublishes: number;
  deliveredCount: number;
  failedCount: number;
  deliveryRate: number;
  totalViews: number;
  totalClicks: number;
  totalButtons: number;
};
type Growth = { thisWeek: number; lastWeek: number; pct: number };
type ChannelRow = {
  id: string;
  label: string;
  provider: string;
  views: number;
  clicks: number;
  publishes: number;
  delivered: number;
  failed: number;
};
type PostRow = {
  id: string;
  title: string;
  views: number;
  status: string;
  publishes: number;
  delivered: number;
};
type TopButton = { id: string; label: string; clicks: number };
type Usage = {
  planName: string | null;
  intervalMonths: number | null;
  remainingDays: number | null;
  publishUsed: number;
  publishQuota: number | null;
  aiUsed: number;
  aiQuota: number | null;
  channelsUsed: number;
  channelsQuota: number | null;
  endsAt: string | null;
};
type StatsResponse = {
  summary: Summary;
  growth: Growth;
  channels: ChannelRow[];
  posts: PostRow[];
  topButtons: TopButton[];
  usage: Usage;
};

// ---------- Status badge mapping (Persian labels) ----------
function statusFa(status: string): { label: string; tone: "default" | "secondary" | "destructive" | "outline" } {
  switch (status) {
    case "delivered":
      return { label: "تحویل‌شده", tone: "default" };
    case "failed":
      return { label: "ناموفق", tone: "destructive" };
    case "queued":
      return { label: "در صف", tone: "secondary" };
    case "scheduled":
      return { label: "زمان‌بندی‌شده", tone: "secondary" };
    case "processing":
      return { label: "در حال پردازش", tone: "secondary" };
    case "draft":
      return { label: "پیش‌نویس", tone: "outline" };
    case "cancelled":
      return { label: "لغو‌شده", tone: "destructive" };
    default:
      return { label: status, tone: "outline" };
  }
}

function providerFa(provider: string): string {
  switch (provider) {
    case "telegram":
      return "تلگرام";
    case "bale":
      return "بله";
    case "eitaa":
      return "ایتا";
    case "rubika":
      return "روبیکا";
    case "whatsapp":
      return "واتساپ";
    case "sms":
      return "پیامک";
    default:
      return provider || "—";
  }
}

// ---------- Loading skeleton ----------
function StatsSkeleton() {
  return (
    <div className="flex flex-col gap-4" dir="rtl">
      <Skeleton className="h-8 w-40" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

// ---------- Error state ----------
function StatsError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center" dir="rtl">
      <ShieldCheckIcon className="size-10 text-destructive" />
      <div className="text-sm font-medium">خطا در بارگذاری آمار.</div>
      <div className="max-w-md text-xs text-muted-foreground">
        امکان دریافت آمار از سامانه نبود. لطفاً اتصال خود را بررسی کرده و دوباره تلاش کنید.
      </div>
      <Button variant="outline" size="sm" onClick={onRetry} className="gap-1.5 cursor-pointer">
        <RefreshCwIcon className="size-4" />
        تلاش دوباره
      </Button>
    </div>
  );
}

// ---------- Empty state ----------
function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex h-32 flex-col items-center justify-center gap-1 text-center" dir="rtl">
      <BarChart3Icon className="size-6 text-muted-foreground" />
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

// ---------- Usage counter card (with Progress) ----------
function UsageCard({
  icon: Icon,
  iconTint,
  label,
  bigValue,
  subValue,
  progress,
  footer,
  footerAction,
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconTint: string;
  label: string;
  bigValue: string;
  subValue?: string;
  progress?: number;
  footer?: string;
  footerAction?: () => void;
}) {
  return (
    <Card className="gap-3 p-4">
      <div className="flex items-start justify-between">
        <div className={cn("rounded-md p-2", iconTint)}>
          <Icon className="size-4" />
        </div>
        <span className="text-[11px] text-muted-foreground">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold tabular-nums">{bigValue}</span>
        {subValue && <span className="text-xs text-muted-foreground">{subValue}</span>}
      </div>
      {progress !== undefined && (
        <Progress value={progress} className="h-1.5" />
      )}
      {footer && (
        <div className="text-[11px] text-muted-foreground">
          {footerAction ? (
            <button
              type="button"
              onClick={footerAction}
              className="text-primary underline-offset-2 hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {footer}
            </button>
          ) : (
            footer
          )}
        </div>
      )}
    </Card>
  );
}

// ---------- Summary KPI card ----------
function StatCard({
  icon: Icon,
  iconTint,
  label,
  value,
  suffix,
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconTint: string;
  label: string;
  value: string;
  suffix?: string;
}) {
  return (
    <Card className="gap-2 p-4">
      <div className={cn("w-fit rounded-md p-1.5", iconTint)}>
        <Icon className="size-4" />
      </div>
      <div className="text-2xl font-bold tabular-nums">
        {value}
        {suffix && <span className="mr-1 text-xs font-normal text-muted-foreground">{suffix}</span>}
      </div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </Card>
  );
}

// ---------- Main component ----------
export default function StatsView({ navigate }: { navigate: (to: string) => void }) {
  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    fetch("/api/stats/me", { credentials: "same-origin" })
      .then((r) => {
        if (!r.ok) {
          if (r.status === 401) throw new Error("نیاز به ورود");
          throw new Error("خطا در دریافت آمار");
        }
        return r.json() as Promise<StatsResponse>;
      })
      .then((d) => setData(d))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "خطای ناشناخته"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) return <StatsSkeleton />;
  if (error || !data)
    return <StatsError onRetry={load} />;

  const { summary, growth, channels, posts, topButtons, usage } = data;
  const growthUp = growth.pct >= 0;

  const hasActivePlan = Boolean(usage.endsAt) || (usage.remainingDays ?? 0) > 0;
  const publishRemaining = usage.publishQuota !== null ? Math.max(0, usage.publishQuota - usage.publishUsed) : null;
  const aiRemaining = usage.aiQuota !== null ? Math.max(0, usage.aiQuota - usage.aiUsed) : null;
  const channelsRemaining = usage.channelsQuota !== null ? Math.max(0, usage.channelsQuota - usage.channelsUsed) : null;

  const publishProgress = usage.publishQuota ? Math.min(100, (usage.publishUsed / usage.publishQuota) * 100) : 0;
  const aiProgress = usage.aiQuota ? Math.min(100, (usage.aiUsed / usage.aiQuota) * 100) : 0;
  const channelsProgress = usage.channelsQuota ? Math.min(100, (usage.channelsUsed / usage.channelsQuota) * 100) : 0;

  return (
    <div className="flex flex-col gap-6" dir="rtl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">آمار کارکرد</h1>
        <p className="text-sm text-muted-foreground">
          نمایی کامل از مصرف پلن، رشد هفتگی، عملکرد کانال‌ها و پست‌های شما.
        </p>
      </div>

      {/* ===== Section 1: usage counters (شمارش مصرف کارکرد) ===== */}
      <section>
        <div className="mb-2 flex items-center gap-2">
          <ListChecksIcon className="size-4 text-primary" />
          <h2 className="text-sm font-semibold">شمارش مصرف کارکرد</h2>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {/* Remaining days */}
          {hasActivePlan ? (
            <UsageCard
              icon={CalendarClockIcon}
              iconTint="bg-amber-100 text-amber-700"
              label="روزهای باقی‌مانده"
              bigValue={toPersianDigits(usage.remainingDays ?? 0)}
              subValue="روز"
              footer={usage.planName ? `پلن: ${usage.planName}` : undefined}
            />
          ) : (
            <Card className="flex flex-col items-start justify-between gap-3 p-4">
              <div className="flex items-start justify-between self-stretch">
                <div className="rounded-md bg-amber-100 p-2 text-amber-700">
                  <CalendarClockIcon className="size-4" />
                </div>
                <span className="text-[11px] text-muted-foreground">روزهای باقی‌مانده</span>
              </div>
              <div className="text-sm font-medium text-muted-foreground">بدون پلن فعال</div>
              <Button
                variant="default"
                size="sm"
                onClick={() => navigate("/dashboard/plans")}
                className="cursor-pointer"
              >
                خرید پلن
              </Button>
            </Card>
          )}
          {/* Remaining posts */}
          <UsageCard
            icon={SendIcon}
            iconTint="bg-teal-100 text-teal-700"
            label="پست‌های باقی‌مانده"
            bigValue={
              publishRemaining === null
                ? "نامحدود"
                : toPersianDigits(publishRemaining)
            }
            subValue={
              usage.publishQuota
                ? `${toPersianDigits(usage.publishUsed)} / ${toPersianDigits(usage.publishQuota)}`
                : undefined
            }
            progress={usage.publishQuota ? publishProgress : undefined}
            footer={usage.publishQuota ? `${toPersianDigits(Math.round(publishProgress))}٪ مصرف‌شده` : "بدون سقف"}
          />
          {/* Remaining AI */}
          <UsageCard
            icon={SparklesIcon}
            iconTint="bg-violet-100 text-violet-700"
            label="هوش مصنوعی باقی‌مانده"
            bigValue={
              aiRemaining === null
                ? "نامحدود"
                : toPersianDigits(aiRemaining)
            }
            subValue={
              usage.aiQuota
                ? `${toPersianDigits(usage.aiUsed)} / ${toPersianDigits(usage.aiQuota)}`
                : undefined
            }
            progress={usage.aiQuota ? aiProgress : undefined}
            footer={usage.aiQuota ? `${toPersianDigits(Math.round(aiProgress))}٪ مصرف‌شده` : "بدون سقف"}
          />
          {/* Remaining channels */}
          <UsageCard
            icon={LayoutGridIcon}
            iconTint="bg-sky-100 text-sky-700"
            label="کانال‌های باقی‌مانده"
            bigValue={
              channelsRemaining === null
                ? "نامحدود"
                : toPersianDigits(channelsRemaining)
            }
            subValue={
              usage.channelsQuota
                ? `${toPersianDigits(usage.channelsUsed)} / ${toPersianDigits(usage.channelsQuota)}`
                : undefined
            }
            progress={usage.channelsQuota ? channelsProgress : undefined}
            footer={usage.channelsQuota ? `${toPersianDigits(Math.round(channelsProgress))}٪ مصرف‌شده` : "بدون سقف"}
          />
        </div>
      </section>

      {/* ===== Section 2: summary KPI grid ===== */}
      <section>
        <div className="mb-2 flex items-center gap-2">
          <BarChart3Icon className="size-4 text-primary" />
          <h2 className="text-sm font-semibold">خلاصهٔ کلی</h2>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard
            icon={FileTextIcon}
            iconTint="bg-teal-100 text-teal-700"
            label="محتوای شما"
            value={toPersianDigits(summary.totalContents)}
          />
          <StatCard
            icon={LayoutGridIcon}
            iconTint="bg-sky-100 text-sky-700"
            label="کانال‌ها / مقاصد"
            value={toPersianDigits(summary.totalDestinations)}
          />
          <StatCard
            icon={SendIcon}
            iconTint="bg-emerald-100 text-emerald-700"
            label="انتشار کل"
            value={toPersianDigits(summary.totalPublishes)}
          />
          <StatCard
            icon={ActivityIcon}
            iconTint="bg-amber-100 text-amber-700"
            label="نرخ تحویل"
            value={toPersianDigits(summary.deliveryRate)}
            suffix="٪"
          />
          <StatCard
            icon={EyeIcon}
            iconTint="bg-violet-100 text-violet-700"
            label="بازدید کل"
            value={toPersianDigits(summary.totalViews)}
          />
          <StatCard
            icon={MousePointerClickIcon}
            iconTint="bg-rose-100 text-rose-700"
            label="کلیک کل"
            value={toPersianDigits(summary.totalClicks)}
          />
          <StatCard
            icon={HandIcon}
            iconTint="bg-cyan-100 text-cyan-700"
            label="دکمه‌های شیشه‌ای"
            value={toPersianDigits(summary.totalButtons)}
          />
        </div>
      </section>

      {/* ===== Section 3: weekly growth ===== */}
      <section>
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {growthUp ? (
                <TrendingUpIcon className="size-4 text-emerald-500" />
              ) : (
                <TrendingDownIcon className="size-4 text-rose-500" />
              )}
              <h2 className="text-sm font-semibold">رشد هفتگی انتشار</h2>
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
                  style={{ width: `${Math.min(100, (growth.thisWeek / Math.max(1, Math.max(growth.thisWeek, growth.lastWeek))) * 100)}%` }}
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
                  style={{ width: `${Math.min(100, (growth.lastWeek / Math.max(1, Math.max(growth.thisWeek, growth.lastWeek))) * 100)}%` }}
                />
              </div>
            </div>
          </div>
        </Card>
      </section>

      {/* ===== Section 4: per-channel table ===== */}
      <section>
        <Card className="gap-3 p-4">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <SendIcon className="size-4 text-primary" />
              آمار کانال‌ها
            </CardTitle>
          </CardHeader>
          <CardContent>
            {channels.length === 0 ? (
              <EmptyState label="هنوز کانالی تعریف نکرده‌اید." />
            ) : (
              <div className="max-h-96 overflow-y-auto scrollbar-thin">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">کانال</TableHead>
                      <TableHead className="text-right">بازدید</TableHead>
                      <TableHead className="text-right">کلیک</TableHead>
                      <TableHead className="text-right">انتشار</TableHead>
                      <TableHead className="text-right">تحویل‌شده</TableHead>
                      <TableHead className="text-right">ناموفق</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {channels.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <span className="font-medium">{c.label || "—"}</span>
                            <Badge variant="outline" className="w-fit">
                              {providerFa(c.provider)}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="tabular-nums">{toPersianDigits(c.views)}</TableCell>
                        <TableCell className="tabular-nums">{toPersianDigits(c.clicks)}</TableCell>
                        <TableCell className="tabular-nums">{toPersianDigits(c.publishes)}</TableCell>
                        <TableCell className="tabular-nums text-emerald-600">{toPersianDigits(c.delivered)}</TableCell>
                        <TableCell className="tabular-nums text-rose-600">{toPersianDigits(c.failed)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ===== Section 5: per-post table ===== */}
      <section>
        <Card className="gap-3 p-4">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <FileTextIcon className="size-4 text-primary" />
              آمار پست‌ها
            </CardTitle>
          </CardHeader>
          <CardContent>
            {posts.length === 0 ? (
              <EmptyState label="هنوز پستی منتشر نکرده‌اید." />
            ) : (
              <div className="max-h-96 overflow-y-auto scrollbar-thin">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">عنوان</TableHead>
                      <TableHead className="text-right">بازدید</TableHead>
                      <TableHead className="text-right">انتشار</TableHead>
                      <TableHead className="text-right">تحویل‌شده</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {posts.map((p) => {
                      const st = statusFa(p.status);
                      return (
                        <TableRow key={p.id}>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <span className="font-medium line-clamp-1 max-w-xs">
                                {p.title || "بدون عنوان"}
                              </span>
                              <Badge variant={st.tone}>{st.label}</Badge>
                            </div>
                          </TableCell>
                          <TableCell className="tabular-nums">{toPersianDigits(p.views)}</TableCell>
                          <TableCell className="tabular-nums">{toPersianDigits(p.publishes)}</TableCell>
                          <TableCell className="tabular-nums text-emerald-600">
                            {toPersianDigits(p.delivered)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ===== Section 6: top buttons ===== */}
      <section>
        <Card className="gap-3 p-4">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <MousePointerClickIcon className="size-4 text-primary" />
              پُرکلیک‌ترین دکمه‌ها
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topButtons.length === 0 ? (
              <EmptyState label="هنوز کلیکی روی دکمه‌ها ثبت نشده است." />
            ) : (
              <ul className="flex flex-col gap-2">
                {topButtons.map((b, i) => (
                  <li
                    key={b.id}
                    className="flex items-center justify-between gap-3 rounded-md border p-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex size-6 items-center justify-center rounded-full bg-muted text-[11px] font-bold tabular-nums">
                        {toPersianDigits(i + 1)}
                      </span>
                      <span className="text-sm font-medium">{b.label || "—"}</span>
                    </div>
                    <Badge variant="secondary" className="tabular-nums">
                      <BellIcon className="size-3" />
                      {toPersianDigits(b.clicks)} کلیک
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ===== Section 7: navigation CTA ===== */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/30 p-4" dir="rtl">
          <div className="flex items-center gap-2">
            <PackageIcon className="size-4 text-primary" />
            <div className="text-sm">
              <span className="font-medium">پلن فعلی: </span>
              <span className="text-muted-foreground">
                {usage.planName ?? "بدون پلن فعال"}
              </span>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/dashboard/plans")}
            className="cursor-pointer"
          >
            مدیریت پلن
          </Button>
        </div>
      </section>
    </div>
  );
}
