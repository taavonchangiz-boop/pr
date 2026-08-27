"use client";
// =====================================================================
// POSTYAR — Admin Discounts View
// ---------------------------------------------------------------------
// Table of discounts + «تخفیف جدید»: code, kind (percent/fixed), value,
// maxUses, perUserLimit, expiresAt (Jalali picker), active toggle,
// plans multi-select. Save via POST /api/admin/discounts.
// =====================================================================
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  SaveIcon,
  TicketIcon,
  Trash2Icon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  JalaliPicker,
  type JalaliValue,
} from "@/components/postyar/jalali-picker/jalali-picker";
import { api, type AdminDiscountRow, type PlanRow } from "@/components/postyar/api";
import { AdminGate } from "@/components/postyar/admin/gate";
import { formatRials, jalaliToUtcIso, toPersianDigits } from "@/lib/persian";

interface DiscountFormState {
  id?: string;
  code: string;
  kind: "percent" | "fixed";
  value: string;
  maxUses: string;
  perUserLimit: string;
  expiresAt: JalaliValue | null;
  active: boolean;
  planIds: string[];
}

function emptyForm(): DiscountFormState {
  return {
    code: "",
    kind: "percent",
    value: "10",
    maxUses: "100",
    perUserLimit: "1",
    expiresAt: null,
    active: true,
    planIds: [],
  };
}

function fromRow(r: AdminDiscountRow): DiscountFormState {
  // We don't have a J-G-Picker initializer from ISO; the form expiresAt will
  // be null when editing (so the user picks again or it stays unchanged).
  return {
    id: r.id,
    code: r.code,
    kind: r.kind,
    value: String(r.value),
    maxUses: String(r.maxUses),
    perUserLimit: String(r.perUserLimit),
    expiresAt: null,
    active: r.active,
    planIds: r.planIds ?? [],
  };
}

export interface AdminDiscountsViewProps {
  navigate: (to: string) => void;
}

