"use client";
// =====================================================================
// POSTYAR — Content Editor View
// ---------------------------------------------------------------------
// Fields: عنوان، متن، رسانه، مقاصد، زمان‌بندی
// Actions: ذخیره پیش‌نویس / انتشار فوری / زمان‌بندی انتشار / انصراف
// Validation: title ≥ 3 chars
// Color badges: draft=muted, scheduled=gold, delivered=primary, failed=destr.
// Smart-caption: api.generateCaption(...) → insert into body textarea.
// =====================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowRightIcon,
  CalendarClockIcon,
  EyeIcon,
  ImagePlusIcon,
  Loader2Icon,
  MessageCircleIcon,
  SaveIcon,
  SendIcon,
  SparklesIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
  type ContentRow,
  type DestinationRow,
  type GlassButtonRow,
  type MediaUploadResult,
} from "@/components/postyar/api";
import { useCaptionStore } from "@/components/postyar/ai/caption-store";
import {
  JalaliPicker,
  type JalaliValue,
} from "@/components/postyar/jalali-picker/jalali-picker";
import {
  formatJalaliDateTime,
  JALALI_MONTHS,
  toPersianDigits,
} from "@/lib/persian";

export interface ContentEditorViewProps {
  contentId?: string;
  navigate: (to: string) => void;
}

type ScheduleMode = "now" | "scheduled";

function statusBadge(status: string) {
  switch (status) {
    case "draft": return <Badge variant="secondary">پیش‌نویس</Badge>;
    case "scheduled": return <Badge className="bg-accent text-accent-foreground">زمان‌بندی‌شده</Badge>;
    case "queued": return <Badge variant="outline">در صف</Badge>;
    case "processing": return <Badge variant="outline">در حال پردازش</Badge>;
    case "delivered": return <Badge variant="default">منتشرشده</Badge>;
    case "failed": return <Badge variant="destructive">ناموفق</Badge>;
    case "cancelled": return <Badge variant="secondary">لغوشده</Badge>;
    default: return <Badge variant="outline">{status}</Badge>;
  }
}

interface MediaItem {
  id: string;
  publicId: string;
  kind: "image" | "video";
  mime: string;
  sizeBytes: number;
}

