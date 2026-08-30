"use client";
// =====================================================================
// POSTYAR — Admin Ticket Departments Manager
// ---------------------------------------------------------------------
// A self-contained CRUD view for `TicketDepartment`. Used inside the
// admin/tickets.tsx page via a Dialog (so we don't need a new dashboard
// route — the dashboard router is owned by another agent).
//
// Capabilities:
//   - List departments sorted by priority (asc) + name (asc).
//   - «دپارتمان جدید» dialog (name + description + priority + active).
//   - Inline edit (same dialog, prefilled) + delete with confirm.
//   - Toast (sonner) on success/error.
//   - Loading skeleton + empty state.
//   - All Persian, RTL, lucide icons only, cursor-pointer + ring on
//     clickables, Persian digits.
// =====================================================================
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertCircleIcon,
  CheckIcon,
  LayersIcon,
  Loader2Icon,
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
import { api, type TicketDepartmentRow } from "@/components/postyar/api";
import { toPersianDigits } from "@/lib/persian";

interface DepartmentFormState {
  id?: string;
  nameFa: string;
  descriptionFa: string;
  priority: string;
  active: boolean;
}

function emptyForm(): DepartmentFormState {
  return {
    nameFa: "",
    descriptionFa: "",
    priority: "100",
    active: true,
  };
}

function fromRow(r: TicketDepartmentRow): DepartmentFormState {
  return {
    id: r.id,
    nameFa: r.nameFa,
    descriptionFa: r.descriptionFa ?? "",
    priority: String(r.priority ?? 100),
    active: r.active,
  };
}

export interface TicketDepartmentsManagerProps {
  /** Optional: hide the outer Card chrome when embedded inside a Dialog. */
  embedded?: boolean;
}