function AdminDiscountsInner({ navigate: _navigate }: AdminDiscountsViewProps) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<DiscountFormState>(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["admin", "discounts"],
    queryFn: () => api.getAdminDiscountsTyped(),
    staleTime: 30_000,
  });
  const plansQ = useQuery({
    queryKey: ["plans", "all"],
    queryFn: () => api.getPlans(),
    staleTime: 60_000,
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      const value = Number(form.value.replace(/[,٬]/g, ""));
      const maxUses = Number(form.maxUses || "0");
      const perUserLimit = Number(form.perUserLimit || "1");
      if (!Number.isFinite(value) || value < 0) throw new Error("مقدار نامعتبر است.");
      if (form.kind === "percent" && value > 100) throw new Error("درصد نمی‌تواند بیش از ۱۰۰ باشد.");
      const expiresAt = form.expiresAt
        ? jalaliToUtcIso(form.expiresAt.jy, form.expiresAt.jm, form.expiresAt.jd, form.expiresAt.hour, form.expiresAt.minute)
        : (form.id ? null : undefined);
      const body = {
        code: form.code.trim().toUpperCase(),
        kind: form.kind,
        value,
        maxUses,
        perUserLimit,
        expiresAt: expiresAt === null ? null : expiresAt,
        active: form.active,
        planIds: form.planIds,
      };
      if (form.id) {
        return api.adminUpdateDiscount(form.id, body);
      }
      return api.adminCreateDiscount(body);
    },
    onSuccess: () => {
      toast.success("تخفیف ذخیره شد.");
      setShowForm(false);
      qc.invalidateQueries({ queryKey: ["admin", "discounts"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "ذخیره ناموفق بود."),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.adminDeleteDiscount(id),
    onSuccess: () => {
      toast.success("تخفیف حذف شد.");
      setDeleteId(null);
      qc.invalidateQueries({ queryKey: ["admin", "discounts"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "حذف ناموفق بود."),
  });

  const discounts = q.data?.items ?? [];
  const plans: PlanRow[] = plansQ.data ?? [];

  function togglePlan(id: string) {
    setForm((f) => ({
      ...f,
      planIds: f.planIds.includes(id) ? f.planIds.filter((p) => p !== id) : [...f.planIds, id],
    }));
  }

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <TicketIcon className="size-6" />
            تخفیف‌ها
          </h1>
          <p className="text-sm text-muted-foreground">تعریف و مدیریت کدهای تخفیف.</p>
        </div>
        <Button onClick={() => { setForm(emptyForm()); setShowForm(true); }}>
          <PlusIcon className="size-4" /> تخفیف جدید
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">فهرست تخفیف‌ها ({toPersianDigits(discounts.length)})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {q.isLoading && (
            <div className="flex flex-col gap-2 p-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          )}
          {discounts.length === 0 && !q.isLoading && (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
              <TicketIcon className="size-8 opacity-50" />
              <div>هیچ تخفیفی تعریف نشده است.</div>
            </div>
          )}
          {discounts.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>کد</TableHead>
                    <TableHead>نوع</TableHead>
                    <TableHead>مقدار</TableHead>
                    <TableHead>مصرف</TableHead>
                    <TableHead>انقضا</TableHead>
                    <TableHead>وضعیت</TableHead>
                    <TableHead className="text-left">عملیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {discounts.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell dir="ltr" className="font-mono text-xs">{d.code}</TableCell>
                      <TableCell className="text-xs">{d.kind === "percent" ? "درصدی" : "مبلغ ثابت"}</TableCell>
                      <TableCell className="tabular-nums text-xs">{d.valueFa}</TableCell>
                      <TableCell className="tabular-nums text-xs">{toPersianDigits(d.uses)} / {toPersianDigits(d.maxUses)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{d.expiresAtFa ?? "—"}</TableCell>
                      <TableCell>
                        {d.active ? <Badge variant="default">فعال</Badge> : <Badge variant="secondary">غیرفعال</Badge>}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => { setForm(fromRow(d)); setShowForm(true); }}>
                            <PencilIcon className="size-4" />
                          </Button>
                          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteId(d.id)}>
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
            <DialogTitle>{form.id ? "ویرایش تخفیف" : "تخفیف جدید"}</DialogTitle>
            <DialogDescription>برای کد از حروف لاتین و اعداد استفاده کنید. حروف به‌صورت خودکار بزرگ می‌شوند.</DialogDescription>
          </DialogHeader>
          <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); saveMut.mutate(); }}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="d-code">کد</Label>
                <Input id="d-code" dir="ltr" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} maxLength={40} disabled={!!form.id} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>نوع</Label>
                <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v as "percent" | "fixed" })}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">درصدی</SelectItem>
                    <SelectItem value="fixed">مبلغ ثابت</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="d-val">مقدار</Label>
                <Input id="d-val" dir="ltr" inputMode="numeric" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
                <span className="text-[10px] text-muted-foreground">{form.kind === "percent" ? "۰ تا ۱۰۰" : "به ریال"}</span>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="d-max">حداکثر مصرف</Label>
                <Input id="d-max" dir="ltr" inputMode="numeric" value={form.maxUses} onChange={(e) => setForm({ ...form, maxUses: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="d-per">سقف هر کاربر</Label>
                <Input id="d-per" dir="ltr" inputMode="numeric" value={form.perUserLimit} onChange={(e) => setForm({ ...form, perUserLimit: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>تاریخ انقضا</Label>
                <JalaliPicker value={form.expiresAt ?? undefined} onChange={(v) => setForm({ ...form, expiresAt: v })} mode="future" placeholder="انتخاب تاریخ" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
              <span className="text-sm">فعال</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>پلن‌های مرتبط (اختیاری)</Label>
              <div className="flex flex-wrap gap-1">
                {plans.length === 0 && <span className="text-xs text-muted-foreground">در حال بارگذاری پلن‌ها...</span>}
                {plans.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => togglePlan(p.id)}
                    className={
                      "rounded-md border px-2 py-1 text-xs transition-colors " +
                      (form.planIds.includes(p.id) ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted")
                    }
                  >
                    {p.nameFa}
                  </button>
                ))}
              </div>
              <span className="text-[10px] text-muted-foreground">اگر خالی بگذارید، تخفیف روی همهٔ پلن‌ها اعمال می‌شود.</span>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>انصراف</Button>
              <Button type="submit" disabled={saveMut.isPending || form.code.trim().length < 3}>
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
            <AlertDialogTitle>حذف تخفیف</AlertDialogTitle>
            <AlertDialogDescription>این عمل قابل بازگشت نیست. مصرف‌های ثبت‌شده در ممیزی باقی می‌مانند.</AlertDialogDescription>
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

export function AdminDiscountsView(props: AdminDiscountsViewProps) {
  return (
    <AdminGate>
      <AdminDiscountsInner {...props} />
    </AdminGate>
  );
}

void formatRials;
export default AdminDiscountsView;
