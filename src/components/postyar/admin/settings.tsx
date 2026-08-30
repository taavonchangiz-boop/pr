"use client";
// =====================================================================
// POSTYAR — Admin Settings View (ITEMS 39, 40)
// ---------------------------------------------------------------------
// Grouped, Persian-labeled settings:
//   1. تنظیمات عمومی          (general)
//   2. پنل پیامکی              (sms_panel)
//   3. پنل ایمیل               (email_panel)
//   4. درگاه بانکی            (bank_gateway)
//   5. پیکربندی طلا           (gold_config)
//   6. پیکربندی هوش مصنوعی    (ai_config)
//   7. امنیت و محدودیت        (security)
//
// Each group is a Card with a header + Persian description. Each setting
// in the group shows: the key in a <code> tag, a Persian label, a
// description sentence, and an Input or Select. Sensitive keys (API
// keys / passwords) render as password-type and are masked in the list.
// Per-card «ذخیره» (PATCH /api/admin/settings with batch items) + per-key
// «بازنشانی به پیش‌فرض» (DELETE /api/admin/settings).
//
// NOTE (ITEM 35): این بخش فقط برای مدیر سامانه قابل مشاهده است.
// The route /api/admin/settings enforces `requireRole(["admin"])`. The
// dashboard renders this view only for admins.
// =====================================================================
import { useEffect, useMemo, useState } from "react";
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

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <SettingsIcon className="size-6" />
            تنظیمات سامانه
          </h1>
          <p className="text-sm text-muted-foreground">
            پیکربندی گروهی سامانه. مقادیر واردشده برای کلیدهای پنل پیامک، ایمیل، درگاه بانکی و هوش مصنوعی، تنظیمات محیطی (env) را بازنویسی می‌کنند.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => qc.invalidateQueries({ queryKey: ["admin", "settings"] })}
          className="cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <RotateCcwIcon className="size-4" /> بازخوانی
        </Button>
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
            onSaved={() => qc.invalidateQueries({ queryKey: ["admin", "settings"] })}
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
  onSaved,
}: {
  group: AdminSettingGroup;
  valueMap: Map<string, string>;
  onSaved: () => void;
}) {
  // Local edits: keyed by setting key. Empty string = unchanged (we
  // initialize on first render via the `key + "‖" + value` trick).
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  // Track which keys are "masked reveal" toggled on (sensitive keys).
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  // Hash of valueMap for this group's keys, so we re-seed drafts when the
  // server values change (e.g. after a save + refetch).
  const seedKey = group.keys.map((k) => `${k.key}=${valueMap.get(k.key) ?? ""}`).join("|");
  useEffect(() => {
    // Reset drafts whenever the server-side values change.
    setDrafts({});
  }, [seedKey]);

  const dirtyKeys = group.keys.filter((k) => {
    const stored = valueMap.get(k.key) ?? "";
    return k.key in drafts && drafts[k.key] !== stored;
  });
  const dirty = dirtyKeys.length > 0;

  const saveMut = useMutation({
    mutationFn: () => api.adminBatchUpdateSettings(dirtyKeys.map((k) => ({ key: k.key, value: drafts[k.key] ?? "" }))),
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
      <CardContent className="flex flex-col gap-4">
        {group.keys.map((k) => (
          <SettingField
            key={k.key}
            def={k}
            storedValue={valueMap.get(k.key) ?? ""}
            draft={drafts[k.key]}
            revealed={!!revealed[k.key]}
            onDraft={(v) => setDrafts((d) => ({ ...d, [k.key]: v }))}
            onToggleReveal={() => setRevealed((r) => ({ ...r, [k.key]: !r[k.key] }))}
            onReset={() => resetMut.mutate(k.key)}
            resetting={resetMut.isPending && resetMut.variables === k.key}
          />
        ))}
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
            ذخیرهٔ گروه
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
}: {
  def: AdminSettingDef;
  storedValue: string;
  draft: string | undefined;
  revealed: boolean;
  onDraft: (v: string) => void;
  onToggleReveal: () => void;
  onReset: () => void;
  resetting: boolean;
}) {
  // The value shown in the input: the user's draft if edited, else the
  // placeholder (empty) for sensitive keys (so the actual secret never
  // renders in the DOM), else the stored value.
  const isSensitive = !!def.sensitive;
  const inputValue = draft !== undefined ? draft : isSensitive ? "" : storedValue;
  const isDirty = draft !== undefined && draft !== storedValue;

  return (
    <div className="flex flex-col gap-1.5 rounded-md border bg-card/40 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <Label className="text-sm font-medium" htmlFor={`set-${def.key}`}>
            {def.labelFa}
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
          <SelectContent>
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
