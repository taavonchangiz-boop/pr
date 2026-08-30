"use client";
// =====================================================================
// POSTYAR — Admin Gold Bots View + Gold Price Config (ITEM 28)
// ---------------------------------------------------------------------
// Two-section layout:
//
//  (A) پیکربندی منبع طلا — Card with:
//       * source radio (free_talaapi / free_tgju / free_bonmarket /
//         custom_json / custom_token)
//       * endpoint URL (for custom_*)
//       * token (for custom_token, password-type, masked preview)
//       * selector fields (18k, emami, bahar_azadi, ounce) — optional
//       * refreshMinutes
//       * active switch
//       * «نوسازی اکنون» button → POST /api/admin/gold/refresh
//       * last-fetched prices table (rendered from the refresh
//         response; refetches the latest GoldPrice rows on success)
//
//  (B) بات‌های طلای سامانه — Table of all gold bots across users
//      (owner, instrument, direction, thresholdPct, enabled,
//      lastFiredAt Jalali). PRESERVED from the previous version.
//
// All actions admin-only — the route enforces `requireRole(["admin"])`.
// =====================================================================
// NOTE (ITEM 35): این بخش فقط برای مدیر سامانه قابل مشاهده است.
// The routes /api/admin/gold + /api/admin/gold/config +
// /api/admin/gold/refresh all enforce `requireRole(["admin"])`. The
// dashboard renders this view only for admins.
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertCircleIcon,
  BanknoteIcon,
  Loader2Icon,
  RefreshCwIcon,
  SaveIcon,
  Settings2Icon,
  TrendingUpIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";
import { api, type AdminGoldBotRow, type AdminGoldConfigRow, type AdminGoldConfigInput, type GoldSource } from "@/components/postyar/api";
import { AdminGate } from "@/components/postyar/admin/gate";
import { toPersianDigits } from "@/lib/persian";
import { cn } from "@/lib/utils";

