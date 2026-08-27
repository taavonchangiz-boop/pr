"use client";
// =====================================================================
// POSTYAR — Auto Responder View
// ---------------------------------------------------------------------
// Toggle enabled/disabled. Rules list (add/edit/delete): keyword +
// mode (static text vs AI) + response text. Fallback text. Daily limit.
// Loop guard seconds. Destination select (optional — only respond on
// this destination; null means "all destinations").
// Persists via PATCH /api/auto-responder.
//
// The view uses a derived-state pattern: `cfgQ.data` (server snapshot)
// + `drafts` (local overrides the user is editing). The effective config
// is computed with `useMemo`. This avoids the setState-in-effect anti-
// pattern.
// =====================================================================
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangleIcon,
  Loader2Icon,
  PlusIcon,
  RefreshCwIcon,
  SaveIcon,
  Trash2Icon,
  XIcon,
  ZapIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  api,
  type AutoResponderConfig,
  type AutoResponderRule,
  type DestinationRow,
} from "@/components/postyar/api";
import { toPersianDigits } from "@/lib/persian";

const DEFAULT_RULE: AutoResponderRule = {
  keywords: [],
  matchMode: "contains",
  responseMode: "static",
  staticResponse: "",
};

const MATCH_MODES: Array<{ key: "exact" | "contains" | "regex"; label: string }> = [
  { key: "contains", label: "شامل" },
  { key: "exact", label: "دقیقاً برابر" },
  { key: "regex", label: "عبارت منظم" },
];

const RESPONSE_MODES: Array<{ key: "static" | "ai"; label: string }> = [
  { key: "static", label: "متن ثابت" },
  { key: "ai", label: "هوش مصنوعی" },
];

// A "draft" overlay on top of the server snapshot. It captures every
// field the user has edited locally so the UI updates immediately
// without waiting for the server round-trip. On `patchMut` success,
// the draft is cleared and the new server snapshot takes over.
type Drafts = Partial<Omit<AutoResponderConfig, "id" | "usedToday">>;

