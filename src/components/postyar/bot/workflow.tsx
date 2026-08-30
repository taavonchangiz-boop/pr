"use client";
// =====================================================================
// POSTYAR — Bot Workflow Editor
// ---------------------------------------------------------------------
// Two render modes:
//   • With a pre-selected bot (botId !== undefined) — existing flow.
//     Lists that bot's workflows + editor.
//   • Without a pre-selected bot (botId === undefined) — "all workflows"
//     mode: fetches ALL the user's bots, then each bot's workflows, and
//     renders them in a unified list with a "bot" badge. A bot filter
//     Select is offered so the user can narrow down to one bot if they
//     like. The "create new" dialog requires picking a target bot.
//
// Bot-less templates:
//   A separate "templates" section stores JSON-only workflow definitions
//   in localStorage (key: postyar:bot-workflow-templates). These can be
//   created/edited/deleted with no bot bound. They have a «انتقال به بات»
//   action that copies the template's steps to a real BotWorkflow row on
//   the chosen bot (via POST /api/bots/[id]/workflows).
//
// Persistence approach (documented in worklog):
//   The Prisma schema's `BotWorkflow.botId` is non-nullable. To support
//   bot-less workflows without touching the schema, we keep bot-less
//   templates in localStorage (client-side). When the user picks a
//   target bot, the template is promoted to a real BotWorkflow row via
//   the existing /api/bots/[id]/workflows endpoint. No new server
//   endpoints are needed.
//
// Each workflow is edited in-place: triggers, actions, conditions,
// sortable steps (@dnd-kit/sortable), and a simple flow diagram.
// =====================================================================
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowDownIcon,
  BotIcon,
  ChevronDownIcon,
  CircleIcon,
  CircleDotIcon,
  CopyIcon,
  FlagIcon,
  LayoutTemplateIcon,
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
  type BotListRow,
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

function toFa(n: number): string {
  return n.toString().replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

// =====================================================================
// localStorage template store (bot-less workflows)
// =====================================================================
const TEMPLATE_KEY = "postyar:bot-workflow-templates";

export interface WorkflowTemplate {
  id: string;
  name: string;
  enabled: boolean;
  steps: WorkflowStep[];
  triggerKind: "message" | "command" | "callback";
  triggerValue: string | null;
  createdAt: string;
  updatedAt: string;
}

function loadTemplates(): WorkflowTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(TEMPLATE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as WorkflowTemplate[];
  } catch {
    return [];
  }
}

function persistTemplates(items: WorkflowTemplate[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TEMPLATE_KEY, JSON.stringify(items));
  } catch {
    /* ignore quota errors */
  }
}

// =====================================================================
// Main view
// =====================================================================
export interface BotWorkflowViewProps {
  /** Optional — when omitted, the view lists workflows across all the
   *  user's bots plus a templates section. */
  botId?: string;
  navigate: (to: string) => void;
}

