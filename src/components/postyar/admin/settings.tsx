"use client";
// =====================================================================
// POSTYAR — Admin Settings View (ITEMS 19b, 20, 21, 39, 40)
// ---------------------------------------------------------------------
// Grouped, Persian-labeled settings with provider-aware dropdowns:
//   1. تنظیمات عمومی          (general)
//   2. پنل پیامکی              (sms_panel)      ← provider dropdown
//   3. پنل ایمیل               (email_panel)
//   4. درگاه بانکی            (bank_gateway)   ← provider dropdown
//   5. پیکربندی طلا           (gold_config)
//   6. پیکربندی هوش مصنوعی    (ai_config)
//   7. امنیت و محدودیت        (security)
//
// ITEM 19b — bank_gateway is a single <Select> with options: direct /
// zibal / zarinpal / nextpay / idpay / saman. Selecting one shows ONLY
// the credential fields relevant to that gateway.
// ITEM 21  — sms_panel is a single <Select> with options: melipayamak
// / kavenegar / farapayamak / smsir / nikpayamak / disabled. Selecting
// one shows ONLY the credential fields relevant to that SMS panel.
// ITEM 20  — every section card has its own «ذخیرهٔ تنظیمات <group>»
// button at the bottom; the page header has a sticky global
// «ذخیرهٔ همهٔ تنظیمات» button that bulk-saves ALL dirty drafts at once.
//
// NOTE (ITEM 35): این بخش فقط برای مدیر سامانه قابل مشاهده است.
// The route /api/admin/settings enforces `requireRole(["admin"])`.
// =====================================================================
import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertCircleIcon,
  BanknoteIcon,
  GlobeIcon,
  KeyRoundIcon,
  Loader2Icon,
  MailIcon,
  MessageSquareIcon,
  RotateCcwIcon,
  SaveAllIcon,
  SaveIcon,
  SettingsIcon,
  ShieldCheckIcon,
  SparklesIcon,
  TrendingUpIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, type AdminSettingDef, type AdminSettingGroup } from "@/components/postyar/api";
import { AdminGate } from "@/components/postyar/admin/gate";
import { toPersianDigits } from "@/lib/persian";

// Group → icon mapping (lucide only).
const GROUP_ICONS: Record<AdminSettingGroup["id"], React.ComponentType<{ className?: string }>> = {
  general: GlobeIcon,
  sms_panel: MessageSquareIcon,
  email_panel: MailIcon,
  bank_gateway: BanknoteIcon,
  gold_config: TrendingUpIcon,
  ai_config: SparklesIcon,
  security: ShieldCheckIcon,
};

const GROUP_ORDER: AdminSettingGroup["id"][] = [
  "general",
  "sms_panel",
  "email_panel",
  "bank_gateway",
  "gold_config",
  "ai_config",
  "security",
];

// Per-section Save button labels (ITEM 20).
const GROUP_SAVE_LABEL_FA: Record<AdminSettingGroup["id"], string> = {
  general: "ذخیرهٔ تنظیمات عمومی",
  sms_panel: "ذخیرهٔ تنظیمات پیامک",
  email_panel: "ذخیرهٔ تنظیمات ایمیل",
  bank_gateway: "ذخیرهٔ تنظیمات درگاه",
  gold_config: "ذخیرهٔ تنظیمات طلا",
  ai_config: "ذخیرهٔ تنظیمات هوش مصنوعی",
  security: "ذخیرهٔ تنظیمات امنیتی",
};

// ---------------------------------------------------------------------
// Provider→keys mapping (ITEMS 19b, 21).
// For groups that have a "provider selector" key, when the user picks a
// provider, ONLY the keys listed here are shown. Other keys in the
// group remain hidden (and are NOT saved when the section is saved).
// ---------------------------------------------------------------------
const SMS_PROVIDER_KEY = "POSTYAR_SMS_PROVIDER";
const GATEWAY_PROVIDER_KEY = "POSTYAR_BANK_GATEWAY_PROVIDER";

