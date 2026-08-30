"use client";
// =====================================================================
// POSTYAR — Glass Buttons View (destination-scoped OR preset library)
// ---------------------------------------------------------------------
// Two render modes:
//   • With a pre-selected destination (destinationId !== undefined) —
//     existing flow: two-column layout (sortable editor cards on the
//     left, live preview on the right). Persisted via
//     api.createButton / api.updateButton / api.deleteButton.
//   • Without a pre-selected destination (destinationId === undefined)
//     — preset library: a grid of presets (localStorage-backed) that
//     are not tied to a specific destination. Clicking a preset opens
//     the editor inline; «افزودن به مقصد» lets the user assign a
//     preset to a real destination (creates a GlassButton row via
//     api.createButton on the chosen destination).
//
// Persistence approach (documented in worklog):
//   The Prisma schema's `GlassButton.destinationId` is non-nullable.
//   Destination-less presets are therefore stored in localStorage
//   (key: postyar:glass-button-presets). Assigning a preset to a
//   destination copies its fields into a real GlassButton row via the
//   existing /api/destinations/[id]/buttons endpoint.
// =====================================================================
import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertCircleIcon,
  ArrowRightIcon,
  CheckIcon,
  GripVerticalIcon,
  LayoutTemplateIcon,
  Loader2Icon,
  PlusIcon,
  SaveIcon,
  Trash2Icon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  api,
  type DestinationRow,
  type GlassButtonRow,
} from "@/components/postyar/api";
import { toPersianDigits } from "@/lib/persian";

const MAX_BUTTONS = 8;

function providerLabel(p: string): string {
  switch (p) {
    case "telegram": return "تلگرام";
    case "bale": return "بله";
    case "rubika": return "روبیکا";
    default: return p;
  }
}

// =====================================================================
// localStorage preset store (destination-less glass buttons)
// =====================================================================
const PRESET_KEY = "postyar:glass-button-presets";

export interface GlassButtonPreset {
  id: string;
  label: string;
  url: string | null;
  callbackData: string | null;
  rowOrder: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

function loadPresets(): GlassButtonPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PRESET_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as GlassButtonPreset[];
  } catch { return []; }
}

function persistPresets(items: GlassButtonPreset[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PRESET_KEY, JSON.stringify(items));
  } catch { /* ignore */ }
}

