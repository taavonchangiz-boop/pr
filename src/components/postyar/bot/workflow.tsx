"use client";
// =====================================================================
// POSTYAR — Bot Workflow Editor
// ---------------------------------------------------------------------
// Lists existing workflows + «گردش کار جدید» dialog. For each workflow
// the user can add / remove / reorder steps (start, message, condition,
// action, end) and edit per-step config. Reordering uses @dnd-kit/sortable.
// Saves via PATCH /api/bots/[botId]/workflows/[workflowId].
// Includes a simple flow diagram (boxes + arrows) for visualization.
// =====================================================================
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowDownIcon,
  ChevronDownIcon,
  CircleIcon,
  CircleDotIcon,
  FlagIcon,
  Loader2Icon,
  PlusIcon,
  SaveIcon,
  SparklesIcon,
  SquareIcon,
  Trash2Icon,
  Wand2Icon,
  WorkflowIcon,
} from "lucide-react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  api,
  type WorkflowRow,
  type WorkflowStep,
  type WorkflowStepType,
  type ConditionKind,
  type ActionKind,
  type WorkflowButton,
} from "@/components/postyar/api";

const STEP_TYPES: Array<{ value: WorkflowStepType; label: string; icon: typeof CircleIcon }> = [
  { value: "start", label: "شروع", icon: CircleDotIcon },
  { value: "message", label: "پیام", icon: CircleIcon },
  { value: "condition", label: "شرط", icon: WorkflowIcon },
  { value: "action", label: "اکشن", icon: Wand2Icon },
  { value: "end", label: "پایان", icon: FlagIcon },
];

const CONDITION_KINDS: Array<{ value: ConditionKind; label: string }> = [
  { value: "subscription_active", label: "اشتراک فعال" },
  { value: "plan", label: "نوع پلن" },
  { value: "referral", label: "معرفی" },
  { value: "keyword", label: "کلمه کلیدی" },
  { value: "order_status", label: "وضعیت سفارش" },
  { value: "provider_context", label: "زمینه پروایدر" },
  { value: "user_state", label: "وضعیت کاربر" },
];

const ACTION_KINDS: Array<{ value: ActionKind; label: string }> = [
  { value: "send_message", label: "ارسال پیام" },
  { value: "show_menu", label: "نمایش منو" },
  { value: "create_ticket", label: "ایجاد تیکت" },
  { value: "show_subscription", label: "نمایش اشتراک" },
  { value: "show_wallet", label: "نمایش کیف پول" },
  { value: "initiate_payment", label: "شروع پرداخت" },
  { value: "show_gold", label: "نمایش طلا" },
  { value: "invoke_ai", label: "فراخوانی هوش مصنوعی" },
  { value: "show_order", label: "نمایش سفارش" },
  { value: "send_content", label: "ارسال محتوا" },
  { value: "create_notification", label: "ساخت اعلان" },
];

let stepIdCounter = 0;
function newStepId(): string {
  stepIdCounter += 1;
  return `step-${Date.now().toString(36)}-${stepIdCounter}`;
}

function makeStep(type: WorkflowStepType): WorkflowStep {
  const base: WorkflowStep = { id: newStepId(), type };
  if (type === "message") base.text = "";
  if (type === "condition") base.condition = { kind: "keyword", value: "" };
  if (type === "action") base.action = { kind: "send_message", config: {} };
  return base;
}

export interface BotWorkflowViewProps {
  botId: string;
  navigate: (to: string) => void;
}