export function AutoResponderView() {
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState<Drafts>({});
  const [deleteIdx, setDeleteIdx] = useState<number | null>(null);

  const cfgQ = useQuery({
    queryKey: ["auto-responder"],
    queryFn: () => api.getAutoResponder(),
    staleTime: 0,
  });

  const destQ = useQuery({
    queryKey: ["destinations"],
    queryFn: () => api.getDestinations(),
    staleTime: 30_000,
  });

  const config: AutoResponderConfig | null = useMemo(() => {
    if (!cfgQ.data) return null;
    return {
      ...cfgQ.data,
      ...drafts,
      // Rules: the draft wins if present, otherwise the server snapshot.
      rules: drafts.rules ?? cfgQ.data.rules,
    } as AutoResponderConfig;
  }, [cfgQ.data, drafts]);

  const patchMut = useMutation({
    mutationFn: (patch: Partial<Omit<AutoResponderConfig, "id" | "usedToday">>) =>
      api.updateAutoResponder(patch),
    onSuccess: (data) => {
      // The server returned the new snapshot. Clear the draft (we may have
      // already optimistically applied the change), then refresh.
      setDrafts({});
      qc.setQueryData(["auto-responder"], data);
      toast.success("تنظیمات پاسخگوی خودکار ذخیره شد.");
    },
    onError: (e: Error) => {
      toast.error(e.message ?? "ذخیره ناموفق بود.");
      // Roll back by clearing drafts — server snapshot will win on refetch.
      setDrafts({});
      qc.invalidateQueries({ queryKey: ["auto-responder"] });
    },
  });

  function update<K extends keyof Drafts>(key: K, value: Drafts[K]) {
    setDrafts((prev) => ({ ...prev, [key]: value }));
  }

  function updateRule(idx: number, patch: Partial<AutoResponderRule>) {
    if (!config) return;
    const base = config.rules;
    const next = base.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    update("rules", next);
  }

  function addRule() {
    if (!config) return;
    update("rules", [...config.rules, { ...DEFAULT_RULE }]);
    toast.info("قاعدهٔ جدید اضافه شد — کلیدواژه‌ها را وارد و ذخیره کنید.");
  }

  function commitRule(idx: number) {
    if (!config) return;
    patchMut.mutate({ rules: config.rules });
  }

  function deleteRule(idx: number) {
    if (!config) return;
    const next = config.rules.filter((_, i) => i !== idx);
    setDeleteIdx(null);
    patchMut.mutate({ rules: next });
  }

  if (cfgQ.isLoading) {
    return (
      <div className="flex flex-col gap-4" dir="rtl">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (cfgQ.error || !config) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-center" dir="rtl">
        <AlertTriangleIcon className="size-8 text-muted-foreground" />
        <div className="text-sm font-medium">بارگذاری پاسخگوی خودکار ناموفق بود.</div>
        <Button variant="outline" size="sm" onClick={() => cfgQ.refetch()}>
          تلاش مجدد
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <ZapIcon className="size-6" />
          پاسخگوی خودکار
        </h1>
        <p className="text-sm text-muted-foreground">
          پاسخ‌های پیش‌فرض به پیام‌های دریافتی را تنظیم کنید. ارسال فقط زمانی انجام می‌شود که پاسخگو فعال باشد.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>وضعیت کلی</CardTitle>
            <CardDescription>فعال یا غیرفعال کردن پاسخگوی خودکار.</CardDescription>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={config.enabled ? "default" : "secondary"}>
              {config.enabled ? "فعال" : "غیرفعال"}
            </Badge>
            <Switch
              checked={config.enabled}
              onCheckedChange={(v) => {
                update("enabled", v);
                patchMut.mutate({ enabled: v });
              }}
              disabled={patchMut.isPending}
            />
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>تنظیمات کلی</CardTitle>
          <CardDescription>مقصد (اختیاری)، متن پشتیبان، محدودیت روزانه و حفظ حلقه.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>مقصد (اختیاری)</Label>
            <Select
              value={config.destinationId ?? "__all__"}
              onValueChange={(v) => {
                const next = v === "__all__" ? null : v;
                update("destinationId", next);
                patchMut.mutate({ destinationId: next });
              }}
            >
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">همهٔ مقاصد</SelectItem>
                {destQ.data?.map((d: DestinationRow) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.label} ({d.provider})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">اگر انتخاب کنید، پاسخ فقط برای پیام‌های این مقصد داده می‌شود.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ar-fallback">متن پشتیبان</Label>
            <Textarea
              id="ar-fallback"
              value={config.fallbackFa}
              onChange={(e) => update("fallbackFa", e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="وقتی هیچ قاعده‌ای مطابقت نداشت..."
            />
            <Button
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() => patchMut.mutate({ fallbackFa: config.fallbackFa })}
              disabled={patchMut.isPending}
            >
              <SaveIcon className="size-4" />
              ذخیره متن پشتیبان
            </Button>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ar-daily">محدودیت روزانه</Label>
            <Input
              id="ar-daily"
              type="number"
              min={1}
              max={10000}
              value={config.dailyLimit}
              onChange={(e) => update("dailyLimit", Number(e.target.value) || 0)}
              onBlur={() => patchMut.mutate({ dailyLimit: config.dailyLimit })}
            />
            <p className="text-xs text-muted-foreground">امروز استفاده‌شده: {toPersianDigits(config.usedToday ?? 0)} پاسخ.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ar-loop">حفظ حلقه (ثانیه)</Label>
            <Input
              id="ar-loop"
              type="number"
              min={5}
              max={3600}
              value={config.loopGuardSeconds}
              onChange={(e) => update("loopGuardSeconds", Number(e.target.value) || 60)}
              onBlur={() => patchMut.mutate({ loopGuardSeconds: config.loopGuardSeconds })}
            />
            <p className="text-xs text-muted-foreground">حداقل فاصلهٔ میان دو پاسخ خودکار به یک فرستنده.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>قواعد پاسخ</CardTitle>
            <CardDescription>هر قاعده چند کلیدواژه و یک پاسخ دارد. کلیدواژه‌ها را با Enter اضافه کنید.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={addRule}>
            <PlusIcon className="size-4" />
            قاعدهٔ جدید
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {config.rules.length === 0 && (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              هنوز هیچ قاعده‌ای اضافه نشده است.
            </div>
          )}
          {config.rules.map((rule, idx) => (
            <RuleCard
              key={idx}
              rule={rule}
              onChange={(patch) => updateRule(idx, patch)}
              onSave={() => commitRule(idx)}
              onDelete={() => setDeleteIdx(idx)}
            />
          ))}
          {config.rules.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => patchMut.mutate({ rules: config.rules })} disabled={patchMut.isPending}>
              <SaveIcon className="size-4" />
              ذخیره همهٔ قواعد
            </Button>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={deleteIdx !== null} onOpenChange={(open) => { if (!open) setDeleteIdx(null); }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف قاعده؟</AlertDialogTitle>
            <AlertDialogDescription>
              این قاعده حذف می‌شود و دیگر به پیام‌های دریافتی پاسخ نمی‌دهد.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteIdx !== null && deleteRule(deleteIdx)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {patchMut.isPending && (
        <div className="fixed bottom-4 left-4 z-40 rounded-md border bg-card px-3 py-2 text-xs text-muted-foreground shadow-md">
          <Loader2Icon className="me-2 inline size-3 animate-spin" />
          در حال ذخیره...
        </div>
      )}
    </div>
  );
}

function RuleCard({
  rule,
  onChange,
  onSave,
  onDelete,
}: {
  rule: AutoResponderRule;
  onChange: (patch: Partial<AutoResponderRule>) => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const [pendingKeyword, setPendingKeyword] = useState("");

  function addKeyword() {
    const v = pendingKeyword.trim();
    if (!v) return;
    if ((rule.keywords ?? []).includes(v)) {
      setPendingKeyword("");
      return;
    }
    onChange({ keywords: [...(rule.keywords ?? []), v] });
    setPendingKeyword("");
  }

  function removeKeyword(k: string) {
    onChange({ keywords: (rule.keywords ?? []).filter((x) => x !== k) });
  }

  return (
    <div className="rounded-md border p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="lg:col-span-3 flex flex-col gap-1.5">
          <Label>کلیدواژه‌ها</Label>
          <div className="flex flex-wrap items-center gap-2 rounded-md border p-2">
            {(rule.keywords ?? []).map((k, i) => (
              <Badge key={`${k}-${i}`} variant="secondary" className="gap-1">
                {k}
                <button
                  type="button"
                  onClick={() => removeKeyword(k)}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={`حذف کلیدواژهٔ ${k}`}
                >
                  <XIcon className="size-3" />
                </button>
              </Badge>
            ))}
            <input
              type="text"
              value={pendingKeyword}
              onChange={(e) => setPendingKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addKeyword();
                }
              }}
              placeholder="افزودن کلیدواژه..."
              className="flex-1 bg-transparent text-sm outline-none"
              maxLength={200}
            />
          </div>
          <p className="text-xs text-muted-foreground">برای افزودن کلیدواژه Enter بزنید.</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>نوع مطابقت</Label>
          <Select
            value={rule.matchMode ?? "contains"}
            onValueChange={(v) => onChange({ matchMode: v as "exact" | "contains" | "regex" })}
          >
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MATCH_MODES.map((m) => (
                <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>نوع پاسخ</Label>
          <Select
            value={rule.responseMode ?? "static"}
            onValueChange={(v) => onChange({ responseMode: v as "static" | "ai" })}
          >
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {RESPONSE_MODES.map((m) => (
                <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end gap-2">
          <Button variant="outline" size="sm" onClick={onSave}>
            <SaveIcon className="size-4" />
            ذخیره
          </Button>
          <Button variant="ghost" size="sm" onClick={onDelete}>
            <Trash2Icon className="size-4" />
          </Button>
        </div>
        <div className="lg:col-span-3 flex flex-col gap-1.5">
          <Label>متن پاسخ {rule.responseMode === "ai" ? "(پشتیبان برای AI)" : ""}</Label>
          <Textarea
            value={rule.staticResponse ?? ""}
            onChange={(e) => onChange({ staticResponse: e.target.value })}
            rows={3}
            maxLength={2000}
            placeholder={rule.responseMode === "ai" ? "اگر هوش مصنوعی در دسترس نبود، این متن ارسال شود." : "متن پاسخ به کاربر..."}
          />
        </div>
        {rule.responseMode === "ai" && (
          <div className="lg:col-span-3 flex flex-col gap-1.5">
            <Label>پیمان هوش مصنوعی (اختیاری)</Label>
            <Textarea
              value={rule.aiPromptSuffix ?? ""}
              onChange={(e) => onChange({ aiPromptSuffix: e.target.value })}
              rows={2}
              maxLength={1000}
              placeholder="مثلاً: پاسخ را کوتاه و رسمی بده."
            />
          </div>
        )}
      </div>
      <Separator className="my-3" />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>کلیدواژه‌های ذخیره‌شده: {toPersianDigits((rule.keywords ?? []).length)}</span>
        <Button variant="ghost" size="sm" onClick={onSave}>
          <RefreshCwIcon className="size-3" />
          اعزام مجدد
        </Button>
      </div>
    </div>
  );
}

export default AutoResponderView;
