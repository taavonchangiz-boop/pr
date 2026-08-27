"use client";
// =====================================================================
// POSTYAR — Admin Plans View
// ---------------------------------------------------------------------
// Table of all plans + «پلن جدید». Edit form: nameFa, descriptionFa,
// priceRials (number), intervalMonths, quota JSON editor (with helper
// chips for known dimensions), isPublic toggle, active toggle.
// Save via POST/PATCH /api/admin/plans.
// =====================================================================
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Loader2Icon,
  PackageIcon,
  PencilIcon,
  PlusIcon,
  SaveIcon,
  Trash2Icon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, type AdminPlanRow, type PlanQuota } from "@/components/postyar/api";
import { AdminGate } from "@/components/postyar/admin/gate";
import { formatRials, toPersianDigits } from "@/lib/persian";

const KNOWN_QUOTA_KEYS: Array<{ key: keyof PlanQuota; label: string }> = [
  { key: "publishPerMonth", label: "انتشار در ماه" },
  { key: "aiPerMonth", label: "هوش مصنوعی در ماه" },
  { key: "channels", label: "کانال‌ها" },
  { key: "automation", label: "اتوماسیون" },
];

interface PlanFormState {
  id?: string;
  code: string;
  nameFa: string;
  descriptionFa: string;
  priceRials: string;
  intervalMonths: string;
  quotaJson: string;
  active: boolean;
  isPublic: boolean;
}

function emptyForm(): PlanFormState {
  return {
    code: "",
    nameFa: "",
    descriptionFa: "",
    priceRials: "0",
    intervalMonths: "1",
    quotaJson: "{}",
    active: true,
    isPublic: true,
  };
}

function fromRow(r: AdminPlanRow): PlanFormState {
  return {
    id: r.id,
    code: r.code,
    nameFa: r.nameFa,
    descriptionFa: r.descriptionFa,
    priceRials: String(r.priceRials),
    intervalMonths: String(r.intervalMonths),
    quotaJson: JSON.stringify(r.quota ?? {}, null, 2),
    active: r.active,
    isPublic: r.isPublic,
  };
}

export interface AdminPlansViewProps {
  navigate: (to: string) => void;
}

