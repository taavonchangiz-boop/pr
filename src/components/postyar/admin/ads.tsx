"use client";
// =====================================================================
// POSTYAR — Admin Ads View
// ---------------------------------------------------------------------
// Two tabs:
//   1) «کمپین‌ها»       — table of all ad campaigns across users with
//                         approve / reject / view. Inside the view dialog,
//                         the admin can ALSO pick a placement and approve +
//                         assign in one go (POST /api/admin/ads/[id]/approve
//                         with `{ placement }`).
//   2) «جایگاه‌های تبلیغات» — full CRUD on AdPlacement rows (key, labelFa,
//                         descriptionFa, kind, active, sortOrder). Backed by
//                         /api/admin/ads/placements (GET/POST) and
//                         /api/admin/ads/placements/[id] (PATCH/DELETE).
// =====================================================================
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckIcon,
  ExternalLinkIcon,
  EyeIcon,
  Loader2Icon,
  MegaphoneIcon,
  PencilIcon,
  PlusIcon,
  SaveIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { api, type AdminAdRow } from "@/components/postyar/api";
import { AdminGate } from "@/components/postyar/admin/gate";
import { AdPreview, adKindLabelFa, type AdPreviewPlacement } from "@/components/postyar/advertising/preview";
import { formatJalaliDate, toPersianDigits } from "@/lib/persian";

// ---------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------
interface AdPlacementRow {
  key: string;
  labelFa: string;
  descriptionFa: string;
  kind: string;
  active: boolean;
  sortOrder: number;
  recommendedWidth: number;
  recommendedHeight: number;
  maxFileBytes: number;
  createdAt: string;
  updatedAt: string;
  campaignCount: number;
}

const KIND_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "sticky_bar", label: "نوار چسبان" },
  { value: "banner_inline", label: "بنر درون‌خطی" },
  { value: "sidebar_card", label: "کارت کناری" },
  { value: "fullscreen", label: "تمام‌صفحه" },
  { value: "slider", label: "اسلایدر" },
];

const SLIDER_HINT = "اسلایدر چرخشی — هر اسلاید تصویری بزرگ با متن روی آن";

function kindLabelFa(k: string): string {
  return KIND_OPTIONS.find((o) => o.value === k)?.label ?? k;
}

function statusBadge(s: string) {
  if (s === "approved") return <Badge variant="default">تأییدشده</Badge>;
  if (s === "pending") return <Badge variant="secondary">در انتظار</Badge>;
  if (s === "running") return <Badge variant="default">در حال نمایش</Badge>;
  if (s === "rejected") return <Badge variant="destructive">رد شده</Badge>;
  if (s === "completed") return <Badge variant="outline">پایان‌یافته</Badge>;
  return <Badge variant="outline">{s}</Badge>;
}

// Fetch + mutation helpers (local — api.ts is owned by another agent and we
// keep these new endpoints self-contained here).
async function fetchPlacements(): Promise<AdPlacementRow[]> {
  const r = await fetch("/api/admin/ads/placements", { credentials: "same-origin" });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data as { errorFa?: string })?.errorFa ?? `خطای ${r.status}`);
  return ((data as { items?: AdPlacementRow[] }).items) ?? [];
}
async function createPlacement(body: {
  key: string; labelFa: string; descriptionFa?: string;
  kind: string; active: boolean; sortOrder: number;
  recommendedWidth?: number; recommendedHeight?: number; maxFileBytes?: number;
}): Promise<AdPlacementRow> {
  const r = await fetch("/api/admin/ads/placements", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "same-origin",
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data as { errorFa?: string })?.errorFa ?? `خطای ${r.status}`);
  return (data as { placement: AdPlacementRow }).placement;
}
async function updatePlacement(
  key: string,
  body: Partial<Pick<AdPlacementRow, "labelFa" | "descriptionFa" | "kind" | "active" | "sortOrder" | "recommendedWidth" | "recommendedHeight" | "maxFileBytes">>,
): Promise<AdPlacementRow> {
  const r = await fetch(`/api/admin/ads/placements/${encodeURIComponent(key)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "same-origin",
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data as { errorFa?: string })?.errorFa ?? `خطای ${r.status}`);
  return (data as { placement: AdPlacementRow }).placement;
}
async function deletePlacement(key: string): Promise<void> {
  const r = await fetch(`/api/admin/ads/placements/${encodeURIComponent(key)}`, {
    method: "DELETE",
    credentials: "same-origin",
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data as { errorFa?: string })?.errorFa ?? `خطای ${r.status}`);
}
async function approveAdWithPlacement(id: string, placement: string): Promise<{ ok: true; ad: AdminAdRow }> {
  const r = await fetch(`/api/admin/ads/${id}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ placement }),
    credentials: "same-origin",
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data as { errorFa?: string })?.errorFa ?? `خطای ${r.status}`);
  return data as { ok: true; ad: AdminAdRow };
}

