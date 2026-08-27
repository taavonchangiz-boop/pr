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
  ImagePlusIcon,
  Loader2Icon,
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
import { cn } from "@/lib/utils";
import {
  api,
  type ContentRow,
  type DestinationRow,
  type MediaUploadResult,
} from "@/components/postyar/api";
import { useCaptionStore } from "@/components/postyar/ai/caption-store";
import {
  JalaliPicker,
  type JalaliValue,
} from "@/components/postyar/jalali-picker/jalali-picker";
import {
  formatJalaliDateTime,
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
  const canPublishNow = !!contentId && destinationIds.length > 0 && titleValid && !publishNowMut.isPending;
  const canSchedule = !!contentId && destinationIds.length > 0 && titleValid && (scheduleMode !== "scheduled" || !!scheduleJalali) && !scheduleMut.isPending;

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
          className="gap-2"
        >
          {saveMut.isPending ? <Loader2Icon className="size-4 animate-spin" /> : <SaveIcon className="size-4" />}
          ذخیره پیش‌نویس
        </Button>
        <Button
          variant="outline"
          onClick={() => publishNowMut.mutate()}
          disabled={!canPublishNow}
          className="gap-2"
        >
          {publishNowMut.isPending ? <Loader2Icon className="size-4 animate-spin" /> : <SendIcon className="size-4" />}
          انتشار فوری
        </Button>
        <Button
          variant="outline"
          onClick={() => scheduleMut.mutate()}
          disabled={!canSchedule}
          className="gap-2"
        >
          {scheduleMut.isPending ? <Loader2Icon className="size-4 animate-spin" /> : <SparklesIcon className="size-4" />}
          زمان‌بندی انتشار
        </Button>
        <div className="flex-1" />
        <Button variant="ghost" onClick={onCancel} className="gap-2">
          <Trash2Icon className="size-4" />
          انصراف
        </Button>
      </div>
    </div>
  );
}

export default ContentEditorView;