const SOURCE_OPTIONS: { value: GoldSource; labelFa: string; hintFa: string }[] = [
  { value: "free_talaapi", labelFa: "پلتفرم رایگان تلاapi", hintFa: "منبع عمومی تلاapi (بدون توکن)" },
  { value: "free_tgju", labelFa: "پلتفرم رایگان طلاوجو", hintFa: "منبع عمومی طلاوجو (بدون توکن)" },
  { value: "free_bonmarket", labelFa: "پلتفرم رایگان بن‌مارکت", hintFa: "منبع عمومی بن‌مارکت (بدون توکن)" },
  { value: "custom_json", labelFa: "منبع دلخواه JSON", hintFa: "یک نشانی JSON دلخواه (بدون احراز هویت)" },
  { value: "custom_token", labelFa: "توکن اختصاصی", hintFa: "نشانی دلخواه + توکن Bearer (محرمانه)" },
];

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
  const botsQ = useQuery({
    queryKey: ["admin", "gold"],
    queryFn: () => api.getAdminGoldTyped(),
    staleTime: 30_000,
  });

  const items = botsQ.data?.items ?? [];

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <TrendingUpIcon className="size-6" />
          طلای سامانه
        </h1>
        <p className="text-sm text-muted-foreground">
          پیکربندی منبع قیمت طلا و پایش بات‌های طلای فعال کاربران.
        </p>
      </div>

      <GoldConfigCard />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex flex-wrap items-center gap-3">
            <span>بات‌های طلای کاربران ({toPersianDigits(items.length)})</span>
            {botsQ.isFetching && <Loader2Icon className="size-4 animate-spin" />}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {botsQ.isLoading && (
            <div className="flex flex-col gap-2 p-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          )}
          {items.length === 0 && !botsQ.isLoading && (
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

// ---------------------------------------------------------------------
// (A) Gold config card — source radio + endpoint + token + selectors
// + refreshMinutes + active + «نوسازی اکنون» + last-fetched prices.
// ---------------------------------------------------------------------
function GoldConfigCard() {
  const qc = useQueryClient();
  const cfgQ = useQuery({
    queryKey: ["admin", "gold", "config"],
    queryFn: () => api.getAdminGoldConfig(),
    staleTime: 60_000,
  });

  // Local form state. Seeded from the GET response; re-seeds when the
  // server value changes (e.g. after a save).
  const [source, setSource] = useState<GoldSource>("free_talaapi");
  const [endpoint, setEndpoint] = useState("");
  const [token, setToken] = useState("");
  const [sel18k, setSel18k] = useState("");
  const [selEmami, setSelEmami] = useState("");
  const [selBahar, setSelBahar] = useState("");
  const [selOunce, setSelOunce] = useState("");
  const [refreshMinutes, setRefreshMinutes] = useState(5);
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!cfgQ.data) return;
    setSource((cfgQ.data.source as GoldSource) ?? "free_talaapi");
    setEndpoint(cfgQ.data.endpoint ?? "");
    setToken("");
    setSel18k(cfgQ.data.selector18k ?? "");
    setSelEmami(cfgQ.data.selectorEmami ?? "");
    setSelBahar(cfgQ.data.selectorBahar ?? "");
    setSelOunce(cfgQ.data.selectorOunce ?? "");
    setRefreshMinutes(cfgQ.data.refreshMinutes ?? 5);
    setActive(cfgQ.data.active ?? true);
  }, [cfgQ.data]);

  const saveMut = useMutation({
    mutationFn: () => {
      const body: AdminGoldConfigInput = {
        source,
        endpoint: endpoint.trim() || null,
        selector18k: sel18k.trim() || null,
        selectorEmami: selEmami.trim() || null,
        selectorBahar: selBahar.trim() || null,
        selectorOunce: selOunce.trim() || null,
        refreshMinutes,
        active,
      };
      // Only send token when the admin typed something new (so an empty
      // token means "leave the existing token untouched").
      if (token) body.token = token;
      return api.adminUpdateGoldConfig(body);
    },
    onSuccess: () => {
      toast.success("پیکربندی طلا ذخیره شد.");
      setToken("");
      qc.invalidateQueries({ queryKey: ["admin", "gold", "config"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "ذخیره پیکربندی ناموفق بود."),
  });

  const refreshMut = useMutation({
    mutationFn: () => api.adminRefreshGoldPrices(),
    onSuccess: (data) => {
      const okCount = data.prices.filter((p) => p.priceRials !== null).length;
      if (data.ok && okCount > 0) {
        toast.success(`نوسازی موفق بود — ${toPersianDigits(okCount)} قیمت به‌روز شد.`);
      } else if (data.errorFa) {
        toast.error(data.errorFa);
      } else {
        toast.error("نوسازی ناموفق بود — پاسخ ارائه‌دهنده قابل تجزیه نبود.");
      }
      qc.invalidateQueries({ queryKey: ["admin", "gold", "config"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "نوسازی ناموفق بود."),
  });

  const needsEndpoint = source === "custom_json" || source === "custom_token";
  const needsToken = source === "custom_token";
  const canSave = !needsEndpoint || endpoint.trim().length > 0;
  const canRefresh = !!cfgQ.data && cfgQ.data.source !== undefined;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Settings2Icon className="size-4 text-primary" />
          پیکربندی منبع قیمت طلا
        </CardTitle>
        <CardDescription className="text-xs">
          منبع داده طلا را پیکربندی کنید. منبع‌های رایگان بدون احراز هویت کار می‌کنند؛ برای منبع دلخواه، نشانی endpoint (و برای توکن اختصاصی، توکن Bearer) را وارد کنید.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {cfgQ.isLoading && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}
        {cfgQ.error && (
          <div className="flex items-center gap-2 text-sm text-destructive" dir="rtl">
            <AlertCircleIcon className="size-4" />
            بارگذاری پیکربندی ناموفق بود.
          </div>
        )}

        {!cfgQ.isLoading && (
          <>
            {/* Source radio */}
            <div className="flex flex-col gap-2">
              <Label className="text-xs text-muted-foreground">منبع داده</Label>
              <RadioGroup
                value={source}
                onValueChange={(v) => setSource(v as GoldSource)}
                className="grid grid-cols-1 gap-2 sm:grid-cols-2"
              >
                {SOURCE_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    htmlFor={`gold-src-${opt.value}`}
                    className={cn(
                      "flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm transition-colors",
                      source === opt.value ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                    )}
                    dir="rtl"
                  >
                    <RadioGroupItem value={opt.value} id={`gold-src-${opt.value}`} className="mt-1" />
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium">{opt.labelFa}</span>
                      <span className="text-[10px] text-muted-foreground">{opt.hintFa}</span>
                    </div>
                  </label>
                ))}
              </RadioGroup>
            </div>

            {/* Endpoint */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gold-endpoint" className="text-xs text-muted-foreground">
                نشانی endpoint {needsEndpoint && <span className="text-destructive">*</span>}
              </Label>
              <Input
                id="gold-endpoint"
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                dir="ltr"
                placeholder={needsEndpoint ? "https://..." : "اختیاری — برای منابع رایگان پیش‌فرض استفاده می‌شود"}
                className="cursor-text focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              />
              <p className="text-[10px] text-muted-foreground">
                نشانی JSON که قیمت‌های طلا را برمی‌گرداند. برای منابع رایگان، در صورت خالی بودن از نشانی پیش‌فرض استفاده می‌شود.
              </p>
            </div>

            {/* Token (only for custom_token) */}
            {needsToken && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="gold-token" className="text-xs text-muted-foreground">
                  توکن Bearer
                </Label>
                <Input
                  id="gold-token"
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  dir="ltr"
                  autoComplete="off"
                  placeholder={cfgQ.data?.token ? `ذخیره‌شده: ${cfgQ.data.token} — تایپ کنید برای جایگزینی` : "توکن Bearer برای هدر Authorization"}
                  className="cursor-text focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                />
                <p className="text-[10px] text-muted-foreground">
                  توکن با AES-256-GCM رمزگذاری می‌شود و هرگز به‌صورت متن آشکار ذخیره نمی‌گردد.
                </p>
              </div>
            )}

            {/* Selectors (advanced — optional) */}
            <details className="rounded-md border bg-muted/20 p-3">
              <summary className="cursor-pointer text-xs font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                انتخابگرها (پیشرفته — اختیاری)
              </summary>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {[
                  { id: "sel-18k", label: "انتخابگر طلای ۱۸ عیار", val: sel18k, set: setSel18k },
                  { id: "sel-emami", label: "انتخابگر سکه امامی", val: selEmami, set: setSelEmami },
                  { id: "sel-bahar", label: "انتخابگر سکه بهار آزادی", val: selBahar, set: setSelBahar },
                  { id: "sel-ounce", label: "انتخابگر انس طلا", val: selOunce, set: setSelOunce },
                ].map((f) => (
                  <div key={f.id} className="flex flex-col gap-1">
                    <Label htmlFor={f.id} className="text-[10px] text-muted-foreground">{f.label}</Label>
                    <Input
                      id={f.id}
                      value={f.val}
                      onChange={(e) => f.set(e.target.value)}
                      dir="ltr"
                      placeholder="مثلاً data.18k یا items[0].price"
                      className="cursor-text focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none text-xs font-mono"
                    />
                  </div>
                ))}
                <p className="text-[10px] text-muted-foreground sm:col-span-2">
                  در حالت پیش‌فرض، تشخیص خودکار ساختار JSON استفاده می‌شود. اگر پاسخ ارائه‌دهنده ساختار غیراستانداردی داشت، این انتخابگرها را برای استخراج دقیق‌تر تنظیم کنید.
                </p>
              </div>
            </details>

            {/* refreshMinutes + active */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="gold-refresh" className="text-xs text-muted-foreground">
                  بازهٔ نوسازی خودکار (دقیقه)
                </Label>
                <Input
                  id="gold-refresh"
                  type="number"
                  min={1}
                  max={1440}
                  value={refreshMinutes}
                  onChange={(e) => setRefreshMinutes(Math.max(1, Number(e.target.value) || 5))}
                  dir="ltr"
                  className="cursor-text focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                />
                <p className="text-[10px] text-muted-foreground">بازهٔ نوسازی خودکار در کارگر پس‌زمینه. بین ۱ تا ۱۴۴۰ دقیقه.</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">فعال بودن منبع</Label>
                <label className="flex cursor-pointer items-center gap-2 text-sm" htmlFor="gold-active">
                  <Switch
                    id="gold-active"
                    checked={active}
                    onCheckedChange={setActive}
                    className="cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  />
                  <span>{active ? "فعال" : "غیرفعال"}</span>
                </label>
                <p className="text-[10px] text-muted-foreground">در صورت غیرفعال بودن، نوسازی خودکار متوقف می‌شود.</p>
              </div>
            </div>

            {/* Last saved */}
            {cfgQ.data?.updatedAtFa && (
              <div className="text-[11px] text-muted-foreground">
                آخرین ذخیره: <span className="tabular-nums">{cfgQ.data.updatedAtFa}</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
              <Button
                variant="outline"
                onClick={() => refreshMut.mutate()}
                disabled={!canRefresh || refreshMut.isPending}
                className="gap-1.5 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {refreshMut.isPending ? <Loader2Icon className="size-4 animate-spin" /> : <RefreshCwIcon className="size-4" />}
                نوسازی اکنون
              </Button>
              <Button
                onClick={() => saveMut.mutate()}
                disabled={!canSave || saveMut.isPending}
                className="gap-1.5 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {saveMut.isPending ? <Loader2Icon className="size-4 animate-spin" /> : <SaveIcon className="size-4" />}
                ذخیرهٔ پیکربندی
              </Button>
            </div>

            {/* Last-fetched prices */}
            {refreshMut.data && refreshMut.data.prices.length > 0 && (
              <div className="rounded-md border bg-card/40 p-3">
                <div className="mb-2 flex items-center gap-2 text-xs font-medium">
                  <BanknoteIcon className="size-4 text-primary" />
                  آخرین قیمت‌های نوسازی‌شده
                  <Badge variant="outline" className="text-[10px] tabular-nums">
                    {refreshMut.data.fetchedAtFa}
                  </Badge>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">نوع طلا</TableHead>
                      <TableHead className="text-xs">قیمت</TableHead>
                      <TableHead className="text-xs">وضعیت</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {refreshMut.data.prices.map((p) => (
                      <TableRow key={p.instrument}>
                        <TableCell className="text-xs font-medium">{p.instrumentFa}</TableCell>
                        <TableCell dir="ltr" className="text-xs tabular-nums font-mono">
                          {p.priceRialsFa ?? "—"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {p.priceRials !== null ? (
                            <Badge variant="default">موفق</Badge>
                          ) : (
                            <Badge variant="destructive">ناموفق</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {refreshMut.data.errorFa && (
                  <p className="mt-2 text-[11px] text-destructive">{refreshMut.data.errorFa}</p>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
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