export function ContentEditorView({ contentId, navigate }: ContentEditorViewProps) {
  const qc = useQueryClient();

  // ---- form state ----
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [mediaIds, setMediaIds] = useState<string[]>([]);
  const [mediaMeta, setMediaMeta] = useState<Record<string, MediaItem>>({});
  const [destinationIds, setDestinationIds] = useState<string[]>([]);
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>("now");
  const [scheduleJalali, setScheduleJalali] = useState<JalaliValue | null>(null);

  // ---- preview-ack state ----
  // Per task 21-14-content-preview: the user must click «پیش‌نمایش» at least
  // once before the publish / schedule buttons become enabled. Any subsequent
  // edit to the form (title, body, media, destinations, scheduling) re-disables
  // the publish buttons and forces a fresh preview.
  const [hasPreviewed, setHasPreviewed] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Stable JSON snapshot of the fields the preview depends on. Used as a
  // single effect dependency so any mutation re-ack-arms the publish gate.
  const previewFingerprint = useMemo(() => JSON.stringify({
    t: title,
    b: body,
    m: mediaIds,
    d: destinationIds,
    sm: scheduleMode,
    sj: scheduleJalali,
  }), [title, body, mediaIds, destinationIds, scheduleMode, scheduleJalali]);

  useEffect(() => {
    // Fires on mount (no-op) and whenever any tracked field changes.
    setHasPreviewed(false);
  }, [previewFingerprint]);

  // ---- fetch existing content (if editing) ----
  const contentQ = useQuery({
    queryKey: ["content", "single", contentId] as const,
    queryFn: () => api.getContent(contentId!),
    enabled: !!contentId,
    staleTime: 0,
  });

  // ---- one-time pickup: if AI Caption view wrote a pending caption to the
  // global store, consume it and seed the body textarea (only when there's
  // no existing contentId — i.e. we're starting a fresh draft). ----
  const captionStore = useCaptionStore();
  const consumedPendingRef = useRef(false);
  useEffect(() => {
    if (consumedPendingRef.current) return;
    if (contentId) {
      consumedPendingRef.current = true;
      return; // editing an existing draft — let the contentQ effect win.
    }
    const pending = captionStore.consume();
    if (pending?.text) {
      setBody(pending.text);
      const hashtags = pending.hashtags ?? [];
      if (hashtags.length > 0) {
        setBody((prev) => `${prev.trim()}\n\n${hashtags.join(" ")}`);
      }
      toast.success("کپشن هوشمند در ویرایشگر بارگذاری شد.");
    }
    consumedPendingRef.current = true;
  }, [captionStore, contentId]);

  // Load fetched content into form state once.
  useEffect(() => {
    if (contentQ.data) {
      const c = contentQ.data;
      setTitle(c.title);
      setBody(c.body);
      setMediaIds(c.mediaIds ?? []);
      setDestinationIds(c.destinationIds ?? []);
      if (c.scheduledAt) {
        setScheduleMode("scheduled");
        // Best-effort back-fill of the jalali value from the ISO.
        const d = new Date(c.scheduledAt);
        const tzOffset = 3.5 * 60 * 60 * 1000;
        const tehran = new Date(d.getTime() + tzOffset);
        // Use Date components directly since formatJalaliTime already used them.
        setScheduleJalali({
          jy: tehran.getUTCFullYear(), // placeholder; will be re-normalized by picker
          jm: tehran.getUTCMonth() + 1,
          jd: tehran.getUTCDate(),
          hour: tehran.getUTCHours(),
          minute: tehran.getUTCMinutes(),
        });
      }
    }
  }, [contentQ.data]);

  // ---- fetch destinations (for multi-select) ----
  const destsQ = useQuery({
    queryKey: ["destinations", "list"] as const,
    queryFn: () => api.getDestinations(),
    staleTime: 30_000,
  });

  const toggleDestination = useCallback((id: string) => {
    setDestinationIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);

  // ---- mutations ----
  // Save-as-draft (POST on create, PATCH on update)
  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = {
        title: title.trim(),
        body,
        mediaIds,
        destinationIds,
      };
      if (contentId) {
        return api.updateContent(contentId, payload);
      }
      return api.createContent(payload);
    },
    onSuccess: (c: ContentRow) => {
      toast.success("پیش‌نویس ذخیره شد.");
      void qc.invalidateQueries({ queryKey: ["content"] });
      // If new, switch URL to the editor with the new ID so subsequent saves are PATCHes.
      if (!contentId && c.id) {
        navigate(`/dashboard/content-editor/${c.id}`);
      }
    },
    onError: (e: Error) => toast.error(e.message ?? "ذخیره ناموفق بود."),
  });

  const publishNowMut = useMutation({
    mutationFn: async () => {
      if (!contentId) throw new Error("ابتدا محتوا را به‌عنوان پیش‌نویس ذخیره کنید.");
      if (destinationIds.length === 0) throw new Error("حداقل یک مقصد انتخاب کنید.");
      return api.publishContent(contentId, destinationIds, "now");
    },
    onSuccess: () => {
      toast.success("محتوا برای انتشار فوری در صف قرار گرفت.");
      void qc.invalidateQueries({ queryKey: ["content"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "انتشار فوری ناموفق بود."),
  });

  const scheduleMut = useMutation({
    mutationFn: async () => {
      if (!contentId) throw new Error("ابتدا محتوا را به‌عنوان پیش‌نویس ذخیره کنید.");
      if (destinationIds.length === 0) throw new Error("حداقل یک مقصد انتخاب کنید.");
      if (!scheduleJalali) throw new Error("تاریخ و زمان زمان‌بندی را انتخاب کنید.");
      return api.publishContent(contentId, destinationIds, scheduleJalali);
    },
    onSuccess: () => {
      toast.success("زمان‌بندی انتشار ثبت شد.");
      void qc.invalidateQueries({ queryKey: ["content"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "زمان‌بندی ناموفق بود."),
  });

  // ---- smart caption ----
  const captionMut = useMutation({
    mutationFn: () =>
      api.generateCaption({
        topic: title.trim() || "محتوای پُست‌یار",
        tone: "دوستانه",
        audience: "عمومی",
        length: "کوتاه",
        platform: "telegram",
        purpose: "marketing",
      }),
    onSuccess: (r: { caption?: string; output?: string }) => {
      const caption = r.caption ?? r.output ?? "";
      if (!caption) {
        toast.error("خروجی خالی بود؛ مجدداً تلاش کنید.");
        return;
      }
      setBody((prev) => (prev.trim() ? `${prev.trim()}\n\n${caption}` : caption));
      toast.success("کپشن هوشمند به انتهای متن افزوده شد.");
    },
    onError: (e: Error) => toast.error(e.message ?? "تولید کپشن ناموفق بود."),
  });

  // ---- media upload ----
  const [uploading, setUploading] = useState(false);
  async function onUploadMedia(file: File, kind: "image" | "video") {
    setUploading(true);
    try {
      const r: MediaUploadResult = await api.uploadMedia(file, kind);
      setMediaIds((prev) => [...prev, r.id]);
      setMediaMeta((prev) => ({
        ...prev,
        [r.id]: {
          id: r.id,
          publicId: r.publicId,
          kind: r.kind,
          mime: r.mime,
          sizeBytes: r.sizeBytes,
        },
      }));
      toast.success("رسانه بارگذاری شد.");
    } catch (e) {
      const err = e as Error;
      toast.error(err.message ?? "بارگذاری ناموفق بود.");
    } finally {
      setUploading(false);
    }
  }

  function removeMedia(id: string) {
    setMediaIds((prev) => prev.filter((m) => m !== id));
    setMediaMeta((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  const titleValid = title.trim().length >= 3;
  const canPublishNow = !!contentId && destinationIds.length > 0 && titleValid && hasPreviewed && !publishNowMut.isPending;
  const canSchedule = !!contentId && destinationIds.length > 0 && titleValid && hasPreviewed && (scheduleMode !== "scheduled" || !!scheduleJalali) && !scheduleMut.isPending;

  const status = contentQ.data?.status ?? "draft";

  function onCancel() {
    navigate("/dashboard/content");
  }

  const busy = saveMut.isPending || publishNowMut.isPending || scheduleMut.isPending || captionMut.isPending;

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      {/* Header */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div className="flex flex-col gap-1">
            <CardTitle className="flex items-center gap-3">
              {contentId ? "ویرایش محتوا" : "محتوای جدید"}
              {contentQ.isLoading ? (
                <Skeleton className="h-5 w-20" />
              ) : (
                statusBadge(status)
              )}
            </CardTitle>
            {contentQ.data?.failureReason && (
              <p className="text-xs text-destructive">{contentQ.data.failureReason}</p>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={onCancel} className="gap-2">
            <ArrowRightIcon className="size-4" />
            بازگشت
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* Title */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ce-title">عنوان</Label>
            <Input
              id="ce-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="عنوان کوتاه و گویا برای محتوا"
              maxLength={200}
              aria-invalid={!titleValid}
            />
            <p className="text-[0.7rem] text-muted-foreground">
              حداقل ۳ نویسه. {toPersianDigits(title.trim().length)} نویسه.
            </p>
          </div>

          {/* Body + Smart Caption */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="ce-body">متن</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => captionMut.mutate()}
                disabled={busy || captionMut.isPending}
                className="gap-2"
              >
                {captionMut.isPending ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <SparklesIcon className="size-4" />
                )}
                کپشن هوشمند
              </Button>
            </div>
            <Textarea
              id="ce-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="متن محتوا…"
              rows={8}
              className="min-h-32"
            />
          </div>

          {/* Media */}
          <div className="flex flex-col gap-1.5">
            <Label>رسانه</Label>
            <div className="flex flex-wrap gap-2">
              <label
                className={cn(
                  "flex h-24 w-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed text-xs text-muted-foreground",
                  "hover:bg-accent/40 transition-colors",
                )}
              >
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void onUploadMedia(f, "image");
                    e.currentTarget.value = "";
                  }}
                  disabled={uploading}
                />
                <ImagePlusIcon className="size-5" />
                <span>{uploading ? "در حال بارگذاری…" : "افزودن تصویر"}</span>
              </label>
              {mediaIds.map((id) => {
                const meta = mediaMeta[id];
                return (
                  <div key={id} className="relative h-24 w-32 overflow-hidden rounded-md border bg-muted">
                    {meta?.kind === "image" ? (
                      <img
                        src={`/api/media/${id}`}
                        alt={meta?.publicId ?? "رسانه"}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[0.65rem] text-muted-foreground p-2 text-center">
                        {meta?.mime ?? "رسانه"}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => removeMedia(id)}
                      className="absolute left-1 top-1 rounded-full bg-background/80 p-1 hover:bg-background"
                      aria-label="حذف رسانه"
                    >
                      <XIcon className="size-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <Separator />

          {/* Destinations */}
          <div className="flex flex-col gap-1.5">
            <Label>مقاصد</Label>
            {destsQ.isLoading ? (
              <div className="flex flex-col gap-2">
                {Array.from({ length: 2 }).map((_, i) => (
                  <Skeleton key={i} className="h-6 w-64" />
                ))}
              </div>
            ) : (destsQ.data ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">
                هنوز مقصدی نساخته‌اید. به بخش مقاصد بروید و نخستین مقصد را بسازید.
              </p>
            ) : (
              <div className="flex flex-col gap-2 max-h-48 overflow-y-auto scrollbar-thin">
                {(destsQ.data ?? []).map((d: DestinationRow) => (
                  <label
                    key={d.id}
                    className="flex items-center gap-3 rounded-md border p-2 text-sm cursor-pointer hover:bg-muted/40"
                  >
                    <Checkbox
                      checked={destinationIds.includes(d.id)}
                      onCheckedChange={() => toggleDestination(d.id)}
                    />
                    <div className="flex flex-col">
                      <span className="font-medium">{d.label}</span>
                      <span className="text-[0.7rem] text-muted-foreground">
                        {d.provider} • {d.chatId}
                      </span>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          <Separator />

          {/* Schedule */}
          <div className="flex flex-col gap-1.5">
            <Label>زمان‌بندی</Label>
            <RadioGroup
              value={scheduleMode}
              onValueChange={(v) => setScheduleMode(v as ScheduleMode)}
              className="flex flex-col gap-2"
            >
              <label className="flex items-center gap-3 text-sm">
                <RadioGroupItem value="now" id="sch-now" />
                <span>انتشار فوری</span>
              </label>
              <label className="flex items-center gap-3 text-sm">
                <RadioGroupItem value="scheduled" id="sch-scheduled" />
                <span>زمان‌بندی در زمان دلخواه</span>
              </label>
            </RadioGroup>
            {scheduleMode === "scheduled" && (
              <div className="mt-2">
                <JalaliPicker
                  value={scheduleJalali}
                  onChange={setScheduleJalali}
                  mode="future"
                  placeholder="تاریخ و زمان انتشار را انتخاب کنید"
                />
              </div>
            )}
            {contentQ.data?.scheduledAt && (
              <p className="text-xs text-muted-foreground">
                زمان‌بندی فعلی: {formatJalaliDateTime(contentQ.data.scheduledAt, { withTime: true })}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Action bar */}
      <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-2 rounded-lg border bg-background/95 backdrop-blur p-3 shadow-sm">
        <Button
          variant="default"
          onClick={() => saveMut.mutate()}
          disabled={busy || !titleValid}
          className="gap-2 cursor-pointer"
        >
          {saveMut.isPending ? <Loader2Icon className="size-4 animate-spin" /> : <SaveIcon className="size-4" />}
          ذخیره پیش‌نویس
        </Button>
        <Button
          variant="outline"
          onClick={() => { setHasPreviewed(true); setPreviewOpen(true); }}
          disabled={busy || !titleValid}
          className="gap-2 cursor-pointer"
          aria-haspopup="dialog"
          aria-expanded={previewOpen}
        >
          <EyeIcon className="size-4" />
          پیش‌نمایش
        </Button>
        <Button
          variant="outline"
          onClick={() => publishNowMut.mutate()}
          disabled={!canPublishNow}
          className="gap-2"
          title={!hasPreviewed ? "ابتدا پیش‌نمایش را ببینید" : undefined}
        >
          {publishNowMut.isPending ? <Loader2Icon className="size-4 animate-spin" /> : <SendIcon className="size-4" />}
          انتشار فوری
        </Button>
        <Button
          variant="outline"
          onClick={() => scheduleMut.mutate()}
          disabled={!canSchedule}
          className="gap-2"
          title={!hasPreviewed ? "ابتدا پیش‌نمایش را ببینید" : undefined}
        >
          {scheduleMut.isPending ? <Loader2Icon className="size-4 animate-spin" /> : <SparklesIcon className="size-4" />}
          زمان‌بندی انتشار
        </Button>
        {!hasPreviewed && (
          <span className="text-[0.7rem] text-muted-foreground" dir="rtl">
            برای انتشار، ابتدا پیش‌نمایش را ببینید.
          </span>
        )}
        <div className="flex-1" />
        <Button variant="ghost" onClick={onCancel} className="gap-2 cursor-pointer">
          <Trash2Icon className="size-4" />
          انصراف
        </Button>
      </div>

      {/* Preview dialog — renders the content as Telegram-like chat bubbles per destination */}
      <ContentPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        title={title}
        body={body}
        mediaIds={mediaIds}
        mediaMeta={mediaMeta}
        destinationIds={destinationIds}
        destinations={destsQ.data ?? []}
        scheduleMode={scheduleMode}
        scheduleJalali={scheduleJalali}
        canPublish={canPublishNow}
        canSchedule={canSchedule}
        publishing={publishNowMut.isPending}
        scheduling={scheduleMut.isPending}
        onPublishNow={() => { setPreviewOpen(false); publishNowMut.mutate(); }}
        onSchedule={() => { setPreviewOpen(false); scheduleMut.mutate(); }}
      />
    </div>
  );
}

// =====================================================================
// ContentPreviewDialog — Telegram-like bubble preview per destination
// =====================================================================
const PROVIDER_LABEL_FA: Record<DestinationRow["provider"], string> = {
  telegram: "تلگرام",
  bale: "بله",
  rubika: "روبیکا",
};

/** Persian-stringify a JalaliValue as «۱۴۰۳ آبان ۲۰، شنبه - ۱۵:۳۰» (best-effort). */
function formatJalaliValueFa(v: JalaliValue): string {
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const hh = toPersianDigits(pad2(v.hour));
  const mi = toPersianDigits(pad2(v.minute));
  // Weekday: derive Gregorian → JS getUTCDay (Sunday=0..Saturday=6). Our J_WEEKDAYS
  // ordering is [یکشنبه..جمعه] (Sunday..Friday) + شنبه (Saturday) at the end,
  // so shift Sunday→0..Saturday→6 then map to the project's weekday list.
  const jToG = jalaliToGregorianLocal(v.jy, v.jm, v.jd);
  const jsDay = new Date(Date.UTC(jToG[0], jToG[1] - 1, jToG[2])).getUTCDay();
  const WEEKDAYS = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"];
  const wd = WEEKDAYS[jsDay];
  return `${toPersianDigits(v.jy)} ${JALALI_MONTHS[v.jm - 1]} ${toPersianDigits(pad2(v.jd))}، ${wd} - ${hh}:${mi}`;
}

/** Local Jalali→Gregorian helper (avoids importing the heavy persian core). */
function jalaliToGregorianLocal(jy: number, jm: number, jd: number): [number, number, number] {
  // Simple algorithm: count days from 1 Farvardin 1 (22 March 622) then invert
  // to Gregorian. Mirrors src/lib/persian/index.ts exactly (kept local to
  // avoid an extra import surface).
  const PERSIAN_EPOCH_JDN = 1948321;
  const DAYS_IN_JALALI_MONTH = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 29];
  const isLeap = (y: number) => [1, 5, 9, 13, 17, 22, 26, 30].includes(((y % 33) + 33) % 33);
  let total = 0;
  for (let y = 1; y < jy; y++) total += isLeap(y) ? 366 : 365;
  for (let m = 1; m < jm; m++) {
    total += DAYS_IN_JALALI_MONTH[m - 1];
    if (m === 12 && isLeap(jy)) total += 1;
  }
  total += jd - 1;
  const jdn = PERSIAN_EPOCH_JDN + total;
  const a = jdn + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor((146097 * b) / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  const day = e - Math.floor((153 * m + 2) / 5) + 1;
  const month = m + 3 - 12 * Math.floor(m / 10);
  const year = 100 * b + d - 4800 + Math.floor(m / 10);
  return [year, month, day];
}

interface ContentPreviewDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  body: string;
  mediaIds: string[];
  mediaMeta: Record<string, MediaItem>;
  destinationIds: string[];
  destinations: DestinationRow[];
  scheduleMode: ScheduleMode;
  scheduleJalali: JalaliValue | null;
  canPublish: boolean;
  canSchedule: boolean;
  publishing: boolean;
  scheduling: boolean;
  onPublishNow: () => void;
  onSchedule: () => void;
}

function ContentPreviewDialog({
  open,
  onOpenChange,
  title,
  body,
  mediaIds,
  mediaMeta,
  destinationIds,
  destinations,
  scheduleMode,
  scheduleJalali,
  canPublish,
  canSchedule,
  publishing,
  scheduling,
  onPublishNow,
  onSchedule,
}: ContentPreviewDialogProps) {
  // Fetch glass buttons per destination when the dialog opens (and only then).
  const [buttonsByDest, setButtonsByDest] = useState<Record<string, GlassButtonRow[]>>({});
  const [loadingButtons, setLoadingButtons] = useState(false);
  const destKey = destinationIds.slice().sort().join(",");
  useEffect(() => {
    if (!open) return;
    if (destinationIds.length === 0) {
      setButtonsByDest({});
      return;
    }
    let cancelled = false;
    setLoadingButtons(true);
    void (async () => {
      const entries = await Promise.all(
        destinationIds.map(async (id): Promise<[string, GlassButtonRow[]]> => {
          try {
            const all = await api.listButtons(id);
            return [id, all.filter((b) => b.enabled)];
          } catch {
            return [id, []];
          }
        }),
      );
      if (cancelled) return;
      const next: Record<string, GlassButtonRow[]> = {};
      for (const [id, list] of entries) next[id] = list;
      setButtonsByDest(next);
      setLoadingButtons(false);
    })();
    return () => { cancelled = true; };
  }, [open, destKey]);

  const selectedDestinations = useMemo(
    () => destinations.filter((d) => destinationIds.includes(d.id)),
    [destinations, destinationIds],
  );

  const hasContent = title.trim().length > 0 || body.trim().length > 0 || mediaIds.length > 0;
  const showSchedule = scheduleMode === "scheduled" && !!scheduleJalali;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="sm:max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0"
        dir="rtl"
      >
        <DialogHeader className="px-6 pt-6 pb-3 text-right">
          <DialogTitle className="flex items-center gap-2 text-base">
            <EyeIcon className="size-4" />
            پیش‌نمایش محتوا
          </DialogTitle>
          <DialogDescription className="text-xs">
            نمای دقیق محتوای شما در کانال‌های تلگرام، بله و روبیکا پیش از انتشار. برای انتشار، این پیش‌نمایش را ببینید.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 pb-4 scrollbar-thin">
          {selectedDestinations.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/20 p-8 text-center text-xs text-muted-foreground"
              dir="rtl"
            >
              <MessageCircleIcon className="size-5" />
              <div>ابتدا حداقل یک مقصد انتخاب کنید تا پیش‌نمایش نمایش داده شود.</div>
            </div>
          ) : !hasContent ? (
            <div
              className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/20 p-8 text-center text-xs text-muted-foreground"
              dir="rtl"
            >
              <MessageCircleIcon className="size-5" />
              <div>محتوایی برای پیش‌نمایش وجود ندارد. عنوان یا متن را پر کنید.</div>
            </div>
          ) : (
            <div className="flex flex-col gap-4" dir="rtl">
              {showSchedule && scheduleJalali && (
                <div
                  className="flex items-center gap-2 rounded-md border bg-accent/10 px-3 py-2 text-[0.7rem] text-accent-foreground"
                  dir="rtl"
                >
                  <CalendarClockIcon className="size-3.5" />
                  <span className="font-medium">زمان‌بندی انتشار:</span>
                  <span>{formatJalaliValueFa(scheduleJalali)}</span>
                </div>
              )}
              {selectedDestinations.map((d) => (
                <PreviewBubble
                  key={d.id}
                  destination={d}
                  title={title}
                  body={body}
                  mediaIds={mediaIds}
                  mediaMeta={mediaMeta}
                  buttons={buttonsByDest[d.id] ?? []}
                  loadingButtons={loadingButtons}
                  scheduledLabel={showSchedule && scheduleJalali ? formatJalaliValueFa(scheduleJalali) : null}
                />
              ))}
            </div>
          )}
        </div>

        <DialogFooter
          className="flex-row items-center justify-between gap-2 border-t bg-background/95 px-6 py-3"
          dir="rtl"
        >
          <span className="text-[0.7rem] text-muted-foreground" dir="rtl">
            با بستن این پنجره، دکمهٔ انتشار در نوار پایین فعال می‌شود.
          </span>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="cursor-pointer"
            >
              بستن
            </Button>
            {scheduleMode === "scheduled" ? (
              <Button
                variant="default"
                onClick={onSchedule}
                disabled={!canSchedule || scheduling}
                className="gap-2 cursor-pointer"
              >
                {scheduling ? <Loader2Icon className="size-4 animate-spin" /> : <CalendarClockIcon className="size-4" />}
                تأیید و زمان‌بندی
              </Button>
            ) : (
              <Button
                variant="default"
                onClick={onPublishNow}
                disabled={!canPublish || publishing}
                className="gap-2 cursor-pointer"
              >
                {publishing ? <Loader2Icon className="size-4 animate-spin" /> : <SendIcon className="size-4" />}
                تأیید و انتشار فوری
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// PreviewBubble — single Telegram-like message bubble for one destination
// =====================================================================
interface PreviewBubbleProps {
  destination: DestinationRow;
  title: string;
  body: string;
  mediaIds: string[];
  mediaMeta: Record<string, MediaItem>;
  buttons: GlassButtonRow[];
  loadingButtons: boolean;
  scheduledLabel: string | null;
}

function PreviewBubble({
  destination,
  title,
  body,
  mediaIds,
  mediaMeta,
  buttons,
  loadingButtons,
  scheduledLabel,
}: PreviewBubbleProps) {
  const providerFa = PROVIDER_LABEL_FA[destination.provider] ?? destination.provider;
  const nowClock = `${toPersianDigits(String(new Date().getHours()).padStart(2, "0"))}:${toPersianDigits(String(new Date().getMinutes()).padStart(2, "0"))}`;
  const timeLabel = scheduledLabel ?? nowClock;

  // Group glass buttons by rowOrder (Telegram inline-keyboard rows).
  const buttonRows = useMemo(() => {
    const map = new Map<number, GlassButtonRow[]>();
    for (const b of buttons) {
      const list = map.get(b.rowOrder) ?? [];
      list.push(b);
      map.set(b.rowOrder, list);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, list]) => list);
  }, [buttons]);

  const mediaItems = mediaIds
    .map((id) => ({ id, meta: mediaMeta[id] }))
    .filter((x) => !!x.meta);

  return (
    <div className="flex flex-col gap-1.5" dir="rtl">
      {/* Bubble header — destination + provider badge */}
      <div className="flex items-center gap-2 px-1 text-[0.7rem] text-muted-foreground" dir="rtl">
        <Badge variant="outline" className="gap-1 font-normal">
          <MessageCircleIcon className="size-3" />
          {providerFa}
        </Badge>
        <span className="font-medium text-foreground">{destination.label}</span>
        <span className="text-muted-foreground">• {destination.chatId}</span>
      </div>

      {/* Telegram-like bubble body */}
      <div
        className="relative ms-1 me-auto max-w-[92%] overflow-hidden rounded-xl rounded-ss-md rounded-se-xl bg-muted shadow-sm"
        dir="rtl"
      >
        {/* Sender header inside the bubble */}
        <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2" dir="rtl">
          <span className="text-xs font-semibold text-primary">پُست‌یار</span>
          <span className="text-[0.6rem] text-muted-foreground">{providerFa}</span>
        </div>

        {/* Media on top — preserve aspect ratio */}
        {mediaItems.length > 0 && (
          <div className="flex flex-col gap-0" dir="rtl">
            {mediaItems.map(({ id, meta }) => (
              <div key={id} className="relative w-full bg-muted-foreground/10">
                {meta?.kind === "image" ? (
                  <img
                    src={`/api/media/${id}`}
                    alt={meta?.publicId ?? "رسانه"}
                    className="block max-h-80 w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex aspect-video w-full items-center justify-center text-[0.7rem] text-muted-foreground" dir="rtl">
                    {meta?.mime ?? "رسانهٔ ویدئویی"}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Text body — title bold, then body with preserved line breaks */}
        {(title.trim() || body.trim()) && (
          <div className="flex flex-col gap-1 px-3 py-2" dir="auto">
            {title.trim() && (
              <div className="text-sm font-bold leading-relaxed text-foreground" dir="rtl">
                {title.trim()}
              </div>
            )}
            {body.trim() && (
              <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground" dir="auto">
                {body.trim()}
              </div>
            )}
          </div>
        )}

        {/* Glass buttons — horizontal scrollable keyboard rows */}
        {loadingButtons ? (
          <div className="flex items-center gap-2 px-3 pb-2 text-[0.7rem] text-muted-foreground" dir="rtl">
            <Loader2Icon className="size-3 animate-spin" />
            در حال بارگذاری دکمه‌های شیشه‌ای…
          </div>
        ) : buttonRows.length > 0 ? (
          <div className="flex flex-col gap-1.5 px-3 pb-3" dir="rtl">
            {buttonRows.map((row, i) => (
              <div
                key={i}
                className="flex max-w-full gap-1.5 overflow-x-auto scrollbar-thin"
                dir="rtl"
              >
                {row.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    tabIndex={-1}
                    className="cursor-pointer rounded-md border border-primary/40 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    dir="auto"
                  >
                    {b.label || "دکمه"}
                  </button>
                ))}
              </div>
            ))}
          </div>
        ) : null}

        {/* Time footer — like Telegram's bottom-left time */}
        <div
          className="flex items-center justify-between gap-2 px-3 pb-2 pt-0 text-[0.6rem] text-muted-foreground"
          dir="rtl"
        >
          <span>{timeLabel}</span>
          {scheduledLabel && (
            <Badge variant="outline" className="gap-1 font-normal">
              <CalendarClockIcon className="size-3" />
              زمان‌بندی‌شده
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}

export default ContentEditorView;