export function TicketDepartmentsManager({ embedded = false }: TicketDepartmentsManagerProps) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<DepartmentFormState>(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["admin", "ticket-departments"],
    queryFn: () => api.getTicketDepartments(),
    staleTime: 30_000,
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      const nameFa = form.nameFa.trim();
      if (nameFa.length < 1) throw new Error("نام دپارتمان لازم است.");
      const priorityNum = Number(form.priority.replace(/[,٬]/g, ""));
      if (!Number.isFinite(priorityNum) || priorityNum < 0 || priorityNum > 10000) {
        throw new Error("عدد اولویت نامعتبر است.");
      }
      if (form.id) {
        return api.adminUpdateDepartment(form.id, {
          nameFa,
          descriptionFa: form.descriptionFa,
          priority: priorityNum,
          active: form.active,
        });
      }
      return api.adminCreateDepartment({
        nameFa,
        descriptionFa: form.descriptionFa,
        priority: priorityNum,
        active: form.active,
      });
    },
    onSuccess: () => {
      toast.success("دپارتمان ذخیره شد.");
      setShowForm(false);
      qc.invalidateQueries({ queryKey: ["admin", "ticket-departments"] });
      qc.invalidateQueries({ queryKey: ["admin", "tickets"] });
      // Also invalidate the user-facing active-departments query so the
      // create-ticket dialog dropdown picks up the new department without
      // waiting for the 60s staleTime to elapse.
      qc.invalidateQueries({ queryKey: ["tickets", "departments", "user"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "ذخیره ناموفق بود."),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.adminDeleteDepartment(id),
    onSuccess: () => {
      toast.success("دپارتمان حذف شد. تیکت‌های مرتبط بدون دپارتمان باقی می‌مانند.");
      setDeleteId(null);
      qc.invalidateQueries({ queryKey: ["admin", "ticket-departments"] });
      qc.invalidateQueries({ queryKey: ["admin", "tickets"] });
      qc.invalidateQueries({ queryKey: ["tickets", "departments", "user"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "حذف ناموفق بود."),
  });

  const departments = q.data?.items ?? [];
  const saving = saveMut.isPending;
  const deleting = deleteMut.isPending;

  const body = (
    <>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex flex-wrap items-center gap-2">
          <LayersIcon className="size-4" />
          <span>دپارتمان‌های پشتیبانی ({toPersianDigits(departments.length)})</span>
          {q.isFetching && <Loader2Icon className="size-3.5 animate-spin" />}
          <div className="mr-auto">
            <Button
              size="sm"
              onClick={() => {
                setForm(emptyForm());
                setShowForm(true);
              }}
            >
              <PlusIcon className="size-4" />
              دپارتمان جدید
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {q.isLoading && (
          <div className="flex flex-col gap-2 p-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}
        {q.error && !q.isLoading && (
          <div className="p-4 text-sm text-destructive flex items-center gap-2">
            <AlertCircleIcon className="size-4" />
            بارگذاری دپارتمان‌ها ناموفق بود.
          </div>
        )}
        {!q.isLoading && departments.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
            <LayersIcon className="size-8 opacity-50" />
            <div>هنوز دپارتمانی تعریف نشده است.</div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setForm(emptyForm());
                setShowForm(true);
              }}
            >
              <PlusIcon className="size-4" />
              تعریف اولین دپارتمان
            </Button>
          </div>
        )}
        {departments.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>نام</TableHead>
                  <TableHead>توضیحات</TableHead>
                  <TableHead>اولویت</TableHead>
                  <TableHead>تیکت‌ها</TableHead>
                  <TableHead>وضعیت</TableHead>
                  <TableHead className="text-left">عملیات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {departments.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.nameFa}</TableCell>
                    <TableCell className="max-w-[280px] truncate text-xs text-muted-foreground">
                      {d.descriptionFa || "—"}
                    </TableCell>
                    <TableCell className="tabular-nums text-xs">
                      {toPersianDigits(d.priority)}
                    </TableCell>
                    <TableCell className="tabular-nums text-xs">
                      {toPersianDigits(d.ticketCount)}
                    </TableCell>
                    <TableCell>
                      {d.active ? (
                        <Badge variant="default">فعال</Badge>
                      ) : (
                        <Badge variant="secondary">غیرفعال</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label="ویرایش دپارتمان"
                          onClick={() => {
                            setForm(fromRow(d));
                            setShowForm(true);
                          }}
                        >
                          <PencilIcon className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          aria-label="حذف دپارتمان"
                          onClick={() => setDeleteId(d.id)}
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

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{form.id ? "ویرایش دپارتمان" : "دپارتمان جدید"}</DialogTitle>
            <DialogDescription>
              {form.id
                ? "نام، توضیحات، اولویت یا وضعیت دپارتمان را به‌روز کنید."
                : "برای دسته‌بندی تیکت‌ها یک دپارتمان جدید تعریف کنید. عدد اولویت کمتر = بالاتر."}
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              saveMut.mutate();
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dep-name">نام</Label>
              <Input
                id="dep-name"
                value={form.nameFa}
                onChange={(e) => setForm((f) => ({ ...f, nameFa: e.target.value }))}
                maxLength={60}
                placeholder="مثلاً: فنی، مالی، فروش، پشتیبانی عمومی"
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dep-desc">توضیحات (اختیاری)</Label>
              <Textarea
                id="dep-desc"
                value={form.descriptionFa}
                onChange={(e) => setForm((f) => ({ ...f, descriptionFa: e.target.value }))}
                rows={3}
                maxLength={500}
                placeholder="شرح مختصری از حوزهٔ دپارتمان..."
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dep-priority">اولویت (عدد، کمتر = بالاتر)</Label>
              <Input
                id="dep-priority"
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                inputMode="numeric"
                placeholder="100"
              />
            </div>
            <div className="flex items-center justify-between gap-2 rounded-md border p-2">
              <div className="flex flex-col gap-0.5">
                <Label htmlFor="dep-active" className="cursor-pointer">فعال</Label>
                <span className="text-xs text-muted-foreground">
                  دپارتمان‌های غیرفعال در فیلترها دیده نمی‌شوند.
                </span>
              </div>
              <Switch
                id="dep-active"
                checked={form.active}
                onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                انصراف
              </Button>
              <Button
                type="submit"
                disabled={saving || form.nameFa.trim().length < 1}
              >
                {saving ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : form.id ? (
                  <SaveIcon className="size-4" />
                ) : (
                  <PlusIcon className="size-4" />
                )}
                {form.id ? "ذخیره تغییرات" : "ایجاد دپارتمان"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف این دپارتمان؟</AlertDialogTitle>
            <AlertDialogDescription>
              با حذف این دپارتمان، تیکت‌های مرتبط بدون دپارتمان باقی می‌مانند
              (ارجاع آن‌ها به null ختم می‌شود). این عمل قابل بازگشت نیست.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (deleteId) deleteMut.mutate(deleteId);
              }}
            >
              {deleting ? <Loader2Icon className="size-4 animate-spin" /> : <CheckIcon className="size-4" />}
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  if (embedded) {
    return (
      <div className="flex flex-col gap-3" dir="rtl">
        <div className="flex items-center gap-2 text-sm font-medium">
          <LayersIcon className="size-4" />
          دپارتمان‌های پشتیبانی
        </div>
        <div className="rounded-md border">{body}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <LayersIcon className="size-6" />
          دپارتمان‌های پشتیبانی
        </h1>
        <p className="text-sm text-muted-foreground">
          دپارتمان‌ها را تعریف، ویرایش یا حذف کنید. عدد اولویت کمتر = نمایش بالاتر.
        </p>
      </div>
      <Card>{body}</Card>
    </div>
  );
}

export default TicketDepartmentsManager;
