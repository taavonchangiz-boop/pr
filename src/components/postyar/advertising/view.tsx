"use client";
// =====================================================================
// POSTYAR — Advertising View
// ---------------------------------------------------------------------
// List of user's ad campaigns + «کمپین جدید» form (title, description,
// link, placement select, start/end via Jalali picker, image upload) with
// a LIVE PREVIEW pane beside the form so the user can see how the ad will
// actually render in the chosen placement before submitting. The submit
// button stays disabled until the user ticks «پیش‌نمایش را دیدم».
//
// Placements are now fetched from /api/ads/placements (active-only) so
// the user sees exactly what the admin has configured — including the
// recommended image size, the max file size, and the kind (which drives
// the preview renderer: sticky_bar / banner_inline / sidebar_card /
// fullscreen / slider).
//
// Status badge per campaign:
//   pending=muted (secondary)
//   approved=primary (default)
//   running=success (emerald)
//   completed=secondary
//   rejected=destructive
// =====================================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckCircle2Icon,
  ExternalLinkIcon,
  ImageUpIcon,
  Loader2Icon,
  MegaphoneIcon,
  PlusIcon,
  RefreshCwIcon,
  SaveIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  api,
  type AdDetailRow,
} from "@/components/postyar/api";
import {
  JalaliPicker,
  type JalaliValue,
} from "@/components/postyar/jalali-picker/jalali-picker";
import { jalaliToUtcIso, formatJalaliDate, toPersianDigits } from "@/lib/persian";
import {
  AdPreview,
  recommendedSizeBadgeLabel,
  type AdPreviewPlacement,
} from "@/components/postyar/advertising/preview";

// ---------------------------------------------------------------------
// Public placements list (active-only) — fetched from the new
// /api/ads/placements endpoint so the user sees the admin-configured
// slots with their recommended sizes + kinds + max file bytes.
// ---------------------------------------------------------------------
interface PublicPlacement {
  key: string;
  labelFa: string;
  descriptionFa: string;
  kind: string;
  recommendedWidth: number;
  recommendedHeight: number;
  maxFileBytes: number;
}

async function fetchPublicPlacements(): Promise<PublicPlacement[]> {
  const r = await fetch("/api/ads/placements", { credentials: "same-origin" });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data as { errorFa?: string })?.errorFa ?? `خطای ${r.status}`);
  return ((data as { items?: PublicPlacement[] }).items) ?? [];
}