function AdminPlansInner({ navigate: _navigate }: AdminPlansViewProps) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<PlanFormState>(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["admin", "plans"],
    queryFn: () => api.getAdminPlansTyped(),
    staleTime: 30_000,
  });

  function openCreate() {
    setForm(emptyForm());
    setShowForm(true);
  }
  function openEdit(r: AdminPlanRow) {
    setForm(fromRow(r));
    setShowForm(true);
  }

  const saveMut = useMutation({
    mutationFn: async () => {
      const quota = (() => {
        try { return JSON.parse(form.quotaJson || "{}") as PlanQuota; } catch { throw new Error("JSON سهمیه نامعتبر است."); }
      })();
      const priceRials = Number(form.priceRials.replace(/[,٬]/g, ""));
      const intervalMonths = Number(form.intervalMonths);
      if (!Number.isFinite(priceRials) || priceRials < 0) throw new Error("مبلغ نامعتبر است.");
      if (!Number.isFinite(intervalMonths) || intervalMonths < 1 || intervalMonths > 12) throw new Error("بازهٔ ماه نامعتبر است.");
      if (form.id) {
        return api.adminUpdatePlan(form.id, {
          nameFa: form.nameFa.trim(),
          descriptionFa: form.descriptionFa,
          priceRials,
          intervalMonths,
          quota,
          active: form.active,
          isPublic: form.isPublic,
        });
      }
      return api.adminCreatePlan({
        code: form.code.trim().toUpperCase(),
        nameFa: form.nameFa.trim(),
        descriptionFa: form.descriptionFa,
        priceRials,
        intervalMonths,
        quota,
        active: form.active,
        isPublic: form.isPublic,
      });
    },
    onSuccess: () => {
      toast.success("طرح ذخیره شد.");
      setShowForm(false);
      qc.invalidateQueries({ queryKey: ["admin", "plans"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "ذخیره ناموفق بود."),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.adminDeletePlan(id),
    onSuccess: () => {
      toast.success("طرح غیرفعال شد.");
      setDeleteId(null);
      qc.invalidateQueries({ queryKey: ["admin", "plans"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "حذف ناموفق بود."),
  });

  const plans = q.data?.items ?? [];

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <PackageIcon className="size-6" />
            پلن‌ها
          </h1>
          <p className="text-sm text-muted-foreground">تعریف و مدیریت پلن‌های اشتراک.</p>
        </div>
        <Button onClick={openCreate}>
          <PlusIcon className="size-4" /> پلن جدید
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">فهرست پلن‌ها ({toPersianDigits(plans.length)})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {q.isLoading && (
            <div className="flex flex-col gap-2 p-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          )}
          {plans.length === 0 && !q.isLoading && (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
              <PackageIcon className="size-8 opacity-50" />
              <div>هیچ پلنی تعریف نشده است.</div>
            </div>
          )}
          {plans.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>کد</TableHead>
                    <TableHead>نام</TableHead>
                    <TableHead>مبلغ</TableHead>
                    <TableHead>بازه</TableHead>
                    <TableHead>اشتراک‌ها</TableHead>
                    <TableHead>وضعیت</TableHead>
                    <TableHead className="text-left">عملیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {plans.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell dir="ltr" className="font-mono text-xs">{p.code}</TableCell>
                      <TableCell className="font-medium">{p.nameFa}</TableCell>
                      <TableCell className="tabular-nums text-xs">{p.priceRialsFa ?? formatRials(p.priceRials)}</TableCell>
                      <TableCell className="tabular-nums text-xs">{toPersianDigits(p.intervalMonths)} ماه</TableCell>
                      <TableCell className="tabular-nums text-xs">{toPersianDigits(p.subscriptionCount)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {p.active ? <Badge variant="default">فعال</Badge> : <Badge variant="secondary">غیرفعال</Badge>}
                          {p.isPublic ? <Badge variant="outline">عمومی</Badge> : <Badge variant="outline">خصوصی</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>
                            <PencilIcon className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeleteId(p.id)}
                            disabled={p.code === "free"}
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
      </Card>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent dir="rtl" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "ویرایش پلن" : "پلن جدید"}</DialogTitle>
            <DialogDescription>
              سهمیه را به‌صورت JSON معتبر وارد کنید. کلیدهای پیشنهادی زیر را با کلیک اضافه کنید.
            </DialogDescription>
          </DialogHeader>
          <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); saveMut.mutate(); }}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="p-code">کد پلن</Label>
                <Input
                  id="p-code" dir="ltr" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })}
                  disabled={!!form.id} maxLength={40}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="p-name">نام (فارسی)</Label>
                <Input id="p-name" value={form.nameFa} onChange={(e) => setForm({ ...form, nameFa: e.target.value })} maxLength={80} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="p-desc">توضیحات</Label>
              <Textarea id="p-desc" rows={2} value={form.descriptionFa} onChange={(e) => setForm({ ...form, descriptionFa: e.target.value })} maxLength={800} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="p-price">مبلغ (ریال)</Label>
                <Input id="p-price" inputMode="numeric" dir="ltr" value={form.priceRials} onChange={(e) => setForm({ ...form, priceRials: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="p-int">بازه (ماه)</Label>
                <Input id="p-int" type="number" min={1} max={12} dir="ltr" value={form.intervalMonths} onChange={(e) => setForm({ ...form, intervalMonths: e.target.value })} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="p-quota">سهمیه (JSON)</Label>
              <Textarea id="p-quota" rows={5} dir="ltr" className="font-mono text-xs" value={form.quotaJson} onChange={(e) => setForm({ ...form, quotaJson: e.target.value })} />
              <div className="flex flex-wrap gap-1">
                {KNOWN_QUOTA_KEYS.map((k) => (
                  <Button
                    key={k.key as string}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setForm((f) => {
                      try {
                        const obj = JSON.parse(f.quotaJson || "{}") as Record<string, number>;
                        if (!(k.key in obj)) obj[k.key as string] = 0;
                        return { ...f, quotaJson: JSON.stringify(obj, null, 2) };
                      } catch {
                        return { ...f, quotaJson: JSON.stringify({ [k.key as string]: 0 }, null, 2) };
                      }
                    })}
                  >
                    <PlusIcon className="size-3" /> {k.label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
                فعال
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={form.isPublic} onCheckedChange={(v) => setForm({ ...form, isPublic: v })} />
                عمومی
              </label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>انصراف</Button>
              <Button type="submit" disabled={saveMut.isPending || (form.id ? false : form.code.trim().length < 2) || form.nameFa.trim().length < 2}>
                {saveMut.isPending ? <Loader2Icon className="size-4 animate-spin" /> : <SaveIcon className="size-4" />}
                ذخیره
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>غیرفعال‌سازی پلن</AlertDialogTitle>
            <AlertDialogDescription>
              پلن به‌جای حذف قطعی، غیرفعال و خصوصی می‌شود تا اشتراک‌های فعال دست‌نخورده بمانند.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteMut.mutate(deleteId)}
            >
              غیرفعال کن
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function AdminPlansView(props: AdminPlansViewProps) {
  return (
    <AdminGate>
      <AdminPlansInner {...props} />
    </AdminGate>
  );
}

void useEffect;
export default AdminPlansView;
