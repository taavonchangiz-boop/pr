"use client";
// =====================================================================
// POSTYAR — Gold Bot View
// ---------------------------------------------------------------------
// List of the user's gold bots + «بات طلای جدید».
// Each bot card: enabled switch, instrument select, direction select
// (بالا/پایین/هر دو), thresholdPct number input, intervalMin number
// input, destination select (from user's destinations). Save via
// POST/PATCH /api/gold/bot. Delete via DELETE /api/gold/bot?id=...
//
// Only show "active monitoring" indicator when the bot is genuinely
// enabled (no fake "active" badge).
// =====================================================================
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangleIcon,
  Loader2Icon,
  PlusIcon,
  SaveIcon,
  Trash2Icon,
  TrendingUpIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
  type GoldBotRow,
  type DestinationRow,
} from "@/components/postyar/api";
import { fromPersianDigits, toPersianDigits } from "@/lib/persian";

const INSTRUMENTS: Array<{ key: string; label: string }> = [
  { key: "18k", label: "طلای ۱۸ عیار" },
  { key: "emami", label: "سکه امامی" },
  { key: "bahar_azadi", label: "سکه بهار آزادی" },
  { key: "ounce", label: "انس جهانی" },
];

const DIRECTIONS: Array<{ key: "up" | "down" | "both"; label: string }> = [
  { key: "up", label: "بالا" },
  { key: "down", label: "پایین" },
  { key: "both", label: "هر دو" },
];

interface NewBotState {
  instrument: string;
  direction: "up" | "down" | "both";
  thresholdPct: string;
  intervalMin: string;
  destinationId: string;
}

const DEFAULT_NEW: NewBotState = {
  instrument: "18k",
  direction: "up",
  thresholdPct: "1",
  intervalMin: "15",
  destinationId: "__none__",
};