// ---------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------
export interface AdminAdsViewProps {
  navigate: (to: string) => void;
}

function AdminAdsInner({ navigate: _navigate }: AdminAdsViewProps) {
  const qc = useQueryClient();
  const [view, setView] = useState<AdminAdRow | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [tab, setTab] = useState<string>("campaigns");

  const q = useQuery({
    queryKey: ["admin", "ads"],
    queryFn: () => api.getAdminAdsTyped(),
    staleTime: 15_000,
  });

  // Placements list — needed both for the placements CRUD tab AND for the
  // placement <Select> inside the campaign view dialog.
  const placementsQ = useQuery({
    queryKey: ["admin", "ad-placements"],
    queryFn: fetchPlacements,
    staleTime: 15_000,
  });

  const approveMut = useMutation({
    mutationFn: (id: string) => api.adminApproveAd(id),
    onSuccess: () => {
      toast.success("تبلیغ تأیید شد.");
      qc.invalidateQueries({ queryKey: ["admin", "ads"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "تأیید ناموفق بود."),
  });
  const rejectMut = useMutation({
    mutationFn: (id: string) => api.adminRejectAd(id),
    onSuccess: () => {
      toast.success("تبلیغ رد شد.");
      setRejectId(null);
      qc.invalidateQueries({ queryKey: ["admin", "ads"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "رد ناموفق بود."),
  });

  // Approve + assign to a placement (used inside the view dialog).
  const approveWithPlacementMut = useMutation({
    mutationFn: ({ id, placement }: { id: string; placement: string }) =>
      approveAdWithPlacement(id, placement),
    onSuccess: (_data, vars) => {
      toast.success("تبلیغ تأیید شد و در جایگاه انتخاب‌شده منتشر شد.");
      setView(null);
      setPendingPlacement(vars.placement);
      qc.invalidateQueries({ queryKey: ["admin", "ads"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "تأیید ناموفق بود."),
  });

  // Local state for the placement Select inside the view dialog. Defaults to
  // the campaign's current placement when the dialog opens.
  const [pendingPlacement, setPendingPlacement] = useState<string>("");
  // whenever `view` changes, sync the local select value.
  function openViewDialog(a: AdminAdRow) {
    setView(a);
    setPendingPlacement(a.placement);
  }

  const ads = q.data?.items ?? [];
  const placements = placementsQ.data ?? [];

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <MegaphoneIcon className="size-6" />
          مدیریت تبلیغات
        </h1>
        <p className="text-sm text-muted-foreground">
          بررسی و تأیید/رد کمپین‌های تبلیغاتی کاربران و مدیریت جایگاه‌های نمایش.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="campaigns">کمپین‌ها</TabsTrigger>
          <TabsTrigger value="placements">جایگاه‌های تبلیغات</TabsTrigger>
        </TabsList>

        {/* ============ Campaigns tab ============ */}
        <TabsContent value="campaigns">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">فهرست تبلیغ‌ها ({toPersianDigits(ads.length)})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {q.isLoading && (
                <div className="flex flex-col gap-2 p-3">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              )}
              {q.error && (
                <div className="p-4 text-sm text-destructive">بارگذاری تبلیغ‌ها ناموفق بود.</div>
              )}
              {!q.isLoading && ads.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
                  <MegaphoneIcon className="size-8 opacity-50" />
                  <div>تبلیغی ثبت نشده است.</div>
                </div>
              )}
              {ads.length > 0 && (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>عنوان</TableHead>
                        <TableHead>مالک</TableHead>
                        <TableHead>وضعیت</TableHead>
                        <TableHead>جایگاه</TableHead>
                        <TableHead>شروع</TableHead>
                        <TableHead>پایان</TableHead>
                        <TableHead>نمایش</TableHead>
                        <TableHead>کلیک</TableHead>
                        <TableHead className="text-left">عملیات</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ads.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="max-w-[200px] truncate font-medium">{a.title}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {a.ownerName ?? "—"}
                            {a.ownerEmail && <div className="text-[10px]" dir="ltr">{a.ownerEmail}</div>}
                          </TableCell>
                          <TableCell>{statusBadge(a.status)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground" dir="ltr">
                            {a.placement}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{a.startAt ? formatJalaliDate(a.startAt) : "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{a.endAt ? formatJalaliDate(a.endAt) : "—"}</TableCell>
                          <TableCell className="tabular-nums text-xs">{toPersianDigits(a.impressions)}</TableCell>
                          <TableCell className="tabular-nums text-xs">{toPersianDigits(a.clicks)}</TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="sm" title="مشاهده" onClick={() => openViewDialog(a)}>
                                <EyeIcon className="size-4" />
                              </Button>
                              {(a.status === "pending" || a.status === "rejected") && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  title="تأیید سریع"
                                  className="text-emerald-600"
                                  onClick={() => approveMut.mutate(a.id)}
                                  disabled={approveMut.isPending}
                                >
                                  <CheckIcon className="size-4" />
                                </Button>
                              )}
                              {a.status !== "rejected" && a.status !== "completed" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  title="رد"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => setRejectId(a.id)}
                                >
                                  <XIcon className="size-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============ Placements tab ============ */}
        <TabsContent value="placements">
          <PlacementsManager
            placementsQ={placementsQ}
            onInvalidate={() => {
              qc.invalidateQueries({ queryKey: ["admin", "ad-placements"] });
              qc.invalidateQueries({ queryKey: ["admin", "ads"] });
            }}
          />
        </TabsContent>
      </Tabs>

      {/* ============ Campaign view dialog ============ */}
      <Dialog open={!!view} onOpenChange={(o) => !o && setView(null)}>
        <DialogContent dir="rtl" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{view?.title}</DialogTitle>
            <DialogDescription>
              {view?.ownerName ?? "—"} • {view?.placement}
            </DialogDescription>
          </DialogHeader>
          {view && (
            <AdPreview
              data={{
                title: view.title,
                descriptionFa: view.descriptionFa ?? "",
                link: view.link ?? "",
                imageUrl: view.imageUrl ?? null,
                placement: (placements.find((p) => p.key === view.placement) as AdPreviewPlacement | undefined) ?? null,
              }}
            />
          )}
          {view?.link && (
            <a href={view.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-primary" dir="ltr">
              <ExternalLinkIcon className="size-3.5" /> {view.link}
            </a>
          )}
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline">نمایش: {toPersianDigits(view?.impressions ?? 0)}</Badge>
            <Badge variant="outline">کلیک: {toPersianDigits(view?.clicks ?? 0)}</Badge>
            {view && statusBadge(view.status)}
            {view && (() => {
              const p = placements.find((x) => x.key === view.placement);
              return p ? (
                <Badge variant="outline" className="text-[10px]">
                  {adKindLabelFa(p.kind)}
                </Badge>
              ) : null;
            })()}
          </div>

          {/* Placement assignment — only meaningful before approval */}
          {view && (view.status === "pending" || view.status === "rejected") && (
            <div className="flex flex-col gap-2 border-t pt-3">
              <Label>جایگاه نمایش (هنگام تأیید)</Label>
              <Select
                value={pendingPlacement}
                onValueChange={setPendingPlacement}
                disabled={approveWithPlacementMut.isPending}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {placements.length === 0 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                      هیچ جایگاهی تعریف نشده است. ابتدا از تب «جایگاه‌های تبلیغات» یکی بسازید.
                    </div>
                  )}
                  {placements.map((p) => (
                    <SelectItem key={p.key} value={p.key} dir="ltr">
                      {p.labelFa} — {p.key}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                className="mt-1 w-full"
                disabled={
                  approveWithPlacementMut.isPending ||
                  !pendingPlacement ||
                  placements.length === 0
                }
                onClick={() => view && approveWithPlacementMut.mutate({ id: view.id, placement: pendingPlacement })}
              >
                {approveWithPlacementMut.isPending ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <CheckIcon className="size-4" />
                )}
                تأیید و انتشار در جایگاه
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ============ Reject dialog ============ */}
      <AlertDialog open={!!rejectId} onOpenChange={(o) => !o && setRejectId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>رد تبلیغ</AlertDialogTitle>
            <AlertDialogDescription>
              با رد تبلیغ، کمپین متوقف می‌شود و مالک می‌تواند آن را ویرایش و دوباره ارسال کند.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => rejectId && rejectMut.mutate(rejectId)}
            >
              رد کن
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------------------------------------------------------------------
// Placements CRUD manager
// ---------------------------------------------------------------------
function PlacementsManager({
  placementsQ,
  onInvalidate,
}: {
  placementsQ: ReturnType<typeof useQuery<AdPlacementRow[]>>;
  onInvalidate: () => void;
}) {
  const [editing, setEditing] = useState<AdPlacementRow | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteKey, setDeleteKey] = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: createPlacement,
    onSuccess: () => {
      toast.success("جایگاه ایجاد شد.");
      setShowCreate(false);
      onInvalidate();
    },
    onError: (e: Error) => toast.error(e.message ?? "ایجاد ناموفق بود."),
  });
  const updateMut = useMutation({
    mutationFn: ({ key, body }: { key: string; body: Partial<AdPlacementRow> }) =>
      updatePlacement(key, body),
    onSuccess: () => {
      toast.success("جایگاه به‌روز شد.");
      setEditing(null);
      onInvalidate();
    },
    onError: (e: Error) => toast.error(e.message ?? "به‌روزرسانی ناموفق بود."),
  });
  const deleteMut = useMutation({
    mutationFn: deletePlacement,
    onSuccess: () => {
      toast.success("جایگاه حذف شد.");
      setDeleteKey(null);
      onInvalidate();
    },
    onError: (e: Error) => toast.error(e.message ?? "حذف ناموفق بود."),
  });

  const rows = placementsQ.data ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
        <CardTitle className="text-sm">
          جایگاه‌های تبلیغات ({toPersianDigits(rows.length)})
        </CardTitle>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <PlusIcon className="size-4" />
          جایگاه جدید
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {placementsQ.isLoading && (
          <div className="flex flex-col gap-2 p-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}
        {placementsQ.error && (
          <div className="p-4 text-sm text-destructive">بارگذاری جایگاه‌ها ناموفق بود.</div>
        )}
        {!placementsQ.isLoading && rows.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
            <MegaphoneIcon className="size-8 opacity-50" />
            <div>هنوز جایگاهی تعریف نشده است.</div>
            <Button size="sm" variant="outline" onClick={() => setShowCreate(true)}>
              <PlusIcon className="size-4" /> ساخت جایگاه
            </Button>
          </div>
        )}
        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>کلید</TableHead>
                  <TableHead>برچسب</TableHead>
                  <TableHead>نوع</TableHead>
                  <TableHead>سایز پیشنهادی</TableHead>
                  <TableHead>ترتیب</TableHead>
                  <TableHead>کمپین‌ها</TableHead>
                  <TableHead>وضعیت</TableHead>
                  <TableHead className="text-left">عملیات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => (
                  <TableRow key={p.key}>
                    <TableCell className="font-mono text-xs" dir="ltr">{p.key}</TableCell>
                    <TableCell className="font-medium">{p.labelFa}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{kindLabelFa(p.kind)}</Badge>
                      {p.kind === "slider" && (
                        <div className="mt-1 text-[10px] text-muted-foreground">{SLIDER_HINT}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="tabular-nums">
                        {p.recommendedWidth > 0 && p.recommendedHeight > 0
                          ? `${toPersianDigits(p.recommendedWidth)}×${toPersianDigits(p.recommendedHeight)} پیکسل`
                          : "—"}
                      </Badge>
                      {p.maxFileBytes > 0 && (
                        <div className="mt-1 text-[10px] text-muted-foreground">
                          حداکثر {toPersianDigits((p.maxFileBytes / (1024 * 1024)).toFixed(1))} مگابایت
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums text-xs">{toPersianDigits(p.sortOrder)}</TableCell>
                    <TableCell className="tabular-nums text-xs">{toPersianDigits(p.campaignCount)}</TableCell>
                    <TableCell>
                      {p.active ? (
                        <Badge className="bg-emerald-500 text-white">فعال</Badge>
                      ) : (
                        <Badge variant="secondary">غیرفعال</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          title="ویرایش"
                          onClick={() => setEditing(p)}
                        >
                          <PencilIcon className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          title="حذف"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleteKey(p.key)}
                          disabled={p.campaignCount > 0}
                        >
                          <Trash2Icon className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* Create dialog — `key="create"` keeps it stable; reset happens via useEffect on open */}
      <PlacementFormDialog
        key="create"
        open={showCreate}
        onOpenChange={setShowCreate}
        mode="create"
        onSubmit={(body) => createMut.mutate(body)}
        pending={createMut.isPending}
      />

      {/* Edit dialog — `key={editing?.key}` forces remount when the target row changes so the form re-syncs from `initial` */}
      <PlacementFormDialog
        key={editing?.key ?? "edit-closed"}
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        mode="edit"
        initial={editing ?? undefined}
        // For edit mode the key field is read-only (PK + FK target — renaming
        // would break the FK from AdCampaign.placement).
        onSubmit={(body) => editing && updateMut.mutate({ key: editing.key, body })}
        pending={updateMut.isPending}
      />

      {/* Delete confirm */}
      <AlertDialog open={!!deleteKey} onOpenChange={(o) => !o && setDeleteKey(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف جایگاه</AlertDialogTitle>
            <AlertDialogDescription>
              آیا از حذف این جایگاه مطمئن هستید؟ این عمل قابل بازگشت نیست.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteKey && deleteMut.mutate(deleteKey)}
            >
              حذف کن
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </Card>
  );
}

// ---------------------------------------------------------------------
// Placement create/edit form (single dialog, two modes)
// ---------------------------------------------------------------------
function PlacementFormDialog({
  open,
  onOpenChange,
  mode,
  initial,
  onSubmit,
  pending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: "create" | "edit";
  initial?: AdPlacementRow;
  onSubmit: (body: {
    key: string;
    labelFa: string;
    descriptionFa?: string;
    kind: string;
    active: boolean;
    sortOrder: number;
    recommendedWidth: number;
    recommendedHeight: number;
    maxFileBytes: number;
  }) => void;
  pending: boolean;
}) {
  const [key, setKey] = useState(initial?.key ?? "");
  const [labelFa, setLabelFa] = useState(initial?.labelFa ?? "");
  const [descriptionFa, setDescriptionFa] = useState(initial?.descriptionFa ?? "");
  const [kind, setKind] = useState<string>(initial?.kind ?? "banner_inline");
  const [active, setActive] = useState<boolean>(initial?.active ?? true);
  const [sortOrder, setSortOrder] = useState<number>(initial?.sortOrder ?? 0);
  const [recommendedWidth, setRecommendedWidth] = useState<number>(initial?.recommendedWidth ?? 0);
  const [recommendedHeight, setRecommendedHeight] = useState<number>(initial?.recommendedHeight ?? 0);
  // Stored as MiB on the form side (the user-facing label is «مگابایت»); converted
  // to bytes on submit so the API's `maxFileBytes` Int stays in the canonical unit.
  const [maxFileMiB, setMaxFileMiB] = useState<number>(
    initial?.maxFileBytes && initial.maxFileBytes > 0
      ? +(initial.maxFileBytes / (1024 * 1024)).toFixed(2)
      : 0,
  );

  // When the dialog opens (false→true), resync the form fields from `initial`.
  // For create mode the form is reset to defaults; for edit mode it loads the
  // row being edited. The component is keyed by `editing?.key` (see parent)
  // so the very first mount initializes from `initial` directly.
  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && initial) {
      setKey(initial.key);
      setLabelFa(initial.labelFa);
      setDescriptionFa(initial.descriptionFa);
      setKind(initial.kind);
      setActive(initial.active);
      setSortOrder(initial.sortOrder);
      setRecommendedWidth(initial.recommendedWidth);
      setRecommendedHeight(initial.recommendedHeight);
      setMaxFileMiB(
        initial.maxFileBytes && initial.maxFileBytes > 0
          ? +(initial.maxFileBytes / (1024 * 1024)).toFixed(2)
          : 0,
      );
    } else if (mode === "create") {
      setKey("");
      setLabelFa("");
      setDescriptionFa("");
      setKind("banner_inline");
      setActive(true);
      setSortOrder(0);
      setRecommendedWidth(0);
      setRecommendedHeight(0);
      setMaxFileMiB(0);
    }
  }, [open, mode, initial]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "create" && !/^[a-z0-9_]{2,60}$/.test(key.trim())) {
      toast.error("کلید فقط شامل حروف کوچک انگلیسی، عدد و زیرخط باشد (۲ تا ۶۰ نویسه).");
      return;
    }
    if (labelFa.trim().length < 1) {
      toast.error("برچسب فارسی الزامی است.");
      return;
    }
    onSubmit({
      key: key.trim(),
      labelFa: labelFa.trim(),
      descriptionFa: descriptionFa.trim() || undefined,
      kind,
      active,
      sortOrder: Number.isFinite(sortOrder) ? Math.trunc(sortOrder) : 0,
      recommendedWidth: Number.isFinite(recommendedWidth) ? Math.max(0, Math.trunc(recommendedWidth)) : 0,
      recommendedHeight: Number.isFinite(recommendedHeight) ? Math.max(0, Math.trunc(recommendedHeight)) : 0,
      maxFileBytes: Number.isFinite(maxFileMiB) && maxFileMiB > 0
        ? Math.min(20 * 1024 * 1024, Math.trunc(maxFileMiB * 1024 * 1024))
        : 0,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "جایگاه تبلیغاتی جدید" : "ویرایش جایگاه"}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "جایگاه‌ها اسلات‌های نمایش هستند که کمپین‌ها به آن‌ها متصل می‌شوند."
              : "کلید جایگاه قابل ویرایش نیست (مرجع کلید خارجی کمپین‌هاست)."}
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-3" onSubmit={submit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pl-key">کلید (لاتین)</Label>
            <Input
              id="pl-key"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              disabled={mode === "edit" || pending}
              dir="ltr"
              placeholder="مثلاً: user_dashboard_top"
              maxLength={60}
            />
            <p className="text-xs text-muted-foreground">
              فقط حروف کوچک انگلیسی، عدد و زیرخط. حداکثر ۶۰ نویسه.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pl-label">برچسب فارسی</Label>
            <Input
              id="pl-label"
              value={labelFa}
              onChange={(e) => setLabelFa(e.target.value)}
              disabled={pending}
              maxLength={120}
              placeholder="مثلاً: بالای داشبورد کاربر"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pl-desc">توضیحات (اختیاری)</Label>
            <Textarea
              id="pl-desc"
              value={descriptionFa}
              onChange={(e) => setDescriptionFa(e.target.value)}
              rows={2}
              disabled={pending}
              maxLength={500}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label>نوع جایگاه</Label>
              <Select value={kind} onValueChange={setKind} disabled={pending}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {KIND_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {kind === "slider" && (
                <p className="text-[11px] text-muted-foreground">{SLIDER_HINT}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pl-order">ترتیب نمایش</Label>
              <Input
                id="pl-order"
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value))}
                disabled={pending}
                min={0}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pl-active">فعال</Label>
              <div className="flex h-9 items-center">
                <Switch
                  id="pl-active"
                  checked={active}
                  onCheckedChange={setActive}
                  disabled={pending}
                />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pl-rw">عرض پیشنهادی (px)</Label>
              <Input
                id="pl-rw"
                type="number"
                value={recommendedWidth}
                onChange={(e) => setRecommendedWidth(Number(e.target.value))}
                disabled={pending}
                min={0}
                max={8000}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pl-rh">ارتفاع پیشنهادی (px)</Label>
              <Input
                id="pl-rh"
                type="number"
                value={recommendedHeight}
                onChange={(e) => setRecommendedHeight(Number(e.target.value))}
                disabled={pending}
                min={0}
                max={8000}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pl-mb">حداکثر حجم فایل (مگابایت)</Label>
              <Input
                id="pl-mb"
                type="number"
                value={maxFileMiB}
                onChange={(e) => setMaxFileMiB(Number(e.target.value))}
                disabled={pending}
                min={0}
                max={20}
                step={0.5}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            صفر یعنی «بدون محدودیت». این مقادیر هنگام ساخت کمپین به کاربر نمایش داده می‌شوند.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              انصراف
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : mode === "create" ? (
                <PlusIcon className="size-4" />
              ) : (
                <SaveIcon className="size-4" />
              )}
              {mode === "create" ? "ایجاد جایگاه" : "ذخیره تغییرات"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------
export function AdminAdsView(props: AdminAdsViewProps) {
  return (
    <AdminGate>
      <AdminAdsInner {...props} />
    </AdminGate>
  );
}

export default AdminAdsView;
