"use client";
// =====================================================================
// POSTYAR — Advertising View
// ---------------------------------------------------------------------
// List of user's ad campaigns + «کمپین جدید» form (title, description,
// link, placement select, start/end via Jalali picker, image upload).
// After submission, status = pending (admin review).
// Status badge per campaign:
//   pending=muted (secondary)
//   approved=primary (default)
//   running=success (emerald)
//   completed=secondary
//   rejected=destructive
// =====================================================================
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
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

const PLACEMENTS: Array<{ key: string; label: string }> = [
  { key: "site_sidebar", label: "کنار سایت" },
  { key: "site_header", label: "بالای سایت" },
  { key: "site_footer", label: "پایین سایت" },
  { key: "dashboard_sidebar", label: "کنار داشبورد" },
  { key: "dashboard_top", label: "بالای داشبورد" },
];

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

function placementLabel(p: string): string {
  return PLACEMENTS.find((x) => x.key === p)?.label ?? p;
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
              onSubmitForReview={() => setSubmitId(ad.id)}
              submitting={submitForReview.isPending}
            />
          ))}
        </div>
      )}

      <NewAdDialog
        open={showForm}
        onOpenChange={setShowForm}
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
  onSubmitForReview,
  submitting,
}: {
  ad: AdDetailRow;
  onSubmitForReview: () => void;
  submitting: boolean;
}) {
  return (
    <Card dir="rtl">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 pb-3">
        <div className="flex flex-col gap-1">
          <CardTitle className="flex items-center gap-2 text-base">
            {ad.title}
            {statusBadge(ad.status)}
          </CardTitle>
          <CardDescription>محل: {placementLabel(ad.placement)}</CardDescription>
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
      </CardContent>
    </Card>
  );
}

function NewAdDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [link, setLink] = useState("");
  const [placement, setPlacement] = useState("site_sidebar");
  const [start, setStart] = useState<JalaliValue | null>(null);
  const [end, setEnd] = useState<JalaliValue | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const startIso = useMemo(() => (start ? jalaliToUtcIso(start.jy, start.jm, start.jd, start.hour, start.minute) : undefined), [start]);
  const endIso = useMemo(() => (end ? jalaliToUtcIso(end.jy, end.jm, end.jd, end.hour, end.minute) : undefined), [end]);

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
      toast.success("کمپین ساخته شد و در انتظار بررسی است.");
      setTitle("");
      setDescription("");
      setLink("");
      setPlacement("site_sidebar");
      setStart(null);
      setEnd(null);
      setImageBase64(null);
      setImageName(null);
      onCreated();
    },
    onError: (e: Error) => toast.error(e.message ?? "ساخت کمپین ناموفق بود."),
  });

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_IMAGE_BYTES) {
      toast.error("حجم تصویر بیش از ۵ مگابایت است.");
      return;
    }
    try {
      const buf = await f.arrayBuffer();
      const b64 = btoa(new Uint8Array(buf).reduce((s, b) => s + String.fromCharCode(b), ""));
      setImageBase64(b64);
      setImageName(f.name);
      toast.success("تصویر بارگذاری شد — روی «ایجاد کمپین» بزنید.");
    } catch {
      toast.error("خواندن تصویر ناموفق بود.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>کمپین تبلیغاتی جدید</DialogTitle>
          <DialogDescription>
            پس از ذخیره، کمپین در انتظار بررسی مدیر می‌رود و پس از تأیید منتشر می‌شود.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim().length < 3) {
              toast.error("عنوان حداقل ۳ نویسه باشد.");
              return;
            }
            mut.mutate();
          }}
        >
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
            <Select value={placement} onValueChange={setPlacement}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PLACEMENTS.map((p) => (
                  <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            <Label>تصویر تبلیغ</Label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={onFileChange}
              className="hidden"
            />
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
            <p className="text-xs text-muted-foreground">حداکثر ۵ مگابایت — تصویر به‌صورت WebP فشرده می‌شود.</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>انصراف</Button>
            <Button type="submit" disabled={mut.isPending}>
              {mut.isPending ? <Loader2Icon className="size-4 animate-spin" /> : <SaveIcon className="size-4" />}
              ایجاد کمپین
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default AdvertisingView;