const SMS_PROVIDER_KEYS: Record<string, string[]> = {
  "": [], // خاموش (disabled) — no credential fields
  melipayamak: ["POSTYAR_SMS_USERNAME", "POSTYAR_SMS_PASSWORD", "POSTYAR_SMS_SENDER"],
  kavenegar: ["POSTYAR_SMS_API_KEY", "POSTYAR_SMS_SENDER"],
  farapayamak: ["POSTYAR_SMS_USERNAME", "POSTYAR_SMS_PASSWORD", "POSTYAR_SMS_SENDER"],
  smsir: ["POSTYAR_SMS_API_KEY", "POSTYAR_SMS_SENDER", "POSTYAR_SMS_TEMPLATE_ID"],
  nikpayamak: ["POSTYAR_SMS_USERNAME", "POSTYAR_SMS_PASSWORD", "POSTYAR_SMS_SENDER"],
};

const GATEWAY_PROVIDER_KEYS: Record<string, string[]> = {
  "": [], // انتخاب نشده
  // مستقیم (generic direct): terminal_id + merchant_id + secret + URL + callback + base
  direct: [
    "POSTYAR_BANK_DIRECT_URL",
    "POSTYAR_BANK_DIRECT_MERCHANT",
    "POSTYAR_BANK_DIRECT_TERMINAL",
    "POSTYAR_BANK_DIRECT_SECRET",
    "POSTYAR_BANK_GATEWAY_NAME",
    "POSTYAR_BANK_CALLBACK_PATH",
    "POSTYAR_PUBLIC_BASE_URL",
  ],
  // زیبال (intermediate): merchant_id + callback + base
  zibal: [
    "POSTYAR_BANK_INTERMEDIARY_MERCHANT",
    "POSTYAR_BANK_GATEWAY_NAME",
    "POSTYAR_BANK_CALLBACK_PATH",
    "POSTYAR_PUBLIC_BASE_URL",
  ],
  // زرین‌پال (intermediate): merchant_id + sandbox + callback + base
  zarinpal: [
    "POSTYAR_BANK_INTERMEDIARY_MERCHANT",
    "POSTYAR_BANK_GATEWAY_SANDBOX",
    "POSTYAR_BANK_GATEWAY_NAME",
    "POSTYAR_BANK_CALLBACK_PATH",
    "POSTYAR_PUBLIC_BASE_URL",
  ],
  // نکست‌پی (intermediate): api_key + callback + base
  nextpay: [
    "POSTYAR_BANK_INTERMEDIARY_MERCHANT",
    "POSTYAR_BANK_GATEWAY_NAME",
    "POSTYAR_BANK_CALLBACK_PATH",
    "POSTYAR_PUBLIC_BASE_URL",
  ],
  // آیدی‌پی (intermediate): api_key + sandbox + callback + base
  idpay: [
    "POSTYAR_BANK_INTERMEDIARY_MERCHANT",
    "POSTYAR_BANK_GATEWAY_SANDBOX",
    "POSTYAR_BANK_GATEWAY_NAME",
    "POSTYAR_BANK_CALLBACK_PATH",
    "POSTYAR_PUBLIC_BASE_URL",
  ],
  // بانک سامان (direct): terminal_id + merchant_id + secret + URL + callback + base
  saman: [
    "POSTYAR_BANK_DIRECT_URL",
    "POSTYAR_BANK_DIRECT_MERCHANT",
    "POSTYAR_BANK_DIRECT_TERMINAL",
    "POSTYAR_BANK_DIRECT_SECRET",
    "POSTYAR_BANK_GATEWAY_NAME",
    "POSTYAR_BANK_CALLBACK_PATH",
    "POSTYAR_PUBLIC_BASE_URL",
  ],
};

/**
 * Returns the provider-selector key for a group, or null if the group
 * has no provider-aware dropdown (general / email_panel / gold_config /
 * ai_config / security).
 */
function providerKeyForGroup(groupId: AdminSettingGroup["id"]): string | null {
  if (groupId === "sms_panel") return SMS_PROVIDER_KEY;
  if (groupId === "bank_gateway") return GATEWAY_PROVIDER_KEY;
  return null;
}

/**
 * Returns the set of keys relevant for the given (group, provider) pair.
 * For groups without a provider selector, returns ALL the group's keys.
 */