export function BotWorkflowView({ botId, navigate: _navigate }: BotWorkflowViewProps) {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTriggerKind, setNewTriggerKind] = useState<"message" | "command" | "callback">("command");
  const [newTriggerValue, setNewTriggerValue] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["bot", "workflows", botId],
    queryFn: () => api.getBotWorkflows(botId),
    staleTime: 15_000,
  });

  const createMut = useMutation({
    mutationFn: () =>
      api.createBotWorkflow(botId, {
        name: newName.trim(),
        steps: [makeStep("start")],
        triggerKind: newTriggerKind,
        triggerValue: newTriggerValue.trim() || null,
      }),
    onSuccess: () => {
      toast.success("گردش کار ساخته شد.");
      setShowCreate(false);
      setNewName("");
      setNewTriggerValue("");
      setNewTriggerKind("command");
      qc.invalidateQueries({ queryKey: ["bot", "workflows", botId] });
    },
    onError: (e: Error) => toast.error(e.message ?? "ساخت گردش کار ناموفق بود."),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteBotWorkflow(botId, id),
    onSuccess: () => {
      toast.success("گردش کار حذف شد.");
      setDeleteId(null);
      qc.invalidateQueries({ queryKey: ["bot", "workflows", botId] });
    },
    onError: (e: Error) => toast.error(e.message ?? "حذف ناموفق بود."),
  });

  const workflows = q.data ?? [];

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <WorkflowIcon className="size-6" />
            گردش کار ربات
          </h1>
          <p className="text-sm text-muted-foreground">
            گردش کارهای چت‌بات را ویرایش و مرتب کنید. هر گردش کار شامل یک گام شروع و چندین گام است.
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <PlusIcon className="size-4" />
          گردش کار جدید
        </Button>
      </div>

      {q.isLoading && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      )}
      {q.error && (
        <div className="p-4 text-sm text-destructive">بارگذاری گردش کارها ناموفق بود.</div>
      )}
      {!q.isLoading && workflows.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
            <WorkflowIcon className="size-8 opacity-50" />
            <div>هنوز گردش کاری نساخته‌اید.</div>
            <Button size="sm" variant="outline" onClick={() => setShowCreate(true)}>
              <PlusIcon className="size-4" /> گردش کار جدید
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-4">
        {workflows.map((wf) => (
          <WorkflowEditorCard key={wf.id} botId={botId} workflow={wf} onDelete={() => setDeleteId(wf.id)} />
        ))}
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>گردش کار جدید</DialogTitle>
            <DialogDescription>
              یک گردش کار جدید با یک گام «شروع» پیش‌فرض ساخته می‌شود. سپس می‌توانید گام‌های دیگر را اضافه کنید.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              createMut.mutate();
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wf-name">نام گردش کار</Label>
              <Input
                id="wf-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={120}
                placeholder="مثلاً: شروع / راهنما / پرداخت"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>نوع راه‌انداز</Label>
              <Select value={newTriggerKind} onValueChange={(v) => setNewTriggerKind(v as typeof newTriggerKind)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="message">هر پیام</SelectItem>
                  <SelectItem value="command">دستور</SelectItem>
                  <SelectItem value="callback">کالبک</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {newTriggerKind !== "message" && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="wf-trigger">مقدار راه‌انداز</Label>
                <Input
                  id="wf-trigger"
                  value={newTriggerValue}
                  onChange={(e) => setNewTriggerValue(e.target.value)}
                  dir="ltr"
                  placeholder={newTriggerKind === "command" ? "مثلاً: /start" : "callback_data"}
                  maxLength={200}
                />
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>انصراف</Button>
              <Button type="submit" disabled={createMut.isPending || newName.trim().length < 2}>
                {createMut.isPending ? <Loader2Icon className="size-4 animate-spin" /> : null}
                ایجاد
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف گردش کار</AlertDialogTitle>
            <AlertDialogDescription>
              این گردش کار غیرفعال می‌شود (حذف نرم). تاریخچه و رد ممیزی حفظ می‌شود.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteMut.mutate(deleteId)}
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------------------------------------------------------------------
// Single workflow editor card — sortable step list + flow diagram
// ---------------------------------------------------------------------
interface WorkflowEditorCardProps {
  botId: string;
  workflow: WorkflowRow;
  onDelete: () => void;
}

function WorkflowEditorCard({ botId, workflow, onDelete }: WorkflowEditorCardProps) {
  const qc = useQueryClient();
  const [steps, setSteps] = useState<WorkflowStep[]>(workflow.steps);
  const [name, setName] = useState(workflow.name);
  const [enabled, setEnabled] = useState(workflow.enabled);
  const [triggerKind, setTriggerKind] = useState(workflow.triggerKind);
  const [triggerValue, setTriggerValue] = useState(workflow.triggerValue ?? "");
  const [addType, setAddType] = useState<WorkflowStepType>("message");
  const [open, setOpen] = useState(true);
  const [dirty, setDirty] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } as any }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function patch(updater: (cur: WorkflowStep[]) => WorkflowStep[]) {
    setSteps((cur) => {
      const next = updater(cur);
      setDirty(true);
      return next;
    });
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    patch((cur) => {
      const fromIdx = cur.findIndex((s) => s.id === active.id);
      const toIdx = cur.findIndex((s) => s.id === over.id);
      if (fromIdx < 0 || toIdx < 0) return cur;
      return arrayMove(cur, fromIdx, toIdx);
    });
  }

  function addStep() {
    patch((cur) => [...cur, makeStep(addType)]);
  }

  function removeStep(id: string) {
    patch((cur) => cur.filter((s) => s.id !== id));
  }

  function updateStep(id: string, partial: Partial<WorkflowStep>) {
    patch((cur) => cur.map((s) => (s.id === id ? { ...s, ...partial } : s)));
  }

  const saveMut = useMutation({
    mutationFn: () =>
      api.updateBotWorkflow(botId, workflow.id, {
        name: name.trim(),
        enabled,
        triggerKind,
        triggerValue: triggerValue.trim() || null,
        steps,
      }),
    onSuccess: () => {
      toast.success("گردش کار ذخیره شد.");
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["bot", "workflows", botId] });
    },
    onError: (e: Error) => toast.error(e.message ?? "ذخیره ناموفق بود."),
  });

  const hasStart = useMemo(() => steps.some((s) => s.type === "start"), [steps]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <Collapsible open={open} onOpenChange={setOpen}>
          <div className="flex flex-wrap items-center gap-3">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm">
                <ChevronDownIcon className={cn("size-4 transition-transform", open ? "" : "-rotate-90")} />
              </Button>
            </CollapsibleTrigger>
            <Input
              value={name}
              onChange={(e) => { setName(e.target.value); setDirty(true); }}
              className="max-w-xs"
              maxLength={120}
            />
            <Badge variant={enabled ? "default" : "secondary"}>
              {enabled ? "فعال" : "غیرفعال"}
            </Badge>
            <Switch
              checked={enabled}
              onCheckedChange={(v) => { setEnabled(v); setDirty(true); }}
            />
            <div className="ml-auto flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => saveMut.mutate()}
                disabled={saveMut.isPending || !dirty || !hasStart || name.trim().length < 2}
              >
                {saveMut.isPending ? <Loader2Icon className="size-4 animate-spin" /> : <SaveIcon className="size-4" />}
                ذخیره
              </Button>
              <Button variant="ghost" size="sm" onClick={onDelete} className="text-destructive hover:text-destructive">
                <Trash2Icon className="size-4" />
              </Button>
            </div>
          </div>
          <CollapsibleContent>
            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_280px]">
              <div className="flex flex-col gap-3">
                {/* Trigger + step adder */}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">راه‌انداز</Label>
                    <Select value={triggerKind} onValueChange={(v) => { setTriggerKind(v as typeof triggerKind); setDirty(true); }}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="message">هر پیام</SelectItem>
                        <SelectItem value="command">دستور</SelectItem>
                        <SelectItem value="callback">کالبک</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">مقدار راه‌انداز</Label>
                    <Input
                      value={triggerValue}
                      onChange={(e) => { setTriggerValue(e.target.value); setDirty(true); }}
                      dir="ltr"
                      disabled={triggerKind === "message"}
                      placeholder={triggerKind === "command" ? "/start" : "callback_data"}
                    />
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <Label className="text-xs">افزودن گام</Label>
                      <Select value={addType} onValueChange={(v) => setAddType(v as WorkflowStepType)}>
                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {STEP_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button size="icon" onClick={addStep} title="افزودن گام">
                      <PlusIcon className="size-4" />
                    </Button>
                  </div>
                </div>
                {!hasStart && (
                  <div className="rounded-md border border-amber-500/50 bg-amber-50 p-2 text-xs text-amber-700">
                    هر گردش کار باید حداقل یک گام «شروع» داشته باشد.
                  </div>
                )}
                {/* Sortable list */}
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext items={steps.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                    <div className="flex flex-col gap-2">
                      {steps.map((s, idx) => (
                        <SortableStep
                          key={s.id}
                          step={s}
                          index={idx}
                          allSteps={steps}
                          onChange={(partial) => updateStep(s.id, partial)}
                          onRemove={() => removeStep(s.id)}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>
              {/* Flow diagram */}
              <div className="rounded-md border bg-muted/20 p-3">
                <div className="mb-2 text-xs font-medium text-muted-foreground">نمودار گردش کار</div>
                <div className="flex flex-col items-center gap-1">
                  {steps.map((s, idx) => {
                    const Icon = STEP_TYPES.find((t) => t.value === s.type)?.icon ?? CircleIcon;
                    return (
                      <div key={s.id} className="flex w-full flex-col items-center gap-1">
                        <div className="flex w-full items-center gap-2 rounded-md border bg-background px-3 py-2 text-xs">
                          <Icon className="size-4 shrink-0" />
                          <div className="flex-1 truncate">
                            <span className="font-medium">{STEP_TYPES.find((t) => t.value === s.type)?.label}</span>
                            {s.text && <span className="text-muted-foreground"> — {s.text.slice(0, 30)}</span>}
                            {s.action && <span className="text-muted-foreground"> — {ACTION_KINDS.find((a) => a.value === s.action?.kind)?.label}</span>}
                          </div>
                          <span className="text-[10px] text-muted-foreground">{toFa(idx + 1)}</span>
                        </div>
                        {idx < steps.length - 1 && <ArrowDownIcon className="size-3 text-muted-foreground" />}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardHeader>
      <CardContent className="pt-0" />
    </Card>
  );
}

function toFa(n: number): string {
  return n.toString().replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

// ---------------------------------------------------------------------
// Sortable step row
// ---------------------------------------------------------------------
function SortableStep({
  step,
  index,
  allSteps,
  onChange,
  onRemove,
}: {
  step: WorkflowStep;
  index: number;
  allSteps: WorkflowStep[];
  onChange: (partial: Partial<WorkflowStep>) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  const Icon = STEP_TYPES.find((t) => t.value === step.type)?.icon ?? CircleIcon;
  const stepLabel = STEP_TYPES.find((t) => t.value === step.type)?.label ?? step.type;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-md border bg-card p-3",
        isDragging && "shadow-md",
      )}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing"
          aria-label="جابجایی"
        >
          <SquareIcon className="size-4" />
        </button>
        <Icon className="size-4" />
        <span className="text-sm font-medium">{stepLabel}</span>
        <span className="text-[10px] text-muted-foreground">#{toFa(index + 1)}</span>
        <span dir="ltr" className="font-mono text-[10px] text-muted-foreground">{step.id.slice(-6)}</span>
        <Button variant="ghost" size="sm" className="ml-auto text-destructive hover:text-destructive" onClick={onRemove}>
          <Trash2Icon className="size-4" />
        </Button>
      </div>
      <StepConfig step={step} allSteps={allSteps} onChange={onChange} />
    </div>
  );
}

function StepConfig({
  step,
  allSteps,
  onChange,
}: {
  step: WorkflowStep;
  allSteps: WorkflowStep[];
  onChange: (partial: Partial<WorkflowStep>) => void;
}) {
  if (step.type === "start" || step.type === "end") {
    return (
      <div className="mt-2 text-xs text-muted-foreground">
        {step.type === "start"
          ? "نقطهٔ ورود گردش کار. هیچ پیکربندی لازم ندارد."
          : "خروج از گردش کار. هیچ پیکربندی لازم ندارد."}
      </div>
    );
  }
  if (step.type === "message") {
    return (
      <div className="mt-2 flex flex-col gap-2">
        <Textarea
          value={step.text ?? ""}
          onChange={(e) => onChange({ text: e.target.value })}
          rows={2}
          maxLength={4000}
          placeholder="متن پیام خروجی..."
        />
        <div className="flex flex-col gap-1">
          <Label className="text-xs">دکمه‌ها (اختیاری)</Label>
          {(step.buttons ?? []).map((btn, i) => (
            <div key={i} className="flex items-center gap-1">
              <Input
                value={btn.label}
                onChange={(e) => onChange({ buttons: updateButton(step.buttons, i, { label: e.target.value }) })}
                placeholder="عنوان دکمه"
                className="flex-1"
              />
              <Select
                value={btn.kind}
                onValueChange={(v) => onChange({ buttons: updateButton(step.buttons, i, { kind: v as "url" | "callback" }) })}
              >
                <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="url">لینک</SelectItem>
                  <SelectItem value="callback">کالبک</SelectItem>
                </SelectContent>
              </Select>
              {btn.kind === "url" ? (
                <Input
                  value={btn.url ?? ""}
                  onChange={(e) => onChange({ buttons: updateButton(step.buttons, i, { url: e.target.value }) })}
                  dir="ltr"
                  placeholder="https://..."
                  className="flex-1"
                />
              ) : (
                <Input
                  value={btn.callbackData ?? ""}
                  onChange={(e) => onChange({ buttons: updateButton(step.buttons, i, { callbackData: e.target.value }) })}
                  dir="ltr"
                  placeholder="callback_data"
                  className="flex-1"
                />
              )}
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive hover:text-destructive"
                onClick={() => onChange({ buttons: (step.buttons ?? []).filter((_, j) => j !== i) })}
              >
                <Trash2Icon className="size-4" />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={() => onChange({ buttons: [...(step.buttons ?? []), { label: "", kind: "callback" } as WorkflowButton] })}
          >
            <PlusIcon className="size-4" /> افزودن دکمه
          </Button>
        </div>
      </div>
    );
  }
  if (step.type === "condition") {
    const cond = step.condition ?? { kind: "keyword" as ConditionKind, value: "" };
    return (
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">نوع شرط</Label>
          <Select value={cond.kind} onValueChange={(v) => onChange({ condition: { ...cond, kind: v as ConditionKind } })}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CONDITION_KINDS.map((c) => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">مقدار شرط</Label>
          <Input
            value={cond.value ?? ""}
            onChange={(e) => onChange({ condition: { ...cond, value: e.target.value } })}
            dir="ltr"
            placeholder="مثلاً: start / pro / paid"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">رفتن به گام (در صورت برقراری)</Label>
          <StepSelect allSteps={allSteps} value={cond.thenStepId ?? ""} onChange={(v) => onChange({ condition: { ...cond, thenStepId: v || undefined } })} />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">رفتن به گام (در صورت عدم برقراری)</Label>
          <StepSelect allSteps={allSteps} value={cond.elseStepId ?? ""} onChange={(v) => onChange({ condition: { ...cond, elseStepId: v || undefined } })} />
        </div>
      </div>
    );
  }
  if (step.type === "action") {
    const act = step.action ?? { kind: "send_message" as ActionKind, config: {} };
    return (
      <div className="mt-2 flex flex-col gap-2">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">نوع اکشن</Label>
            <Select value={act.kind} onValueChange={(v) => onChange({ action: { ...act, kind: v as ActionKind } })}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ACTION_KINDS.map((a) => (
                  <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">رفتن به گام بعدی</Label>
            <StepSelect allSteps={allSteps} value={act.nextStepId ?? ""} onChange={(v) => onChange({ action: { ...act, nextStepId: v || undefined } })} />
          </div>
        </div>
        {(act.kind === "send_message" || act.kind === "send_content") && (
          <Textarea
            value={(act.config?.text as string) ?? ""}
            onChange={(e) => onChange({ action: { ...act, config: { ...act.config, text: e.target.value } } })}
            rows={2}
            maxLength={4000}
            placeholder="متن پیام اکشن..."
          />
        )}
        {act.kind === "invoke_ai" && (
          <Input
            value={(act.config?.prompt as string) ?? ""}
            onChange={(e) => onChange({ action: { ...act, config: { ...act.config, prompt: e.target.value } } })}
            dir="rtl"
            placeholder="پرامپت هوش مصنوعی"
          />
        )}
        {act.kind === "show_menu" && (
          <Input
            value={(act.config?.menuKey as string) ?? ""}
            onChange={(e) => onChange({ action: { ...act, config: { ...act.config, menuKey: e.target.value } } })}
            dir="ltr"
            placeholder="menuKey"
          />
        )}
        {act.kind === "show_gold" && (
          <Input
            value={(act.config?.instrument as string) ?? ""}
            onChange={(e) => onChange({ action: { ...act, config: { ...act.config, instrument: e.target.value } } })}
            dir="ltr"
            placeholder="نوع طلای مرجع (مثلاً: g18)"
          />
        )}
        {act.kind === "initiate_payment" && (
          <Input
            value={(act.config?.amountRials as string) ?? ""}
            onChange={(e) => onChange({ action: { ...act, config: { ...act.config, amountRials: e.target.value } } })}
            dir="ltr"
            inputMode="numeric"
            placeholder="مبلغ (ریال)"
          />
        )}
        {act.kind === "create_ticket" && (
          <Input
            value={(act.config?.subject as string) ?? ""}
            onChange={(e) => onChange({ action: { ...act, config: { ...act.config, subject: e.target.value } } })}
            dir="rtl"
            placeholder="موضوع تیکت"
          />
        )}
      </div>
    );
  }
  return null;
}

function updateButton(buttons: WorkflowButton[] | undefined, i: number, partial: Partial<WorkflowButton>): WorkflowButton[] {
  const list = buttons ?? [];
  return list.map((b, j) => (j === i ? { ...b, ...partial } : b));
}

function StepSelect({
  allSteps,
  value,
  onChange,
}: {
  allSteps: WorkflowStep[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full"><SelectValue placeholder="—" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="">— هیچ —</SelectItem>
        {allSteps.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {STEP_TYPES.find((t) => t.value === s.type)?.label} #{allSteps.indexOf(s) + 1}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default BotWorkflowView;
