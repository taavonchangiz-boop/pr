"use client";
// =====================================================================
// POSTYAR — Admin Bank Cards View
// ---------------------------------------------------------------------
// Table of configured destination cards + «کارت جدید»:
// cardNumberMask (full formatted PAN — `1234-5678-9012-3456`, since for
// the card-to-card use case the merchant's destination PAN is the
// published account number customers wire money to), holderName,
// bankName. Save via POST /api/admin/bank-cards. Delete via DELETE.
//
// ITEM 36 — Bank picker is a combobox: preset banks (BANKS array,
// including BluBank) + a «سایر (وارد دستی)» option that reveals a
// text input. Each bank has a brand color (shown as a swatch).
// =====================================================================
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CreditCardIcon,
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
import { BANKS, getBankMeta, isPresetBankName } from "@/lib/payments/banks";

// Sentinel value used by the bank-name Select to mean «سایر (manual entry)».
// The actual bankName submitted to the API is the text the admin types
// into the revealed Input — never this sentinel.
const OTHER_BANK_SENTINEL = "__other__";

export interface AdminBankCardsViewProps {
  navigate: (to: string) => void;
}

function AdminBankCardsInner({ navigate: _navigate }: AdminBankCardsViewProps) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [cardNumber, setCardNumber] = useState("");
  const [holderName, setHolderName] = useState("");
  // `bankSelect` is the Select's value: either a preset bank name or
  // OTHER_BANK_SENTINEL. The actual `bankName` sent to the API is either
  // the preset name (when bankSelect is a preset) or the manual text
  // input (when bankSelect is OTHER_BANK_SENTINEL).
  const [bankSelect, setBankSelect] = useState("");
  const [bankNameManual, setBankNameManual] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["admin", "bank-cards"],
    queryFn: () => api.getAdminBankCardsTyped(),
    staleTime: 30_000,
  });

  // The effective bank name that will be submitted to the API.
  const effectiveBankName = useMemo(() => {
    if (bankSelect === OTHER_BANK_SENTINEL) return bankNameManual.trim();
    return bankSelect;
  }, [bankSelect, bankNameManual]);

  const createMut = useMutation({
    mutationFn: () => api.adminAddBankCard({
      cardNumber: cardNumber.replace(/[,٬\s]/g, ""),
      holderName: holderName.trim(),
      bankName: effectiveBankName,
    }),
    onSuccess: () => {
      toast.success("کارت مقصد اضافه شد.");
      setShowForm(false);
      setCardNumber("");
      setHolderName("");
      setBankSelect("");
      setBankNameManual("");
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

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <CreditCardIcon className="size-6" />
            کارت‌های بانکی
          </h1>
          <p className="text-sm text-muted-foreground">
            کارت‌های مقصد برای پرداخت‌های کارت‌به‌کارت. شمارهٔ کامل کارت برای
            نمایش به مشتری ذخیره می‌شود تا بتواند واریز انجام دهد.
          </p>
        </div>
        <Button onClick={() => setShowForm(true)} className="cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
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
          {q.error && !q.isLoading && (
            <div className="p-4 text-sm text-destructive" dir="rtl">
              بارگذاری کارت‌ها ناموفق بود.
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
                    <TableHead>شماره کارت</TableHead>
                    <TableHead>نام صاحب</TableHead>
                    <TableHead>بانک</TableHead>
                    <TableHead>وضعیت</TableHead>
                    <TableHead>ساخته‌شده</TableHead>
                    <TableHead className="text-left">عملیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cards.map((c: AdminBankCardRow) => {
                    const meta = getBankMeta(c.bankName);
                    return (
                      <TableRow key={c.id}>
                        <TableCell dir="ltr" className="font-mono text-xs tracking-wider">{c.cardNumberMask}</TableCell>
                        <TableCell className="text-xs">{c.holderName}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-xs">
                            <span
                              aria-hidden
                              className="size-3 shrink-0 rounded-full"
                              style={{ background: meta.color }}
                            />
                            <span>{c.bankName}</span>
                            {!isPresetBankName(c.bankName) && (
                              <Badge variant="outline" className="text-[10px]">دستی</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Switch checked={c.active} onCheckedChange={(v) => toggleMut.mutate({ id: c.id, active: v })} />
                            {c.active ? <Badge variant="default">فعال</Badge> : <Badge variant="secondary">غیرفعال</Badge>}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatJalaliDate(c.createdAt)}</TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="cursor-pointer text-destructive hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                              onClick={() => setDeleteId(c.id)}
                              aria-label="حذف کارت"
                            >
                              <Trash2Icon className="size-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
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
              شمارهٔ کامل ۱۶ رقمی کارت وارد کنید تا برای مشتری نمایش داده شود.
              برای بانک‌های خارج از فهرست، گزینهٔ «سایر (وارد دستی)» را انتخاب کنید.
            </DialogDescription>
          </DialogHeader>
          <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); createMut.mutate(); }}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="c-num">شمارهٔ کارت (۱۶ رقم)</Label>
              <Input
                id="c-num"
                dir="ltr"
                inputMode="numeric"
                value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value)}
                maxLength={19}
                placeholder="۰۱۲۳۴۵۶۷۸۹۰۱۲۳۴۵"
                className="font-mono tracking-wider text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              />
              <p className="text-xs text-muted-foreground">
                {toPersianDigits(cardNumber.replace(/\D/g, "").length)} از {toPersianDigits(16)} رقم
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="c-holder">نام صاحب کارت</Label>
              <Input
                id="c-holder"
                value={holderName}
                onChange={(e) => setHolderName(e.target.value)}
                maxLength={80}
                className="focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>بانک</Label>
              <Select value={bankSelect} onValueChange={setBankSelect}>
                <SelectTrigger className="w-full cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                  <SelectValue placeholder="انتخاب بانک" />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  {BANKS.map((b) => (
                    <SelectItem key={b.name} value={b.name} className="cursor-pointer">
                      <span className="flex items-center gap-2">
                        <span
                          aria-hidden
                          className="size-3 rounded-full"
                          style={{ background: b.color }}
                        />
                        {b.name}
                      </span>
                    </SelectItem>
                  ))}
                  <SelectItem value={OTHER_BANK_SENTINEL} className="cursor-pointer">
                    <span className="flex items-center gap-2">
                      <PencilIcon className="size-3" />
                      سایر (وارد دستی)
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
              {bankSelect === OTHER_BANK_SENTINEL && (
                <div className="flex flex-col gap-1.5 rounded-md border bg-muted/30 p-2">
                  <Label htmlFor="c-bank-manual" className="text-xs text-muted-foreground">
                    نام بانک را وارد کنید
                  </Label>
                  <Input
                    id="c-bank-manual"
                    value={bankNameManual}
                    onChange={(e) => setBankNameManual(e.target.value)}
                    maxLength={40}
                    placeholder="مثلاً بانک نوین"
                    className="focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowForm(false)}
                className="cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                انصراف
              </Button>
              <Button
                type="submit"
                disabled={
                  createMut.isPending ||
                  cardNumber.replace(/\D/g, "").length < 4 ||
                  holderName.trim().length < 3 ||
                  effectiveBankName.length < 2
                }
                className="cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
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
            <AlertDialogCancel className="cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">انصراف</AlertDialogCancel>
            <AlertDialogAction
              className="cursor-pointer bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
