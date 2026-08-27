"use client";
// =====================================================================
// POSTYAR — Admin Ads View
// ---------------------------------------------------------------------
// Table of all ad campaigns across users: title, owner, status,
// start/end Jalali, impressions, clicks. Actions: approve/reject.
// =====================================================================
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckIcon,
  ExternalLinkIcon,
  EyeIcon,
  Loader2Icon,
  MegaphoneIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, type AdminAdRow } from "@/components/postyar/api";
import { AdminGate } from "@/components/postyar/admin/gate";
import { formatJalaliDate, toPersianDigits } from "@/lib/persian";

function statusBadge(s: string) {
  if (s === "approved") return <Badge variant="default">تأییدشده</Badge>;
  if (s === "pending") return <Badge variant="secondary">در انتظار</Badge>;
  if (s === "running") return <Badge variant="default">در حال نمایش</Badge>;
  if (s === "rejected") return <Badge variant="destructive">رد شده</Badge>;
  if (s === "completed") return <Badge variant="outline">پایان‌یافته</Badge>;
  return <Badge variant="outline">{s}</Badge>;
}

export interface AdminAdsViewProps {
  navigate: (to: string) => void;
}

function AdminAdsInner({ navigate: _navigate }: AdminAdsViewProps) {
  const qc = useQueryClient();
  const [view, setView] = useState<AdminAdRow | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["admin", "ads"],
    queryFn: () => api.getAdminAdsTyped(),
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

  const ads = q.data?.items ?? [];

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <MegaphoneIcon className="size-6" />
          مدیریت تبلیغات
        </h1>
        <p className="text-sm text-muted-foreground">
          بررسی و تأیید/رد کمپین‌های تبلیغاتی کاربران.
        </p>
      </div>

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
                      <TableCell className="text-xs text-muted-foreground">{a.startAt ? formatJalaliDate(a.startAt) : "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{a.endAt ? formatJalaliDate(a.endAt) : "—"}</TableCell>
                      <TableCell className="tabular-nums text-xs">{toPersianDigits(a.impressions)}</TableCell>
                      <TableCell className="tabular-nums text-xs">{toPersianDigits(a.clicks)}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" title="مشاهده" onClick={() => setView(a)}>
                            <EyeIcon className="size-4" />
                          </Button>
                          {(a.status === "pending" || a.status === "rejected") && (
                            <Button variant="ghost" size="sm" className="text-emerald-600" onClick={() => approveMut.mutate(a.id)} disabled={approveMut.isPending}>
                              <CheckIcon className="size-4" />
                            </Button>
                          )}
                          {a.status !== "rejected" && a.status !== "completed" && (
                            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setRejectId(a.id)}>
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

      <Dialog open={!!view} onOpenChange={(o) => !o && setView(null)}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{view?.title}</DialogTitle>
            <DialogDescription>
              {view?.ownerName ?? "—"} • {view?.placement}
            </DialogDescription>
          </DialogHeader>
          {view?.imageUrl && (
            <img src={view.imageUrl} alt={view.title} className="h-40 w-full rounded-md object-cover" />
          )}
          <div className="text-sm text-muted-foreground">{view?.descriptionFa}</div>
          {view?.link && (
            <a href={view.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-primary" dir="ltr">
              <ExternalLinkIcon className="size-3.5" /> {view.link}
            </a>
          )}
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline">نمایش: {toPersianDigits(view?.impressions ?? 0)}</Badge>
            <Badge variant="outline">کلیک: {toPersianDigits(view?.clicks ?? 0)}</Badge>
            {view && statusBadge(view.status)}
          </div>
        </DialogContent>
      </Dialog>

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

export function AdminAdsView(props: AdminAdsViewProps) {
  return (
    <AdminGate>
      <AdminAdsInner {...props} />
    </AdminGate>
  );
}

void Loader2Icon;
export default AdminAdsView;