function statusBadge(status: string) {
  switch (status) {
    case "pending":
      return <Badge variant="secondary">در انتظار بررسی</Badge>;
    case "approved":
      return <Badge variant="default">تأییدشده</Badge>;
    case "running":
      return <Badge className="bg-emerald-500 text-white">در حال نمایش</Badge>;
    case "completed":
      return <Badge variant="secondary">پایان‌یافته</Badge>;
    case "rejected":
      return <Badge variant="destructive">رد شده</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function placementLabel(p: string, placements: PublicPlacement[]): string {
  return placements.find((x) => x.key === p)?.labelFa ?? p;
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export interface AdvertisingViewProps {
  navigate: (to: string) => void;
}

export function AdvertisingView({ navigate }: AdvertisingViewProps) {
  void navigate; // not currently used (deep-link to ad detail in the future)
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [submitId, setSubmitId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["ads", "list"],
    queryFn: () => api.getAds(),
    staleTime: 15_000,
  });

  // Public placements — fetched once per mount, shared between the ad cards
  // (placement label lookup) and the «کمپین جدید» dialog (placement select
  // + recommended-size hint + live preview kind).
  const placementsQ = useQuery({
    queryKey: ["ads", "placements"],
    queryFn: fetchPublicPlacements,
    staleTime: 60_000,
  });

  const submitForReview = useMutation({
    mutationFn: (id: string) => api.submitAdForReview(id),
    onSuccess: () => {
      toast.success("تبلیغ برای بررسی فرستاده شد.");
      setSubmitId(null);
      qc.invalidateQueries({ queryKey: ["ads", "list"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "ارسال ناموفق بود."),
  });

  const ads = q.data ?? [];
  const placements = placementsQ.data ?? [];

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <MegaphoneIcon className="size-6" />
            تبلیغات
          </h1>
          <p className="text-sm text-muted-foreground">
            کمپین‌های تبلیغاتی شما. هر کمپین پس از بررسی مدیر منتشر می‌شود.
          </p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <PlusIcon className="size-4" />
          کمپین جدید
        </Button>
      </div>

      {q.isLoading && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {!q.isLoading && ads.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center text-sm text-muted-foreground">
            <MegaphoneIcon className="size-8 opacity-50" />
            <div>هنوز کمپینی نساخته‌اید.</div>
            <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
              <PlusIcon className="size-4" /> ساخت کمپین
            </Button>
          </CardContent>
        </Card>
      )}

      {ads.length > 0 && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {ads.map((ad) => (
            <AdCard
              key={ad.id}
              ad={ad}
              placements={placements}
              onSubmitForReview={() => setSubmitId(ad.id)}
              submitting={submitForReview.isPending}
            />
          ))}
        </div>
      )}

      <NewAdDialog
        open={showForm}
        onOpenChange={setShowForm}
        placements={placements}
        placementsLoading={placementsQ.isLoading}
        onCreated={() => {
          setShowForm(false);
          qc.invalidateQueries({ queryKey: ["ads", "list"] });
        }}
      />

      <AlertDialog open={submitId !== null} onOpenChange={(open) => { if (!open) setSubmitId(null); }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>ارسال برای بررسی؟</AlertDialogTitle>
            <AlertDialogDescription>
              پس از ارسال، تا پایان بررسی مدیر امکان ویرایش وجود نخواهد داشت.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction onClick={() => submitId && submitForReview.mutate(submitId)}>
              ارسال برای بررسی
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AdCard({
  ad,
  placements,
  onSubmitForReview,
  submitting,
}: {
  ad: AdDetailRow;
  placements: PublicPlacement[];
  onSubmitForReview: () => void;
  submitting: boolean;
}) {
  const placementRow = placements.find((p) => p.key === ad.placement) ?? null;
  return (
    <Card dir="rtl">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 pb-3">
        <div className="flex flex-col gap-1">
          <CardTitle className="flex items-center gap-2 text-base">
            {ad.title}
            {statusBadge(ad.status)}
          </CardTitle>
          <CardDescription>محل: {placementLabel(ad.placement, placements)}</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          {ad.link && (
            <Button variant="ghost" size="icon" asChild>
              <a href={ad.link} target="_blank" rel="noopener noreferrer">
                <ExternalLinkIcon className="size-4" />
              </a>
            </Button>
          )}
          {(ad.status === "pending" || ad.status === "rejected") && (
            <Button size="sm" variant="outline" onClick={onSubmitForReview} disabled={submitting}>
              <RefreshCwIcon className="size-4" />
              ارسال برای بررسی
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {ad.imageUrl && (
          <div className="mb-3 overflow-hidden rounded-md border">
            <img
              src={ad.imageUrl}
              alt={ad.title}
              className="h-32 w-full object-cover"
            />
          </div>
        )}
        {ad.descriptionFa && (
          <p className="mb-3 text-sm text-muted-foreground">{ad.descriptionFa}</p>
        )}
        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <div>شروع: {ad.startAt ? formatJalaliDate(ad.startAt) : "—"}</div>
          <div>پایان: {ad.endAt ? formatJalaliDate(ad.endAt) : "—"}</div>
          <div>نمایش: {toPersianDigits(ad.impressions)}</div>
          <div>کلیک: {toPersianDigits(ad.clicks)}</div>
        </div>
        {placementRow && placementRow.recommendedWidth > 0 && placementRow.recommendedHeight > 0 && (
          <div className="mt-2">
            <Badge variant="secondary" className="text-[10px] tabular-nums">
              سایز پیشنهادی: {toPersianDigits(placementRow.recommendedWidth)}×{toPersianDigits(placementRow.recommendedHeight)} پیکسل
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function NewAdDialog({
  open,
  onOpenChange,
  onCreated,
  placements,
  placementsLoading,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
  placements: PublicPlacement[];
  placementsLoading: boolean;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [link, setLink] = useState("");
  const [placement, setPlacement] = useState<string>("");
  const [start, setStart] = useState<JalaliValue | null>(null);
  const [end, setEnd] = useState<JalaliValue | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string | null>(null);
  const [previewAcked, setPreviewAcked] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Default to the first active placement once the list loads.
  useEffect(() => {
    if (!placement && placements.length > 0) {
      setPlacement(placements[0].key);
    }
  }, [placement, placements]);

  // Reset preview-ack flag whenever the user edits the placement / image /
  // title / description / link — they must re-confirm they saw the updated
  // preview before submitting. (Per task brief: the submit button is
  // disabled until the preview has been viewed at least once.)
  useEffect(() => {
    setPreviewAcked(false);
  }, [title, description, link, placement, imageBase64]);

  // Reset all fields when the dialog closes.
  useEffect(() => {
    if (!open) {
      setTitle("");
      setDescription("");
      setLink("");
      setPlacement("");
      setStart(null);
      setEnd(null);
      setImageBase64(null);
      setImageName(null);
      setPreviewAcked(false);
    }
  }, [open]);

  const startIso = useMemo(() => (start ? jalaliToUtcIso(start.jy, start.jm, start.jd, start.hour, start.minute) : undefined), [start]);
  const endIso = useMemo(() => (end ? jalaliToUtcIso(end.jy, end.jm, end.jd, end.hour, end.minute) : undefined), [end]);

  // The placement object the user has selected — drives the live preview.
  const activePlacement: AdPreviewPlacement | null = useMemo(() => {
    const p = placements.find((x) => x.key === placement);
    return p
      ? {
          key: p.key,
          labelFa: p.labelFa,
          descriptionFa: p.descriptionFa,
          kind: p.kind,
          recommendedWidth: p.recommendedWidth,
          recommendedHeight: p.recommendedHeight,
          maxFileBytes: p.maxFileBytes,
        }
      : null;
  }, [placement, placements]);

  // Cap the per-placement max file size; if the placement doesn't specify
  // one, fall back to the global 5 MiB.
  const perPlacementMaxBytes = activePlacement?.maxFileBytes && activePlacement.maxFileBytes > 0
    ? activePlacement.maxFileBytes
    : MAX_IMAGE_BYTES;

  // imageBase64 → dataURL for the live preview. The img tag uses this to
  // render the uploaded image without POSTing it anywhere.
  const previewImageUrl = useMemo(
    () => (imageBase64 ? `data:image/webp;base64,${imageBase64}` : null),
    [imageBase64],
  );

  const mut = useMutation({
    mutationFn: () =>
      api.createAd({
        title: title.trim(),
        descriptionFa: description.trim(),
        link: link.trim() || undefined,
        placement,
        startAt: startIso,
        endAt: endIso,
        imageBase64: imageBase64 ?? undefined,
      }),
    onSuccess: () => {
      toast.success("درخواست تبلیغ شما ثبت شد و در انتظار بررسی مدیر است.");
      onCreated();
    },
    onError: (e: Error) => toast.error(e.message ?? "ثبت درخواست ناموفق بود."),
  });

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > perPlacementMaxBytes) {
      toast.error(
        `حجم تصویر بیش از ${toPersianDigits((perPlacementMaxBytes / (1024 * 1024)).toFixed(1))} مگابایت است.`,
      );
      return;
    }
    try {
      const buf = await f.arrayBuffer();
      const b64 = btoa(new Uint8Array(buf).reduce((s, b) => s + String.fromCharCode(b), ""));
      setImageBase64(b64);
      setImageName(f.name);
      toast.success("تصویر بارگذاری شد — پیش‌نمایش را ببینید و سپس تأیید کنید.");
    } catch {
      toast.error("خواندن تصویر ناموفق بود.");
    }
  }

  // Recommended-size hint — shown as a Badge right next to the image upload
  // button. Empty string when the placement has no recommended size.
  const sizeBadgeLabel = recommendedSizeBadgeLabel(activePlacement);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>کمپین تبلیغاتی جدید</DialogTitle>
          <DialogDescription>
            پیش‌نمایش زنده کنار فرم قرار دارد. قبل از ثبت، حتماً پیش‌نمایش را ببینید و گزینهٔ «پیش‌نمایش را دیدم» را فعال کنید.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid grid-cols-1 gap-4 lg:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim().length < 3) {
              toast.error("عنوان حداقل ۳ نویسه باشد.");
              return;
            }
            if (!placement) {
              toast.error("محل نمایش را انتخاب کنید.");
              return;
            }
            if (!previewAcked) {
              toast.error("ابتدا پیش‌نمایش را ببینید و گزینهٔ «پیش‌نمایش را دیدم» را فعال کنید.");
              return;
            }
            mut.mutate();
          }}
        >
          {/* ===================== FORM COLUMN ===================== */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ad-title">عنوان</Label>
              <Input
                id="ad-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                placeholder="مثلاً: تخفیف پاییزه"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ad-desc">توضیحات</Label>
              <Textarea
                id="ad-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                maxLength={1000}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ad-link">لینک مقصد</Label>
              <Input
                id="ad-link"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                dir="ltr"
                placeholder="https://..."
                maxLength={500}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>محل نمایش</Label>
              <Select value={placement} onValueChange={setPlacement} disabled={placementsLoading || placements.length === 0}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {placementsLoading && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">در حال بارگذاری جایگاه‌ها…</div>
                  )}
                  {!placementsLoading && placements.length === 0 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                      جایگاه فعالی تعریف نشده است. بعداً دوباره تلاش کنید.
                    </div>
                  )}
                  {placements.map((p) => (
                    <SelectItem key={p.key} value={p.key}>{p.labelFa}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {activePlacement?.descriptionFa && (
                <p className="text-[11px] text-muted-foreground">{activePlacement.descriptionFa}</p>
              )}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label>تاریخ شروع</Label>
                <JalaliPicker value={start} onChange={setStart} mode="future" placeholder="انتخاب شروع" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>تاریخ پایان</Label>
                <JalaliPicker value={end} onChange={setEnd} mode="future" placeholder="انتخاب پایان" />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor="ad-img" className="flex items-center gap-1">
                  <ImageUpIcon className="size-4" />
                  تصویر تبلیغ
                </Label>
                {sizeBadgeLabel && (
                  <Badge variant="secondary" className="text-[10px] tabular-nums">
                    {sizeBadgeLabel}
                  </Badge>
                )}
              </div>
              <input
                ref={fileRef}
                id="ad-img"
                type="file"
                accept="image/*"
                onChange={onFileChange}
                className="hidden"
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                  className="w-fit"
                >
                  <ImageUpIcon className="size-4" />
                  {imageName ?? "انتخاب تصویر"}
                </Button>
                {imageName && (
                  <button
                    type="button"
                    onClick={() => { setImageBase64(null); setImageName(null); if (fileRef.current) fileRef.current.value = ""; }}
                    className="text-xs text-muted-foreground cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none motion-safe:transition-colors hover:text-destructive"
                  >
                    حذف تصویر
                  </button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {perPlacementMaxBytes <= MAX_IMAGE_BYTES
                  ? `حداکثر ${toPersianDigits((perPlacementMaxBytes / (1024 * 1024)).toFixed(1))} مگابایت`
                  : "حداکثر ۵ مگابایت"} — تصویر به‌صورت WebP فشرده می‌شود.
              </p>
            </div>
            {/* Preview acknowledgement */}
            <label
              htmlFor="ad-ack"
              className="flex cursor-pointer items-start gap-2 rounded-md border bg-muted/30 p-2.5 text-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <Checkbox
                id="ad-ack"
                checked={previewAcked}
                onCheckedChange={(v) => setPreviewAcked(v === true)}
                className="mt-0.5"
              />
              <span className="text-foreground/90">
                پیش‌نمایش زنده را دیدم، ادامه می‌دهم و درخواست تبلیغ را ثبت می‌کنم.
              </span>
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>انصراف</Button>
              <Button type="submit" disabled={mut.isPending || !previewAcked}>
                {mut.isPending ? <Loader2Icon className="size-4 animate-spin" /> : <SaveIcon className="size-4" />}
                ثبت درخواست تبلیغ
              </Button>
            </DialogFooter>
          </div>

          {/* ===================== LIVE PREVIEW COLUMN ===================== */}
          <aside className="flex flex-col gap-2 lg:border-s lg:ps-4" dir="rtl">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <CheckCircle2Icon className="size-4" />
              پیش‌نمایش زنده
            </div>
            <AdPreview
              data={{
                title,
                descriptionFa: description,
                link,
                imageUrl: previewImageUrl,
                placement: activePlacement,
              }}
            />
            {!previewAcked && (
              <p className="text-[11px] text-muted-foreground">
                دکمهٔ «ثبت درخواست تبلیغ» تا زمانی که پیش‌نمایش را تأیید نکنید غیرفعال است.
              </p>
            )}
          </aside>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default AdvertisingView;