export function BotWorkflowView({ botId, navigate: _navigate }: BotWorkflowViewProps) {
  void _navigate;
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTriggerKind, setNewTriggerKind] = useState<"message" | "command" | "callback">("command");
  const [newTriggerValue, setNewTriggerValue] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  // For the no-bot case: target-bot picker in the "new workflow" dialog.
  const [targetBotId, setTargetBotId] = useState<string>("");
  // For the no-bot case: bot filter applied to the unified list.
  const [botFilter, setBotFilter] = useState<string>("all");
  // Templates local state (kept in sync with localStorage).
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  useEffect(() => { setTemplates(loadTemplates()); }, []);
  function commitTemplates(next: WorkflowTemplate[]) {
    setTemplates(next);
    persistTemplates(next);
  }

  // ----- All-bots list (only when no botId) -----
  const botsQ = useQuery({
    queryKey: ["bots", "list"],
    queryFn: () => api.getBotsFull(),
    staleTime: 15_000,
    enabled: !botId,
  });
  const bots: BotListRow[] = botsQ.data ?? [];

  // ----- Single-bot workflows (existing flow, only when botId) -----
  const singleQ = useQuery({
    queryKey: ["bot", "workflows", botId ?? ""],
    queryFn: () => api.getBotWorkflows(botId as string),
    staleTime: 15_000,
    enabled: !!botId,
  });

  // ----- Per-bot workflows for the unified (no-botId) view -----
  // We fetch each bot's workflows in parallel using a "meta" query that
  // depends on the bots list.
  const unifiedQ = useQuery({
    queryKey: ["bot", "workflows", "all", bots.map((b) => b.id).join(",")] as const,
    queryFn: async (): Promise<Array<{ botId: string; botName: string; workflow: WorkflowRow }>> => {
      const results = await Promise.all(
        bots.map(async (b) => {
          try {
            const items = await api.getBotWorkflows(b.id);
            return items.map((w) => ({ botId: b.id, botName: b.name, workflow: w }));
          } catch {
            return [];
          }
        }),
      );
      return results.flat();
    },
    staleTime: 15_000,
    enabled: !botId && bots.length > 0,
  });

  const serverWorkflows = botId
    ? (singleQ.data ?? []).map((w) => ({ botId, botName: undefined as string | undefined, workflow: w }))
    : (unifiedQ.data ?? []).filter((row) => botFilter === "all" || row.botId === botFilter);

  // ----- Create (server) -----
  const createMut = useMutation({
    mutationFn: async (targetId: string) =>
      api.createBotWorkflow(targetId, {
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
      setTargetBotId("");
      if (botId) {
        qc.invalidateQueries({ queryKey: ["bot", "workflows", botId] });
      } else {
        qc.invalidateQueries({ queryKey: ["bot", "workflows", "all"] });
        qc.invalidateQueries({ queryKey: ["bots", "list"] });
      }
    },
    onError: (e: Error) => toast.error(e.message ?? "ساخت گردش کار ناموفق بود."),
  });

  // ----- Create template (localStorage) -----
  function createTemplate() {
    const t: WorkflowTemplate = {
      id: `tpl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name: newName.trim() || "گردش کار بدون بات",
      enabled: true,
      steps: [makeStep("start")],
      triggerKind: newTriggerKind,
      triggerValue: newTriggerValue.trim() || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    commitTemplates([t, ...templates]);
    toast.success("قالب گردش کار ساخته شد (ذخیره‌سازی محلی).");
    setShowCreate(false);
    setNewName("");
    setNewTriggerValue("");
    setNewTriggerKind("command");
  }

  // ----- Delete server -----
  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteBotWorkflow(botId as string, id),
    onSuccess: () => {
      toast.success("گردش کار حذف شد.");
      setDeleteId(null);
      qc.invalidateQueries({ queryKey: ["bot", "workflows", botId ?? ""] });
    },
    onError: (e: Error) => toast.error(e.message ?? "حذف ناموفق بود."),
  });

  // ----- Delete template -----
  function deleteTemplate(id: string) {
    commitTemplates(templates.filter((t) => t.id !== id));
    toast.success("قالب حذف شد.");
    setDeleteId(null);
  }

  const isLoading = botId ? singleQ.isLoading : (botsQ.isLoading || (unifiedQ.isLoading && bots.length > 0));
  const isError = botId ? !!singleQ.error : !!botsQ.error;

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <WorkflowIcon className="size-6" />
            گردش کار ربات
            {!botId && (
              <Badge variant="outline" className="font-normal text-xs">همهٔ بات‌ها</Badge>
            )}
          </h1>
          <p className="text-sm text-muted-foreground">
            {botId
              ? "گردش کارهای چت‌بات را ویرایش و مرتب کنید. هر گردش کار شامل یک گام شروع و چندین گام است."
              : "همهٔ گردش کارهای شما در بات‌هایتان + قالب‌های بدون بات. با انتخاب یک بات، فقط گردش کارهای همان بات را ببینید."}
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
          <PlusIcon className="size-4" />
          گردش کار جدید
        </Button>
      </div>

      {/* Templates (bot-less) section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <LayoutTemplateIcon className="size-4" />
            قالب‌های بدون بات
            <Badge variant="secondary" className="font-normal">{toFa(templates.length)}</Badge>
          </CardTitle>
          <CardDescription>
            قالب‌های گردش کار که به بات خاصی متصل نیستند. برای استفاده، آن‌ها را به یک بات منتقل کنید.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {templates.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center text-sm text-muted-foreground">
              <LayoutTemplateIcon className="size-6 opacity-50" />
              <div>هنوز قالبی نساخته‌اید.</div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {templates.map((t) => (
                <TemplateEditorCard
                  key={t.id}
                  template={t}
                  bots={bots}
                  onChange={(next) => commitTemplates(templates.map((x) => x.id === next.id ? next : x))}
                  onDelete={() => setDeleteId(t.id)}
                  onPromote={async (targetId: string) => {
                    try {
                      await api.createBotWorkflow(targetId, {
                        name: t.name,
                        steps: t.steps,
                        triggerKind: t.triggerKind,
                        triggerValue: t.triggerValue,
                      });
                      toast.success("قالب به بات منتقل شد.");
                      if (botId) {
                        qc.invalidateQueries({ queryKey: ["bot", "workflows", botId] });
                      } else {
                        qc.invalidateQueries({ queryKey: ["bot", "workflows", "all"] });
                      }
                    } catch (e) {
                      const err = e as Error;
                      toast.error(err.message ?? "انتقال ناموفق بود.");
                    }
                  }}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bot filter (only in unified mode) */}
      {!botId && bots.length > 0 && (
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">فیلتر بات:</Label>
          <Select value={botFilter} onValueChange={setBotFilter}>
            <SelectTrigger className="w-64 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">همهٔ بات‌ها</SelectItem>
              {bots.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name} <span dir="ltr" className="text-[10px] text-muted-foreground">{b.provider}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Server workflows */}
      {isLoading && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      )}
      {isError && (
        <div className="p-4 text-sm text-destructive">بارگذاری گردش کارها ناموفق بود.</div>
      )}
      {!isLoading && serverWorkflows.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
            <WorkflowIcon className="size-8 opacity-50" />
            <div>
              {botId
                ? "هنوز گردش کاری نساخته‌اید."
                : bots.length === 0
                  ? "هنوز باتی نساخته‌اید. ابتدا یک بات بسازید."
                  : "موردی یافت نشد."}
            </div>
            {botId && (
              <Button size="sm" variant="outline" onClick={() => setShowCreate(true)} className="cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                <PlusIcon className="size-4" /> گردش کار جدید
              </Button>
            )}
            {!botId && bots.length === 0 && (
              <Button size="sm" variant="outline" onClick={() => setShowCreate(true)} className="cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                <PlusIcon className="size-4" /> ساخت قالب بدون بات
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-4">
        {serverWorkflows.map(({ botId: wBotId, botName, workflow }) => (
          <WorkflowEditorCard
            key={workflow.id}
            botId={wBotId}
            botName={botName}
            workflow={workflow}
            onDelete={() => setDeleteId(workflow.id)}
          />
        ))}
      </div>

      {/* New workflow dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>گردش کار جدید</DialogTitle>
            <DialogDescription>
              {botId
                ? "یک گردش کار جدید با یک گام «شروع» پیش‌فرض ساخته می‌شود. سپس می‌توانید گام‌های دیگر را اضافه کنید."
                : "یک بات هدف انتخاب کنید تا گردش کار روی آن ساخته شود، یا «قالب بدون بات» را برای ذخیره‌سازی محلی انتخاب کنید."}
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (botId) {
                createMut.mutate(botId);
              } else if (targetBotId === "template") {
                createTemplate();
              } else if (targetBotId) {
                createMut.mutate(targetBotId);
              } else {
                toast.error("یک بات هدف انتخاب کنید یا «قالب بدون بات» را بزنید.");
              }
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
            {!botId && (
              <div className="flex flex-col gap-1.5">
                <Label>بات هدف</Label>
                <Select value={targetBotId} onValueChange={setTargetBotId}>
                  <SelectTrigger className="w-full cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"><SelectValue placeholder="انتخاب بات…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="template">
                      <span className="flex items-center gap-2">
                        <LayoutTemplateIcon className="size-3" />
                        قالب بدون بات (ذخیره محلی)
                      </span>
                    </SelectItem>
                    {bots.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        <span className="flex items-center gap-2">
                          <BotIcon className="size-3" />
                          {b.name}
                          <span dir="ltr" className="text-[10px] text-muted-foreground">{b.provider}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label>نوع راه‌انداز</Label>
              <Select value={newTriggerKind} onValueChange={(v) => setNewTriggerKind(v as typeof newTriggerKind)}>
                <SelectTrigger className="w-full cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"><SelectValue /></SelectTrigger>
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
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)} className="cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">انصراف</Button>
              <Button
                type="submit"
                disabled={createMut.isPending || newName.trim().length < 2 || (!botId && !targetBotId)}
                className="cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
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
            <AlertDialogCancel className="cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">انصراف</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              onClick={() => {
                if (!deleteId) return;
                if (botId) {
                  deleteMut.mutate(deleteId);
                } else {
                  // Maybe a template or a server workflow in unified mode
                  const tpl = templates.find((t) => t.id === deleteId);
                  if (tpl) deleteTemplate(deleteId);
                  else if (targetBotId) deleteMut.mutate(deleteId);
                  else toast.error("برای حذف، ابتدا یک بات را در فیلتر انتخاب کنید.");
                }
              }}
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
  botName?: string;
  workflow: WorkflowRow;
  onDelete: () => void;
}

function WorkflowEditorCard({ botId, botName, workflow, onDelete }: WorkflowEditorCardProps) {
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
      qc.invalidateQueries({ queryKey: ["bot", "workflows", "all"] });
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
              <Button variant="ghost" size="sm" className="cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
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
            {botName && (
              <Badge variant="outline" className="font-normal">
                <BotIcon className="size-3 ml-1" />
                {botName}
              </Badge>
            )}
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
                className="cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {saveMut.isPending ? <Loader2Icon className="size-4 animate-spin" /> : <SaveIcon className="size-4" />}
                ذخیره
              </Button>
              <Button variant="ghost" size="sm" onClick={onDelete} className="cursor-pointer text-destructive hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
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
                      <SelectTrigger className="w-full cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"><SelectValue /></SelectTrigger>
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
                        <SelectTrigger className="w-full cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {STEP_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button size="icon" onClick={addStep} title="افزودن گام" className="cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
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

// ---------------------------------------------------------------------
// Template editor card — localStorage-backed, with «انتقال به بات»
// ---------------------------------------------------------------------
interface TemplateEditorCardProps {
  template: WorkflowTemplate;
  bots: BotListRow[];
  onChange: (next: WorkflowTemplate) => void;
  onDelete: () => void;
  onPromote: (targetBotId: string) => void;
}

function TemplateEditorCard({ template, bots, onChange, onDelete, onPromote }: TemplateEditorCardProps) {
  const [steps, setSteps] = useState<WorkflowStep[]>(template.steps);
  const [name, setName] = useState(template.name);
  const [enabled, setEnabled] = useState(template.enabled);
  const [triggerKind, setTriggerKind] = useState(template.triggerKind);
  const [triggerValue, setTriggerValue] = useState(template.triggerValue ?? "");
  const [addType, setAddType] = useState<WorkflowStepType>("message");
  const [open, setOpen] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [promoteBotId, setPromoteBotId] = useState<string>("");
  const [promoting, setPromoting] = useState(false);

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

  function save() {
    onChange({
      ...template,
      name: name.trim(),
      enabled,
      steps,
      triggerKind,
      triggerValue: triggerValue.trim() || null,
      updatedAt: new Date().toISOString(),
    });
    setDirty(false);
    toast.success("قالب ذخیره شد (ذخیره‌سازی محلی).");
  }

  const hasStart = useMemo(() => steps.some((s) => s.type === "start"), [steps]);

  async function promote() {
    if (!promoteBotId) {
      toast.error("یک بات هدف انتخاب کنید.");
      return;
    }
    setPromoting(true);
    try {
      await onPromote(promoteBotId);
    } finally {
      setPromoting(false);
    }
  }

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-3">
        <Collapsible open={open} onOpenChange={setOpen}>
          <div className="flex flex-wrap items-center gap-3">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
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
            <Badge variant="outline" className="font-normal">
              <LayoutTemplateIcon className="size-3 ml-1" />
              قالب (بدون بات)
            </Badge>
            <Switch checked={enabled} onCheckedChange={(v) => { setEnabled(v); setDirty(true); }} />
            <div className="ml-auto flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={save} disabled={!dirty || !hasStart || name.trim().length < 2}
                className="cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                <SaveIcon className="size-4" /> ذخیره
              </Button>
              <Button variant="ghost" size="sm" onClick={onDelete} className="cursor-pointer text-destructive hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                <Trash2Icon className="size-4" />
              </Button>
            </div>
          </div>
          <CollapsibleContent>
            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_280px]">
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">راه‌انداز</Label>
                    <Select value={triggerKind} onValueChange={(v) => { setTriggerKind(v as typeof triggerKind); setDirty(true); }}>
                      <SelectTrigger className="w-full cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"><SelectValue /></SelectTrigger>
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
                        <SelectTrigger className="w-full cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {STEP_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button size="icon" onClick={addStep} title="افزودن گام" className="cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                      <PlusIcon className="size-4" />
                    </Button>
                  </div>
                </div>
                {!hasStart && (
                  <div className="rounded-md border border-amber-500/50 bg-amber-50 p-2 text-xs text-amber-700">
                    هر گردش کار باید حداقل یک گام «شروع» داشته باشد.
                  </div>
                )}
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
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
              <div className="flex flex-col gap-3">
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
                {/* Promote to a real bot */}
                <div className="rounded-md border border-dashed border-primary/40 bg-primary/5 p-3">
                  <div className="mb-2 text-xs font-medium">انتقال به بات</div>
                  <div className="flex flex-col gap-2">
                    <Select value={promoteBotId} onValueChange={setPromoteBotId}>
                      <SelectTrigger className="w-full cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"><SelectValue placeholder="انتخاب بات هدف…" /></SelectTrigger>
                      <SelectContent>
                        {bots.length === 0 ? (
                          <SelectItem value="_none" disabled>ابتدا یک بات بسازید</SelectItem>
                        ) : (
                          bots.map((b) => (
                            <SelectItem key={b.id} value={b.id}>
                              {b.name} <span dir="ltr" className="text-[10px] text-muted-foreground">{b.provider}</span>
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      onClick={promote}
                      disabled={promoting || !promoteBotId || !hasStart || name.trim().length < 2 || bots.length === 0}
                      className="cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      {promoting ? <Loader2Icon className="size-4 animate-spin" /> : <CopyIcon className="size-4" />}
                      انتقال به بات
                    </Button>
                  </div>
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
        <Button variant="ghost" size="sm" className="ml-auto cursor-pointer text-destructive hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" onClick={onRemove}>
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
          : "خروج از گردش کار. هیچ پیکربندی لازم نیست."}
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
                <SelectTrigger className="w-24 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"><SelectValue /></SelectTrigger>
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
                className="cursor-pointer text-destructive hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                onClick={() => onChange({ buttons: (step.buttons ?? []).filter((_, j) => j !== i) })}
              >
                <Trash2Icon className="size-4" />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="w-fit cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
            <SelectTrigger className="w-full cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"><SelectValue /></SelectTrigger>
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
              <SelectTrigger className="w-full cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"><SelectValue /></SelectTrigger>
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
      <SelectTrigger className="w-full cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"><SelectValue placeholder="—" /></SelectTrigger>
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

void SparklesIcon; // kept for future empty-state polish

export default BotWorkflowView;
