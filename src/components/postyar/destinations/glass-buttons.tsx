"use client";
// =====================================================================
// POSTYAR — Glass Buttons View (destination-scoped)
// ---------------------------------------------------------------------
// Two-column layout:
//   - Left: editor list (sortable cards with form fields per button).
//   - Right: live preview of "glass buttons" rendered as rounded gold chips
//     per row (uses the .glass-chip class from globals.css).
//
// Buttons are STRICTLY destination-scoped. The destinationId prop is the
// only key — button IDs are never reused across destinations and there is
// no global button collection.
//
// Max 8 buttons per destination. Reorder via @dnd-kit drag-and-drop.
// Persist via api.createButton / api.updateButton / api.deleteButton.
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
  GripVerticalIcon,
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
import { cn } from "@/lib/utils";
import {
  api,
  type DestinationRow,
  type GlassButtonRow,
} from "@/components/postyar/api";
import { toPersianDigits } from "@/lib/persian";

export interface GlassButtonsViewProps {
  destinationId: string;
  navigate?: (to: string) => void;
}

const MAX_BUTTONS = 8;

function providerLabel(p: string): string {
  switch (p) {
    case "telegram": return "تلگرام";
    case "bale": return "بله";
    case "rubika": return "روبیکا";
    default: return p;
  }
}

// ---------------------------------------------------------------------
// Sortable Button Card
// ---------------------------------------------------------------------
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
        {/* Drag handle */}
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="mt-2 cursor-grab rounded p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing"
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
                className="h-8 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-[0.7rem]">نشانی (اختیاری)</Label>
              <Input
                value={button.url ?? ""}
                onChange={(e) => onChange({ url: e.target.value || null })}
                dir="ltr"
                className="h-8 text-left font-mono text-xs"
                placeholder="https://"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-[0.7rem]">داده کال‌بک (اختیاری)</Label>
              <Input
                value={button.callbackData ?? ""}
                onChange={(e) => onChange({ callbackData: e.target.value || null })}
                dir="ltr"
                className="h-8 text-left font-mono text-xs"
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
                  className="h-8 w-20 text-sm"
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
            <Button variant="ghost" size="sm" onClick={onDelete} disabled={deleting} className="gap-2 text-destructive hover:text-destructive">
              {deleting ? <Loader2Icon className="size-3.5 animate-spin" /> : <Trash2Icon className="size-3.5" />}
              حذف
            </Button>
            <Button size="sm" onClick={onSave} disabled={!dirty || saving} className="gap-2">
              {saving ? <Loader2Icon className="size-3.5 animate-spin" /> : <SaveIcon className="size-3.5" />}
              ذخیره
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Live Preview
// ---------------------------------------------------------------------
function LivePreview({ buttons }: { buttons: GlassButtonRow[] }) {
  // Group enabled buttons by rowOrder. Each unique rowOrder is one row.
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
        <div
          key={i}
          className="flex flex-wrap gap-2 rounded-md border bg-muted/30 p-3"
        >
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

// ---------------------------------------------------------------------
// Main View
// ---------------------------------------------------------------------
export function GlassButtonsView({ destinationId, navigate }: GlassButtonsViewProps) {
  const qc = useQueryClient();
  const [localButtons, setLocalButtons] = useState<GlassButtonRow[]>([]);
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);

  // Fetch destination (for header).
  const destQ = useQuery({
    queryKey: ["destinations", "single", destinationId] as const,
    queryFn: () => api.getDestination(destinationId),
    staleTime: 30_000,
  });

  // Fetch buttons.
  const buttonsQ = useQuery({
    queryKey: ["destinations", "buttons", destinationId] as const,
    queryFn: () => api.listButtons(destinationId),
    staleTime: 5_000,
  });

  // Sync server data → local editable copy (only when not actively editing).
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
    setDeletingId(b.id);
    try {
      await api.deleteButton(destinationId, b.id);
      toast.success("دکمه حذف شد.");
      // Optimistic local update.
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
      // Create a fresh button with the next available rowOrder. The backend
      // requires either url or callbackData — supply a placeholder URL.
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
      void qc.invalidateQueries({ queryKey: ["destinations", "buttons", destinationId] });
    },
    onError: (e: Error) => toast.error(e.message ?? "ساخت دکمه ناموفق بود."),
  });

  async function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = sortedLocal.findIndex((b) => b.id === active.id);
    const newIndex = sortedLocal.findIndex((b) => b.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    setReordering(true);
    try {
      const reordered = arrayMove(sortedLocal, oldIndex, newIndex);
      // Reassign rowOrder values 0..n-1 to keep the order stable and
      // contiguous. Persist each change.
      const updates: Promise<unknown>[] = [];
      for (let i = 0; i < reordered.length; i++) {
        const b = reordered[i];
        if (b.rowOrder !== i) {
          updates.push(
            api.updateButton(destinationId, b.id, { rowOrder: i }),
          );
        }
      }
      await Promise.all(updates);
      // Apply local optimistic reordering immediately.
      setLocalButtons((prev) => {
        const map = new Map(prev.map((b) => [b.id, b]));
        const out: GlassButtonRow[] = [];
        for (const b of reordered) {
          const orig = map.get(b.id);
          if (orig) out.push({ ...orig, rowOrder: reordered.indexOf(orig) });
        }
        // Add any buttons not in `reordered` (shouldn't happen but safe).
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
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div className="flex flex-col gap-1">
            <CardTitle className="flex items-center gap-3">
              دکمه‌های شیشه‌ای
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
          <Button variant="ghost" size="sm" onClick={() => (navigate ? navigate("/dashboard/destinations") : (() => { if (typeof window !== "undefined") window.history.back(); })())} className="gap-2">
            <ArrowRightIcon className="size-4" />
            بازگشت
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Left: editor list */}
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
                  <Button size="sm" onClick={() => createMut.mutate()} disabled={createMut.isPending} className="mt-2 gap-2">
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
                    className="gap-2"
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

            {/* Right: live preview */}
            <div className="flex flex-col gap-3">
              <Label>پیش‌نمایش زنده</Label>
              <LivePreview buttons={localButtons} />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default GlassButtonsView;
