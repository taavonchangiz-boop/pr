"use client";
// =====================================================================
// POSTYAR — Admin Bank Cards View
// ---------------------------------------------------------------------
// Table of configured destination cards (masked only) + «کارت جدید»:
// cardNumberMask (we store last 4 + bank name + holder only — NEVER
// full PAN), holderName, bankName. Save via POST /api/admin/bank-cards.
// Delete via DELETE.
// =====================================================================
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CreditCardIcon,
  Loader2Icon,
  PlusIcon,
  SaveIcon,
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
import { api, type AdminBankCardRow } from "@/components/postyar/api";
import { AdminGate } from "@/components/postyar/admin/gate";
import { formatJalaliDate, toPersianDigits } from "@/lib/persian";

export interface AdminBankCardsViewProps {
  navigate: (to: string) => void;
}

function AdminBankCardsInner({ navigate: _navigate }: AdminBankCardsViewProps) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [cardNumber, setCardNumber] = useState("");
  const [holderName, setHolderName] = useState("");
  const [bankName, setBankName] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["admin", "bank-cards"],
    queryFn: () => api.getAdminBankCardsTyped(),
    staleTime: 30_000,
  });

  const createMut = useMutation({
    mutationFn: () => api.adminAddBankCard({
      cardNumber: cardNumber.replace(/[,٬\s]/g, ""),
      holderName: holderName.trim(),
      bankName: bankName.trim(),
    }),
    onSuccess: () => {
      toast.success("کارت اضافه شد. تنها ۴ رقم آخر ذخیره می‌شود.");
      setShowForm(false);
      setCardNumber("");
      setHolderName("");
      setBankName("");
      qc.invalidateQueries({ queryKey: ["admin", "bank-cards"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "افزودن کارت ناموفق بود."),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.adminDeleteBankCard(id),
    onSuccess: () => {
      toast.success("کارت حذف شد.");
      setDeleteId(null);
      qc.invalidateQueries({ queryKey: ["admin", "bank-cards"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "حذف ناموفق بود."),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => api.adminToggleBankCard(id, active),
    onSuccess: () => {
      toast.success("وضعیت کارت به‌روزرسانی شد.");
      qc.invalidateQueries({ queryKey: ["admin", "bank-cards"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "تغییر وضعیت ناموفق بود."),
  });

  const cards = q.data?.items ?? [];
  const allowedBanks = q.data?.allowedBanks ?? [];

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <CreditCardIcon className="size-6" />
            کارت‌های بانکی
          </h1>
          <p className="text-sm text-muted-foreground">
            کارت‌های مقصد برای پرداخت‌های کارت‌به‌کارت. هرگز شمارهٔ کامل کارت ذخیره نمی‌شود.
          </p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <PlusIcon className="size-4" /> کارت جدید
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">فهرست کارت‌ها ({toPersianDigits(cards.length)})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {q.isLoading && (
            <div className="flex flex-col gap-2 p-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          )}
          {cards.length === 0 && !q.isLoading && (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
              <CreditCardIcon className="size-8 opacity-50" />
              <div>هیچ کارتی ثبت نشده است.</div>
            </div>
          )}
          {cards.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>شماره (ماسک‌شده)</TableHead>
                    <TableHead>نام صاحب</TableHead>
                    <TableHead>بانک</TableHead>
                    <TableHead>وضعیت</TableHead>
                    <TableHead>ساخته‌شده</TableHead>
                    <TableHead className="text-left">عملیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cards.map((c: AdminBankCardRow) => (
                    <TableRow key={c.id}>
                      <TableCell dir="ltr" className="font-mono text-xs">{c.cardNumberMask}</TableCell>
                      <TableCell className="text-xs">{c.holderName}</TableCell>
                      <TableCell className="text-xs">{c.bankName}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch checked={c.active} onCheckedChange={(v) => toggleMut.mutate({ id: c.id, active: v })} />
                          {c.active ? <Badge variant="default">فعال</Badge> : <Badge variant="secondary">غیرفعال</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatJalaliDate(c.createdAt)}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteId(c.id)}>
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
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>کارت مقصد جدید</DialogTitle>
            <DialogDescription>
              شمارهٔ کامل کارت فقط در سرور پردازش می‌شود؛ پس از ذخیره، تنها ۴ رقم آخر نگه داشته می‌شود.
            </DialogDescription>
          </DialogHeader>
          <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); createMut.mutate(); }}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="c-num">شمارهٔ کارت</Label>
              <Input id="c-num" dir="ltr" inputMode="numeric" value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} maxLength={19} placeholder="۱۶ رقم" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="c-holder">نام صاحب کارت</Label>
              <Input id="c-holder" value={holderName} onChange={(e) => setHolderName(e.target.value)} maxLength={80} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>بانک</Label>
              <Select value={bankName} onValueChange={setBankName}>
                <SelectTrigger className="w-full"><SelectValue placeholder="انتخاب بانک" /></SelectTrigger>
                <SelectContent>
                  {allowedBanks.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>انصراف</Button>
              <Button type="submit" disabled={createMut.isPending || cardNumber.replace(/\D/g, "").length < 4 || holderName.trim().length < 3 || !bankName}>
                {createMut.isPending ? <Loader2Icon className="size-4 animate-spin" /> : <SaveIcon className="size-4" />}
                ذخیره
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف کارت</AlertDialogTitle>
            <AlertDialogDescription>این کارت از فهرست مقاصد حذف می‌شود. عمل قابل بازگشت نیست.</AlertDialogDescription>
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

export function AdminBankCardsView(props: AdminBankCardsViewProps) {
  return (
    <AdminGate>
      <AdminBankCardsInner {...props} />
    </AdminGate>
  );
}

export default AdminBankCardsView;