export function GoldBotView() {
  const qc = useQueryClient();
  const [newBot, setNewBot] = useState<NewBotState>(DEFAULT_NEW);
  const [showForm, setShowForm] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const botsQ = useQuery({
    queryKey: ["gold", "bots"],
    queryFn: () => api.getGoldBots(),
    staleTime: 10_000,
  });
  const destQ = useQuery({
    queryKey: ["destinations"],
    queryFn: () => api.getDestinations(),
    staleTime: 30_000,
  });

  const createMut = useMutation({
    mutationFn: () =>
      api.createGoldBot({
        instrument: newBot.instrument,
        direction: newBot.direction,
        thresholdPct: Number(newBot.thresholdPct) || 0,
        intervalMin: Number(newBot.intervalMin) || 15,
        destinationId: newBot.destinationId === "__none__" ? undefined : newBot.destinationId,
        enabled: false,
      }),
    onSuccess: () => {
      toast.success("بات طلای جدید ساخته شد.");
      setNewBot(DEFAULT_NEW);
      setShowForm(false);
      qc.invalidateQueries({ queryKey: ["gold", "bots"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "ساخت بات ناموفق بود."),
  });

  const updateMut = useMutation({
    mutationFn: (patch: Parameters<typeof api.updateGoldBot>[0]) => api.updateGoldBot(patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gold", "bots"] });
      toast.success("به‌روزرسانی شد.");
    },
    onError: (e: Error) => toast.error(e.message ?? "به‌روزرسانی ناموفق بود."),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteGoldBot(id),
    onSuccess: () => {
      toast.success("بات حذف شد.");
      setDeleteId(null);
      qc.invalidateQueries({ queryKey: ["gold", "bots"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "حذف ناموفق بود."),
  });

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <TrendingUpIcon className="size-6" />
            بات طلا
          </h1>
          <p className="text-sm text-muted-foreground">
            هشدار هوشمند تغییر قیمت طلا روی مقصد دلخواه شما.
          </p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)} variant={showForm ? "outline" : "default"}>
          {showForm ? "بستن" : <><PlusIcon className="size-4" /> بات طلای جدید</>}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>بات طلای جدید</CardTitle>
            <CardDescription>تنظیمات اولیه — می‌توانید بعداً فعالش کنید.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <NewBotForm
              state={newBot}
              onChange={setNewBot}
              destinations={destQ.data ?? []}
            />
            <div className="flex items-end">
              <Button
                onClick={() => createMut.mutate()}
                disabled={createMut.isPending}
                className="w-full sm:w-auto"
              >
                {createMut.isPending ? <Loader2Icon className="size-4 animate-spin" /> : <SaveIcon className="size-4" />}
                ساخت بات
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {botsQ.isLoading && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      )}

      {botsQ.error && (
        <Card>
          <CardContent className="flex items-center gap-2 p-4 text-destructive">
            <AlertTriangleIcon className="size-4" />
            بارگذاری بات‌ها ناموفق بود.
            <Button variant="ghost" size="sm" onClick={() => botsQ.refetch()}>تلاش مجدد</Button>
          </CardContent>
        </Card>
      )}

      {!botsQ.isLoading && botsQ.data && botsQ.data.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
            <TrendingUpIcon className="size-8 opacity-50" />
            <div>هنوز هیچ بات طلایی نساخته‌اید.</div>
            <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
              <PlusIcon className="size-4" /> ساخت اولین بات
            </Button>
          </CardContent>
        </Card>
      )}

      {botsQ.data && botsQ.data.length > 0 && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {botsQ.data.map((bot) => (
            <BotCard
              key={bot.id}
              bot={bot}
              destinations={destQ.data ?? []}
              onSave={(patch) => updateMut.mutate({ id: bot.id, ...patch })}
              onDelete={() => setDeleteId(bot.id)}
              saving={updateMut.isPending}
            />
          ))}
        </div>
      )}

      <AlertDialog open={deleteId !== null} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف بات طلا؟</AlertDialogTitle>
            <AlertDialogDescription>
              این بات حذف می‌شود و دیگر قیمت‌ها را پایش نمی‌کند.
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

function NewBotForm({
  state,
  onChange,
  destinations,
}: {
  state: NewBotState;
  onChange: (s: NewBotState) => void;
  destinations: DestinationRow[];
}) {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label>نوع طلا</Label>
        <Select value={state.instrument} onValueChange={(v) => onChange({ ...state, instrument: v })}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {INSTRUMENTS.map((it) => (
              <SelectItem key={it.key} value={it.key}>{it.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>جهت تغییر</Label>
        <Select value={state.direction} onValueChange={(v) => onChange({ ...state, direction: v as "up" | "down" | "both" })}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {DIRECTIONS.map((d) => (
              <SelectItem key={d.key} value={d.key}>{d.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="nb-thr">آستانه (٪)</Label>
        <Input
          id="nb-thr"
          type="text"
          inputMode="decimal"
          value={toPersianDigits(state.thresholdPct)}
          onChange={(e) => onChange({ ...state, thresholdPct: fromPersianDigits(e.target.value) })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="nb-int">بازهٔ پایش (دقیقه)</Label>
        <Input
          id="nb-int"
          type="text"
          inputMode="numeric"
          value={toPersianDigits(state.intervalMin)}
          onChange={(e) => onChange({ ...state, intervalMin: fromPersianDigits(e.target.value) })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>مقصد ارسال</Label>
        <Select value={state.destinationId} onValueChange={(v) => onChange({ ...state, destinationId: v })}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">— انتخاب نکنید —</SelectItem>
            {destinations.map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  );
}

function BotCard({
  bot,
  destinations,
  onSave,
  onDelete,
  saving,
}: {
  bot: GoldBotRow;
  destinations: DestinationRow[];
  onSave: (patch: Partial<Omit<GoldBotRow, "id">>) => void;
  onDelete: () => void;
  saving: boolean;
}) {
  const [thresholdPct, setThresholdPct] = useState(String(bot.thresholdPct));
  const [intervalMin, setIntervalMin] = useState(String(bot.intervalMin));
  const [direction, setDirection] = useState(bot.direction);
  const [destinationId, setDestinationId] = useState(bot.destinationId ?? "__none__");

  const instrumentLabel = INSTRUMENTS.find((i) => i.key === bot.instrument)?.label ?? bot.instrument;

  function save() {
    onSave({
      thresholdPct: Number(thresholdPct) || 0,
      intervalMin: Number(intervalMin) || 15,
      direction,
      destinationId: destinationId === "__none__" ? null : destinationId,
    });
  }

  return (
    <Card dir="rtl">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <span>{instrumentLabel}</span>
            {bot.enabled ? (
              <Badge>پایش فعال</Badge>
            ) : (
              <Badge variant="secondary">غیرفعال</Badge>
            )}
          </CardTitle>
          <CardDescription>
            {bot.lastFiredAtFa ? `آخرین ارسال: ${bot.lastFiredAtFa}` : "هنوز ارسالی نداشته است."}
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={bot.enabled}
            onCheckedChange={(v) => onSave({ enabled: v })}
            disabled={saving}
          />
          <Button variant="ghost" size="icon" onClick={onDelete}>
            <Trash2Icon className="size-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <Label>جهت</Label>
          <Select value={direction} onValueChange={(v) => setDirection(v as "up" | "down" | "both")}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {DIRECTIONS.map((d) => (
                <SelectItem key={d.key} value={d.key}>{d.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`thr-${bot.id}`}>آستانه (٪)</Label>
          <Input
            id={`thr-${bot.id}`}
            type="text"
            inputMode="decimal"
            value={toPersianDigits(thresholdPct)}
            onChange={(e) => setThresholdPct(fromPersianDigits(e.target.value))}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`int-${bot.id}`}>بازه (دقیقه)</Label>
          <Input
            id={`int-${bot.id}`}
            type="text"
            inputMode="numeric"
            value={toPersianDigits(intervalMin)}
            onChange={(e) => setIntervalMin(fromPersianDigits(e.target.value))}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>مقصد</Label>
          <Select value={destinationId} onValueChange={setDestinationId}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— انتخاب نکنید —</SelectItem>
              {destinations.map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="sm:col-span-2 lg:col-span-4 flex justify-end">
          <Button variant="outline" size="sm" onClick={save} disabled={saving}>
            {saving ? <Loader2Icon className="size-4 animate-spin" /> : <SaveIcon className="size-4" />}
            ذخیره
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default GoldBotView;