function relevantKeysFor(
  group: AdminSettingGroup,
  providerKey: string | null,
  providerValue: string,
): Set<string> {
  if (!providerKey) return new Set(group.keys.map((k) => k.key));
  const map = group.id === "sms_panel" ? SMS_PROVIDER_KEYS : GATEWAY_PROVIDER_KEYS;
  const list = map[providerValue] ?? [];
  // Always include the provider selector itself so it shows at the top.
  const s = new Set<string>(list);
  s.add(providerKey);
  return s;
}

function maskValue(v: string): string {
  if (!v) return "";
  if (v.length <= 4) return "••••";
  return `••••${v.slice(-2)}`;
}

export interface AdminSettingsViewProps {
  navigate: (to: string) => void;
}

function AdminSettingsInner({ navigate: _navigate }: AdminSettingsViewProps) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin", "settings"],
    queryFn: () => api.getAdminSettingsTyped(),
    staleTime: 30_000,
  });

  const groups = q.data?.groups ?? [];
  const items = q.data?.items ?? [];
  // Build a quick lookup map of current stored values.
  const valueMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of items) m.set(r.key, r.value);
    return m;
  }, [items]);

  const orderedGroups = useMemo(() => {
    return GROUP_ORDER.map((id) => groups.find((g) => g.id === id)).filter((g): g is AdminSettingGroup => !!g);
  }, [groups]);

  // Lifted drafts map (key → user-typed value) across ALL groups. This
  // lets the global Save-All button collect every dirty draft into a
  // single PATCH payload (ITEM 20).
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  // Track which keys are "masked reveal" toggled on (sensitive keys).
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  // Reset drafts whenever the server-side values change (e.g. after a
  // save + refetch). We hash ALL items so any change (including
  // external edits) is detected. Critically, we only DROP drafts that
  // now MATCH the stored value (they were just saved or externally
  // reverted); drafts that still differ from the stored value are
  // PRESERVED so the user's unsaved edits in OTHER sections survive
  // a per-section save in one section.
  const seedKey = items.map((r) => `${r.key}=${r.value}`).join("|");
  useEffect(() => {
    setDrafts((prev) => {
      const next: Record<string, string> = {};
      for (const [k, v] of Object.entries(prev)) {
        // If the server doesn't know about this key (no row), keep the
        // draft — it's for a not-yet-saved key.
        const stored = valueMap.get(k);
        if (stored === undefined) {
          next[k] = v;
          continue;
        }
        // Keep only drafts that still differ from the stored value.
        if (v !== stored) next[k] = v;
      }
      return next;
    });
    // `revealed` is a UI-only toggle and never needs reset.
  }, [seedKey, valueMap]);

  const onDraft = useCallback((key: string, value: string) => {
    setDrafts((d) => ({ ...d, [key]: value }));
  }, []);
  const onToggleReveal = useCallback((key: string) => {
    setRevealed((r) => ({ ...r, [key]: !r[key] }));
  }, []);

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["admin", "settings"] });
  }, [qc]);

  // -------------------------------------------------------------------
  // Global Save-All (ITEM 20).
  // Collects ALL dirty drafts across ALL groups (filtered by the
  // currently-selected provider per group) into one PATCH payload and
  // posts once. Shows a single success toast.
  // -------------------------------------------------------------------
  const saveAllMut = useMutation({
    mutationFn: async () => {
      const dirty: Array<{ key: string; value: string }> = [];
      for (const g of orderedGroups) {
        const providerKey = providerKeyForGroup(g.id);
        const providerValue = providerKey
          ? (drafts[providerKey] ?? valueMap.get(providerKey) ?? "")
          : "";
        const relevant = relevantKeysFor(g, providerKey, providerValue);
        for (const def of g.keys) {
          if (!relevant.has(def.key)) continue;
          if (!(def.key in drafts)) continue;
          const stored = valueMap.get(def.key) ?? "";
          if (drafts[def.key] !== stored) {
            dirty.push({ key: def.key, value: drafts[def.key] ?? "" });
          }
        }
      }
      if (dirty.length === 0) return { ok: true, count: 0 };
      return api.adminBatchUpdateSettings(dirty);
    },
    onSuccess: (data) => {
      const count = (data as { count?: number }).count ?? 0;
      if (count > 0) {
        toast.success(`${toPersianDigits(count)} تنظیم یکجا ذخیره شد.`);
      } else {
        toast.info("تغییر جدیدی برای ذخیره وجود ندارد.");
      }
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message ?? "ذخیرهٔ همهٔ تنظیمات ناموفق بود."),
  });

  // Quick stats for the header badge.
  const totalDirty = useMemo(() => {
    let n = 0;
    for (const g of orderedGroups) {
      const providerKey = providerKeyForGroup(g.id);
      const providerValue = providerKey
        ? (drafts[providerKey] ?? valueMap.get(providerKey) ?? "")
        : "";
      const relevant = relevantKeysFor(g, providerKey, providerValue);
      for (const def of g.keys) {
        if (!relevant.has(def.key)) continue;
        if (def.key in drafts && drafts[def.key] !== (valueMap.get(def.key) ?? "")) n++;
      }
    }
    return n;
  }, [orderedGroups, drafts, valueMap]);

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      {/* Sticky header with global Save-All (ITEM 20). */}
      <div className="sticky top-0 z-20 -mx-2 flex flex-wrap items-end justify-between gap-3 rounded-lg border bg-background/80 p-3 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <SettingsIcon className="size-6" />
            تنظیمات سامانه
          </h1>
          <p className="text-sm text-muted-foreground">
            پیکربندی گروهی سامانه. در هر بخش، دکمهٔ ذخیرهٔ همان بخش وجود دارد؛ دکمهٔ «ذخیرهٔ همهٔ تنظیمات» همهٔ تغییرات را یکجا ذخیره می‌کند.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={invalidate}
            className="cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <RotateCcwIcon className="size-4" /> بازخوانی
          </Button>
          <Button
            size="sm"
            onClick={() => saveAllMut.mutate()}
            disabled={saveAllMut.isPending || totalDirty === 0}
            className="gap-1.5 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {saveAllMut.isPending ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <SaveAllIcon className="size-4" />
            )}
            ذخیرهٔ همهٔ تنظیمات
            {totalDirty > 0 && (
              <Badge variant="secondary" className="tabular-nums text-[10px]">
                {toPersianDigits(totalDirty)}
              </Badge>
            )}
          </Button>
        </div>
      </div>

      {q.isLoading && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}
      {q.error && (
        <Card>
          <CardContent className="p-4 text-sm text-destructive flex items-center gap-2" dir="rtl">
            <AlertCircleIcon className="size-4" />
            بارگذاری تنظیمات ناموفق بود.
          </CardContent>
        </Card>
      )}
      {!q.isLoading && orderedGroups.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
            <SettingsIcon className="size-8 opacity-50" />
            <div>هیچ گروه تنظیماتی تعریف نشده است.</div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {orderedGroups.map((g) => (
          <SettingsGroupCard
            key={g.id}
            group={g}
            valueMap={valueMap}
            drafts={drafts}
            revealed={revealed}
            onDraft={onDraft}
            onToggleReveal={onToggleReveal}
            onSaved={invalidate}
          />
        ))}
      </div>

      <Card>
        <CardContent className="p-4 text-xs text-muted-foreground" dir="rtl">
          <div className="flex items-center gap-2 font-medium text-foreground">
            <KeyRoundIcon className="size-4" />
            نکته امنیتی
          </div>
          <p className="mt-1 leading-relaxed">
            کلیدهای محرمانه (رمز عبور، کلید API، توکن) تنها به‌صورت ماسک‌شده در فهرست نمایش داده می‌شوند. هنگام ویرایش، برای حفاظت در برابر افشای تصادفی، مقدار فعلی نمایش داده نمی‌شود؛ با ذخیره مقدار جدید جایگزین می‌شود.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function SettingsGroupCard({
  group,
  valueMap,
  drafts,
  revealed,
  onDraft,
  onToggleReveal,
  onSaved,
}: {
  group: AdminSettingGroup;
  valueMap: Map<string, string>;
  drafts: Record<string, string>;
  revealed: Record<string, boolean>;
  onDraft: (key: string, value: string) => void;
  onToggleReveal: (key: string) => void;
  onSaved: () => void;
}) {
  // The provider selector key for this group (null when the group is
  // not provider-aware, e.g. general / email_panel / gold_config / ai_config / security).
  const providerKey = providerKeyForGroup(group.id);
  const providerValue = providerKey
    ? (drafts[providerKey] ?? valueMap.get(providerKey) ?? "")
    : "";

  // Set of keys that should be visible for the current provider.
  const relevant = useMemo(
    () => relevantKeysFor(group, providerKey, providerValue),
    [group, providerKey, providerValue],
  );

  // Visible defs: provider selector FIRST, then the rest in the order
  // the backend defined them, filtered by the provider.
  const visibleKeys = useMemo<AdminSettingDef[]>(() => {
    const list: AdminSettingDef[] = [];
    if (providerKey) {
      const pk = group.keys.find((k) => k.key === providerKey);
      if (pk) list.push(pk);
    }
    for (const k of group.keys) {
      if (providerKey && k.key === providerKey) continue;
      if (relevant.has(k.key)) list.push(k);
    }
    return list;
  }, [group.keys, providerKey, relevant]);

  const dirtyKeys = visibleKeys.filter((k) => {
    const stored = valueMap.get(k.key) ?? "";
    return k.key in drafts && drafts[k.key] !== stored;
  });
  const dirty = dirtyKeys.length > 0;

  // Per-section Save (ITEM 20). Saves ONLY the visible dirty keys.
  const saveMut = useMutation({
    mutationFn: () =>
      api.adminBatchUpdateSettings(
        dirtyKeys.map((k) => ({ key: k.key, value: drafts[k.key] ?? "" })),
      ),
    onSuccess: () => {
      toast.success(`${toPersianDigits(dirtyKeys.length)} تنظیم ذخیره شد.`);
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message ?? "ذخیره ناموفق بود."),
  });

  const resetMut = useMutation({
    mutationFn: (key: string) => api.adminResetSetting(key),
    onSuccess: (_data, key) => {
      toast.success(`تنظیم «${key}» به پیش‌فرض بازنشانی شد.`);
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message ?? "بازنشانی ناموفق بود."),
  });

  const Icon = GROUP_ICONS[group.id] ?? SettingsIcon;
  const storedCount = group.keys.filter((k) => valueMap.has(k.key)).length;
  const saveLabel = GROUP_SAVE_LABEL_FA[group.id] ?? "ذخیره";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="rounded-md bg-primary/10 p-1.5 text-primary">
            <Icon className="size-4" />
          </span>
          {group.titleFa}
          <Badge variant="outline" className="text-[10px] tabular-nums">
            {toPersianDigits(storedCount)} از {toPersianDigits(group.keys.length)} پیکربندی‌شده
          </Badge>
        </CardTitle>
        <CardDescription className="text-xs">{group.descriptionFa}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4" dir="rtl">
        {visibleKeys.map((k) => (
          <SettingField
            key={k.key}
            def={k}
            storedValue={valueMap.get(k.key) ?? ""}
            draft={drafts[k.key]}
            revealed={!!revealed[k.key]}
            onDraft={(v) => onDraft(k.key, v)}
            onToggleReveal={() => onToggleReveal(k.key)}
            onReset={() => resetMut.mutate(k.key)}
            resetting={resetMut.isPending && resetMut.variables === k.key}
            isProviderSelector={k.key === providerKey}
          />
        ))}
        {providerKey && providerValue === "" && (
          <div className="flex items-center gap-2 rounded-md border border-dashed border-muted-foreground/40 bg-muted/30 p-3 text-xs text-muted-foreground" dir="rtl">
            <AlertCircleIcon className="size-3.5 shrink-0" />
            <span>
              {group.id === "sms_panel"
                ? "برای مشاهدهٔ تنظیمات، ابتدا یک پنل پیامکی از فهرست کشویی بالا انتخاب کنید."
                : "برای مشاهدهٔ تنظیمات، ابتدا یک درگاه بانکی از فهرست کشویی بالا انتخاب کنید."}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between border-t pt-3">
          <span className="text-[11px] text-muted-foreground">
            {dirty ? `${toPersianDigits(dirtyKeys.length)} تغییر ذخیره‌نشده` : "همه تغییرات ذخیره شده"}
          </span>
          <Button
            onClick={() => saveMut.mutate()}
            disabled={!dirty || saveMut.isPending}
            className="gap-1.5 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {saveMut.isPending ? <Loader2Icon className="size-4 animate-spin" /> : <SaveIcon className="size-4" />}
            {saveLabel}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SettingField({
  def,
  storedValue,
  draft,
  revealed,
  onDraft,
  onToggleReveal,
  onReset,
  resetting,
  isProviderSelector,
}: {
  def: AdminSettingDef;
  storedValue: string;
  draft: string | undefined;
  revealed: boolean;
  onDraft: (v: string) => void;
  onToggleReveal: () => void;
  onReset: () => void;
  resetting: boolean;
  isProviderSelector: boolean;
}) {
  // The value shown in the input: the user's draft if edited, else the
  // placeholder (empty) for sensitive keys (so the actual secret never
  // renders in the DOM), else the stored value.
  const isSensitive = !!def.sensitive;
  const inputValue = draft !== undefined ? draft : isSensitive ? "" : storedValue;
  const isDirty = draft !== undefined && draft !== storedValue;

  return (
    <div
      className={`flex flex-col gap-1.5 rounded-md border bg-card/40 p-3 ${
        isProviderSelector ? "border-primary/40 ring-1 ring-primary/10" : ""
      }`}
      dir="rtl"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <Label className="text-sm font-medium" htmlFor={`set-${def.key}`}>
            {def.labelFa}
            {isProviderSelector && (
              <Badge variant="secondary" className="ms-2 text-[10px]">
                فهرست کشویی
              </Badge>
            )}
          </Label>
          <code dir="ltr" className="text-[10px] text-muted-foreground bg-muted/60 rounded px-1 py-0.5 inline-block w-fit font-mono">
            {def.key}
          </code>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onReset}
          disabled={resetting || !storedValue}
          title={!storedValue ? "تنظیمی برای بازنشانی وجود ندارد" : "حذف مقدار ذخیره‌شده و بازگشت به پیش‌فرض محیطی"}
          className="gap-1 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none text-[11px]"
        >
          {resetting ? <Loader2Icon className="size-3.5 animate-spin" /> : <RotateCcwIcon className="size-3.5" />}
          بازنشانی
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed">{def.descFa}</p>

      {def.options ? (
        <Select
          value={inputValue === "" ? "__empty__" : inputValue}
          onValueChange={(v) => onDraft(v === "__empty__" ? "" : v)}
        >
          <SelectTrigger
            id={`set-${def.key}`}
            className="w-full cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <SelectValue placeholder={def.default ?? "— انتخاب —"} />
          </SelectTrigger>
          <SelectContent dir="rtl">
            {def.options.map((o) => (
              <SelectItem key={o.value || "__empty__"} value={o.value || "__empty__"}>
                {o.labelFa}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          id={`set-${def.key}`}
          type={isSensitive && !revealed ? "password" : "text"}
          value={inputValue}
          onChange={(e) => onDraft(e.target.value)}
          dir="ltr"
          autoComplete="off"
          placeholder={isSensitive ? (storedValue ? `ذخیره‌شده: ${maskValue(storedValue)} — تایپ کنید برای جایگزینی` : def.default ?? "") : (def.default ?? "")}
          className="cursor-text focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        />
      )}

      {isSensitive && storedValue && (
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>مقدار فعلی ذخیره‌شده: <span dir="ltr" className="font-mono">{maskValue(storedValue)}</span></span>
          <button
            type="button"
            onClick={onToggleReveal}
            className="cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none text-primary hover:underline"
          >
            {revealed ? "مخفی کردن" : "نمایش مقدار"}
          </button>
        </div>
      )}
      {isDirty && (
        <div className="text-[10px] text-amber-600 flex items-center gap-1">
          <AlertCircleIcon className="size-3" />
          تغییر ذخیره‌نشده
        </div>
      )}
    </div>
  );
}

export function AdminSettingsView(props: AdminSettingsViewProps) {
  return (
    <AdminGate>
      <AdminSettingsInner {...props} />
    </AdminGate>
  );
}

export default AdminSettingsView;