function newPresetId(): string {
  return `preset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

// =====================================================================
// Sortable Button Card (server-side, destination-scoped)
// =====================================================================
function SortableButtonCard({
  button,
  onChange,
  onSave,
  onDelete,
  saving,
  deleting,
  dirty,
}: {
  button: GlassButtonRow;
  onChange: (patch: Partial<GlassButtonRow>) => void;
  onSave: () => void;
  onDelete: () => void;
  saving: boolean;
  deleting: boolean;
  dirty: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: button.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-md border bg-card",
        isDragging && "opacity-60 shadow-md ring-2 ring-primary/30",
      )}
    >
      <div className="flex items-start gap-2 p-3" dir="rtl">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="mt-2 cursor-grab rounded p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          aria-label="جابه‌جایی"
        >
          <GripVerticalIcon className="size-4" />
        </button>

        <div className="flex flex-1 flex-col gap-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label className="text-[0.7rem]">برچسب</Label>
              <Input
                value={button.label}
                onChange={(e) => onChange({ label: e.target.value })}
                maxLength={64}
                placeholder="متن دکمه"
                className="h-8 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-[0.7rem]">نشانی (اختیاری)</Label>
              <Input
                value={button.url ?? ""}
                onChange={(e) => onChange({ url: e.target.value || null })}
                dir="ltr"
                className="h-8 text-left font-mono text-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                placeholder="https://"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-[0.7rem]">داده کال‌بک (اختیاری)</Label>
              <Input
                value={button.callbackData ?? ""}
                onChange={(e) => onChange({ callbackData: e.target.value || null })}
                dir="ltr"
                className="h-8 text-left font-mono text-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                placeholder="callback_data"
                maxLength={64}
              />
            </div>
            <div className="flex items-end gap-2">
              <div className="flex flex-col gap-1">
                <Label className="text-[0.7rem]">رابطه</Label>
                <Input
                  type="number"
                  min={0}
                  max={20}
                  value={button.rowOrder}
                  onChange={(e) => onChange({ rowOrder: Number(e.target.value) || 0 })}
                  className="h-8 w-20 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-[0.7rem]">فعال</Label>
                <div className="flex h-8 items-center">
                  <Switch
                    checked={button.enabled}
                    onCheckedChange={(c) => onChange({ enabled: !!c })}
                  />
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onDelete} disabled={deleting} className="gap-2 cursor-pointer text-destructive hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
              {deleting ? <Loader2Icon className="size-3.5 animate-spin" /> : <Trash2Icon className="size-3.5" />}
              حذف
            </Button>
            <Button size="sm" onClick={onSave} disabled={!dirty || saving} className="gap-2 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
              {saving ? <Loader2Icon className="size-3.5 animate-spin" /> : <SaveIcon className="size-3.5" />}
              ذخیره
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// Preset Card (localStorage-backed)
// =====================================================================
function PresetCard({
  preset,
  destinations,
  onChange,
  onDelete,
  onAssign,
}: {
  preset: GlassButtonPreset;
  destinations: DestinationRow[];
  onChange: (next: GlassButtonPreset) => void;
  onDelete: () => void;
  onAssign: (destinationId: string) => Promise<void>;
}) {
  const [label, setLabel] = useState(preset.label);
  const [url, setUrl] = useState<string>(preset.url ?? "");
  const [callbackData, setCallbackData] = useState<string>(preset.callbackData ?? "");
  const [rowOrder, setRowOrder] = useState<number>(preset.rowOrder);
  const [enabled, setEnabled] = useState<boolean>(preset.enabled);
  const [dirty, setDirty] = useState(false);
  const [assignId, setAssignId] = useState<string>("");
  const [assigning, setAssigning] = useState(false);

  function save() {
    onChange({
      ...preset,
      label: label.trim(),
      url: url.trim() || null,
      callbackData: callbackData.trim() || null,
      rowOrder,
      enabled,
      updatedAt: new Date().toISOString(),
    });
    setDirty(false);
    toast.success("پریست ذخیره شد (ذخیره‌سازی محلی).");
  }

  async function assign() {
    if (!assignId) { toast.error("یک مقصد انتخاب کنید."); return; }
    setAssigning(true);
    try {
      await onAssign(assignId);
    } finally {
      setAssigning(false);
    }
  }

  return (
    <div className="rounded-md border border-dashed bg-card p-3" dir="rtl">
      <div className="flex items-start gap-2">
        <div className="mt-2 rounded p-1 text-muted-foreground">
          <LayoutTemplateIcon className="size-4" />
        </div>
        <div className="flex flex-1 flex-col gap-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label className="text-[0.7rem]">برچسب</Label>
              <Input
                value={label}
                onChange={(e) => { setLabel(e.target.value); setDirty(true); }}
                maxLength={64}
                placeholder="متن دکمه"
                className="h-8 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-[0.7rem]">نشانی (اختیاری)</Label>
              <Input
                value={url}
                onChange={(e) => { setUrl(e.target.value); setDirty(true); }}
                dir="ltr"
                className="h-8 text-left font-mono text-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                placeholder="https://"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-[0.7rem]">داده کال‌بک (اختیاری)</Label>
              <Input
                value={callbackData}
                onChange={(e) => { setCallbackData(e.target.value); setDirty(true); }}
                dir="ltr"
                className="h-8 text-left font-mono text-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                placeholder="callback_data"
                maxLength={64}
              />
            </div>
            <div className="flex items-end gap-2">
              <div className="flex flex-col gap-1">
                <Label className="text-[0.7rem]">رابطه</Label>
                <Input
                  type="number"
                  min={0}
                  max={20}
                  value={rowOrder}
                  onChange={(e) => { setRowOrder(Number(e.target.value) || 0); setDirty(true); }}
                  className="h-8 w-20 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-[0.7rem]">فعال</Label>
                <div className="flex h-8 items-center">
                  <Switch
                    checked={enabled}
                    onCheckedChange={(c) => { setEnabled(!!c); setDirty(true); }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Live chip preview */}
          <div className="rounded-md border bg-muted/30 p-2">
            <div className="mb-1 text-[0.7rem] text-muted-foreground">پیش‌نمایش</div>
            <span className={cn("glass-chip", !enabled && "opacity-50")}>
              {label || "دکمه"}
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onDelete} className="gap-2 cursor-pointer text-destructive hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
              <Trash2Icon className="size-3.5" /> حذف
            </Button>
            <Button size="sm" onClick={save} disabled={!dirty} className="gap-2 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
              <SaveIcon className="size-3.5" /> ذخیره
            </Button>
          </div>

          {/* Assign to destination */}
          <div className="flex flex-wrap items-end gap-2 rounded-md border border-dashed border-primary/40 bg-primary/5 p-2">
            <div className="flex flex-1 flex-col gap-1">
              <Label className="text-[0.7rem]">افزودن به مقصد</Label>
              <Select value={assignId} onValueChange={setAssignId}>
                <SelectTrigger className="w-full cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                  <SelectValue placeholder="انتخاب مقصد…" />
                </SelectTrigger>
                <SelectContent>
                  {destinations.length === 0 ? (
                    <SelectItem value="_none" disabled>ابتدا یک مقصد بسازید</SelectItem>
                  ) : (
                    destinations.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.label} <span dir="ltr" className="text-[10px] text-muted-foreground">{providerLabel(d.provider)}</span>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <Button
              size="sm"
              onClick={assign}
              disabled={assigning || !assignId || destinations.length === 0 || !label.trim()}
              className="gap-2 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {assigning ? <Loader2Icon className="size-3.5 animate-spin" /> : <PlusIcon className="size-3.5" />}
              افزودن به مقصد
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// Live Preview (for destination-scoped mode)
// =====================================================================
function LivePreview({ buttons }: { buttons: GlassButtonRow[] }) {
  const enabled = buttons.filter((b) => b.enabled);
  const rows = useMemo(() => {
    const map = new Map<number, GlassButtonRow[]>();
    for (const b of enabled) {
      const list = map.get(b.rowOrder) ?? [];
      list.push(b);
      map.set(b.rowOrder, list);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, list]) => list);
  }, [enabled]);

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed p-8 text-center text-xs text-muted-foreground">
        <AlertCircleIcon className="size-5" />
        <div>پیش‌نمایش خالی است — حداقل یک دکمه فعال کنید.</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {rows.map((row, i) => (
        <div key={i} className="flex flex-wrap gap-2 rounded-md border bg-muted/30 p-3">
          {row.map((b) => (
            <span key={b.id} className="glass-chip">
              {b.label || "دکمه"}
            </span>
          ))}
        </div>
      ))}
      <p className="text-[0.7rem] text-muted-foreground">
        هر ردیف در پیش‌نمایش معادل یک ردیف در کیبورد شیشه‌ای تلگرام/بله/روبیکا است. دکمه‌های دارای «رابطه» یکسان در همان ردیف قرار می‌گیرند.
      </p>
    </div>
  );
}

// =====================================================================
// Main View
// =====================================================================
export interface GlassButtonsViewProps {
  /** Optional — when omitted, the view shows the preset library. */
  destinationId?: string;
  navigate?: (to: string) => void;
}

export function GlassButtonsView({ destinationId, navigate }: GlassButtonsViewProps) {
  const qc = useQueryClient();
  const [localButtons, setLocalButtons] = useState<GlassButtonRow[]>([]);
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);
  // Presets (localStorage)
  const [presets, setPresets] = useState<GlassButtonPreset[]>([]);
  useEffect(() => { setPresets(loadPresets()); }, []);
  function commitPresets(next: GlassButtonPreset[]) {
    setPresets(next);
    persistPresets(next);
  }

  const isPresetMode = !destinationId;

  // Fetch destination (for header) — only when destinationId is defined.
  const destQ = useQuery({
    queryKey: ["destinations", "single", destinationId ?? ""] as const,
    queryFn: () => api.getDestination(destinationId as string),
    staleTime: 30_000,
    enabled: !!destinationId,
  });

  // Fetch buttons — only when destinationId is defined.
  const buttonsQ = useQuery({
    queryKey: ["destinations", "buttons", destinationId ?? ""] as const,
    queryFn: () => api.listButtons(destinationId as string),
    staleTime: 5_000,
    enabled: !!destinationId,
  });

  // Destinations list — for the preset-mode assign picker.
  const destsQ = useQuery({
    queryKey: ["destinations", "list"] as const,
    queryFn: () => api.getDestinations(),
    staleTime: 15_000,
    enabled: isPresetMode,
  });
  const destinations: DestinationRow[] = useMemo(() => destsQ.data ?? [], [destsQ.data]);

  useEffect(() => {
    if (buttonsQ.data) {
      setLocalButtons(buttonsQ.data.map((b) => ({ ...b })));
      setDirtyIds(new Set());
    }
  }, [buttonsQ.data]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const sortedLocal = useMemo(
    () => [...localButtons].sort((a, b) => a.rowOrder - b.rowOrder || (a.createdAt ?? "").localeCompare(b.createdAt ?? "")),
    [localButtons],
  );

  const onChangeButton = useCallback((id: string, patch: Partial<GlassButtonRow>) => {
    setLocalButtons((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
    setDirtyIds((prev) => { const n = new Set(prev); n.add(id); return n; });
  }, []);

  const onSaveButton = useCallback(async (b: GlassButtonRow) => {
    if (!destinationId) return;
    setSavingId(b.id);
    try {
      await api.updateButton(destinationId, b.id, {
        label: b.label,
        url: b.url ?? null,
        callbackData: b.callbackData ?? null,
        rowOrder: b.rowOrder,
        enabled: b.enabled,
      });
      toast.success("دکمه ذخیره شد.");
      setDirtyIds((prev) => { const n = new Set(prev); n.delete(b.id); return n; });
      void qc.invalidateQueries({ queryKey: ["destinations", "buttons", destinationId] });
    } catch (e) {
      const err = e as Error;
      toast.error(err.message ?? "ذخیره ناموفق بود.");
    } finally {
      setSavingId(null);
    }
  }, [destinationId, qc]);

  const onDeleteButton = useCallback(async (b: GlassButtonRow) => {
    if (!destinationId) return;
    setDeletingId(b.id);
    try {
      await api.deleteButton(destinationId, b.id);
      toast.success("دکمه حذف شد.");
      setLocalButtons((prev) => prev.filter((x) => x.id !== b.id));
      setDirtyIds((prev) => { const n = new Set(prev); n.delete(b.id); return n; });
      void qc.invalidateQueries({ queryKey: ["destinations", "buttons", destinationId] });
    } catch (e) {
      const err = e as Error;
      toast.error(err.message ?? "حذف ناموفق بود.");
    } finally {
      setDeletingId(null);
    }
  }, [destinationId, qc]);

  const createMut = useMutation({
    mutationFn: () => {
      if (!destinationId) throw new Error("مقصد مشخص نیست.");
      const nextRowOrder = localButtons.length
        ? Math.max(...localButtons.map((b) => b.rowOrder)) + 1
        : 0;
      return api.createButton(destinationId, {
        label: "دکمه جدید",
        url: "https://postyar.app",
        callbackData: null,
        rowOrder: nextRowOrder,
        enabled: true,
      });
    },
    onSuccess: () => {
      toast.success("دکمه ساخته شد.");
      void qc.invalidateQueries({ queryKey: ["destinations", "buttons", destinationId ?? ""] });
    },
    onError: (e: Error) => toast.error(e.message ?? "ساخت دکمه ناموفق بود."),
  });

  // ----- Preset helpers -----
  function createPreset() {
    const p: GlassButtonPreset = {
      id: newPresetId(),
      label: "دکمه جدید",
      url: "https://postyar.app",
      callbackData: null,
      rowOrder: presets.length,
      enabled: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    commitPresets([p, ...presets]);
    toast.success("پریست ساخته شد (ذخیره‌سازی محلی).");
  }

  function updatePreset(next: GlassButtonPreset) {
    commitPresets(presets.map((p) => p.id === next.id ? next : p));
  }
  function deletePreset(id: string) {
    commitPresets(presets.filter((p) => p.id !== id));
    toast.success("پریست حذف شد.");
  }
  async function assignPreset(preset: GlassButtonPreset, destinationId: string) {
    try {
      await api.createButton(destinationId, {
        label: preset.label,
        url: preset.url,
        callbackData: preset.callbackData,
        rowOrder: preset.rowOrder,
        enabled: preset.enabled,
      });
      toast.success("پریست به مقصد افزوده شد.");
      void qc.invalidateQueries({ queryKey: ["destinations", "buttons", destinationId] });
    } catch (e) {
      const err = e as Error;
      toast.error(err.message ?? "افزودن ناموفق بود.");
    }
  }

  async function onDragEnd(e: DragEndEvent) {
    if (!destinationId) return;
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = sortedLocal.findIndex((b) => b.id === active.id);
    const newIndex = sortedLocal.findIndex((b) => b.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    setReordering(true);
    try {
      const reordered = arrayMove(sortedLocal, oldIndex, newIndex);
      const updates: Promise<unknown>[] = [];
      for (let i = 0; i < reordered.length; i++) {
        const b = reordered[i];
        if (b.rowOrder !== i) {
          updates.push(api.updateButton(destinationId, b.id, { rowOrder: i }));
        }
      }
      await Promise.all(updates);
      setLocalButtons((prev) => {
        const map = new Map(prev.map((b) => [b.id, b]));
        const out: GlassButtonRow[] = [];
        for (const b of reordered) {
          const orig = map.get(b.id);
          if (orig) out.push({ ...orig, rowOrder: reordered.indexOf(orig) });
        }
        for (const b of prev) if (!out.find((x) => x.id === b.id)) out.push(b);
        return out;
      });
      void qc.invalidateQueries({ queryKey: ["destinations", "buttons", destinationId] });
      toast.success("ترتیب دکمه‌ها به‌روزرسانی شد.");
    } catch (e) {
      const err = e as Error;
      toast.error(err.message ?? "بازچینش ناموفق بود.");
    } finally {
      setReordering(false);
    }
  }

  const dest = destQ.data;
  const atMax = localButtons.length >= MAX_BUTTONS;

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      {/* Presets library — always visible (in both modes) */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div className="flex flex-col gap-1">
            <CardTitle className="flex items-center gap-3">
              <LayoutTemplateIcon className="size-4" />
              کتابخانهٔ دکمه‌های شیشه‌ای (پریست)
              <Badge variant="secondary" className="font-normal">{toPersianDigits(presets.length)}</Badge>
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              پریست‌های قابل‌استفاده مجدد که به مقصد خاصی وابسته نیستند. هر پریست را می‌توانید به یک یا چند مقصد اضافه کنید.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => createPreset()}
            className="gap-2 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <PlusIcon className="size-4" />
            پریست جدید
          </Button>
        </CardHeader>
        <CardContent>
          {presets.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed p-8 text-center text-xs text-muted-foreground">
              <AlertCircleIcon className="size-5" />
              <div>هنوز پریستی نساخته‌اید.</div>
              <Button size="sm" onClick={() => createPreset()} className="mt-2 gap-2 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                <PlusIcon className="size-4" /> ساخت نخستین پریست
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {presets.map((p) => (
                <PresetCard
                  key={p.id}
                  preset={p}
                  destinations={destinations}
                  onChange={(next) => updatePreset(next)}
                  onDelete={() => deletePreset(p.id)}
                  onAssign={(destinationId) => assignPreset(p, destinationId)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Destination-scoped editor — only when destinationId is provided */}
      {destinationId && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div className="flex flex-col gap-1">
              <CardTitle className="flex items-center gap-3">
                دکمه‌های شیشه‌ای مقصد
                {dest ? (
                  <Badge variant="outline" className="font-normal">
                    {dest.label} • {providerLabel(dest.provider)}
                  </Badge>
                ) : destQ.isLoading ? (
                  <Skeleton className="h-5 w-32" />
                ) : null}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                دکمه‌های شیشه‌ای زیر کانال/گروه این مقصد نمایش داده می‌شوند. حداکثر {toPersianDigits(MAX_BUTTONS)} دکمه برای هر مقصد.
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => (navigate ? navigate("/dashboard/destinations") : (() => { if (typeof window !== "undefined") window.history.back(); })())} className="gap-2 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
              <ArrowRightIcon className="size-4" />
              بازگشت
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <Label>ویرایشگر دکمه‌ها</Label>
                  <Badge variant="secondary" className="font-normal">
                    {toPersianDigits(localButtons.length)} از {toPersianDigits(MAX_BUTTONS)}
                  </Badge>
                </div>
                {buttonsQ.isLoading ? (
                  <div className="flex flex-col gap-2">
                    {Array.from({ length: 2 }).map((_, i) => (
                      <Skeleton key={i} className="h-32 w-full" />
                    ))}
                  </div>
                ) : sortedLocal.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed p-8 text-center text-xs text-muted-foreground">
                    <AlertCircleIcon className="size-5" />
                    <div>هنوز دکمه‌ای ساخته نشده است.</div>
                    <Button size="sm" onClick={() => createMut.mutate()} disabled={createMut.isPending} className="mt-2 gap-2 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                      <PlusIcon className="size-4" />
                      ساخت نخستین دکمه
                    </Button>
                  </div>
                ) : (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={onDragEnd}
                  >
                    <SortableContext items={sortedLocal.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                      <div className="flex flex-col gap-2">
                        {sortedLocal.map((b) => (
                          <SortableButtonCard
                            key={b.id}
                            button={b}
                            onChange={(patch) => onChangeButton(b.id, patch)}
                            onSave={() => onSaveButton(b)}
                            onDelete={() => onDeleteButton(b)}
                            saving={savingId === b.id}
                            deleting={deletingId === b.id}
                            dirty={dirtyIds.has(b.id)}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                )}

                {sortedLocal.length > 0 && (
                  <div className="flex items-center justify-between">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => createMut.mutate()}
                      disabled={createMut.isPending || atMax || reordering}
                      className="gap-2 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      {createMut.isPending ? <Loader2Icon className="size-4 animate-spin" /> : <PlusIcon className="size-4" />}
                      افزودن دکمه
                    </Button>
                    {atMax && (
                      <span className="text-[0.7rem] text-muted-foreground">
                        به حداکثر تعداد رسیده‌اید.
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-3">
                <Label>پیش‌نمایش زنده</Label>
                <LivePreview buttons={localButtons} />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {isPresetMode && (
        <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">راهنما: </span>
          برای ویرایش دکمه‌های یک مقصد خاص، به فهرست مقاصد بروید و روی یک مقصد کلیک کنید. در اینجا می‌توانید پریست‌های قابل‌استفاده مجدد را مدیریت کنید.
        </div>
      )}

      {/* unused icon gate to keep API surface stable */}
      <span className="hidden"><CheckIcon /></span>
    </div>
  );
}

export default GlassButtonsView;
