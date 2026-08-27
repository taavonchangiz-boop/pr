"use client";
// =====================================================================
// POSTYAR — Bot Builder — List View
// ---------------------------------------------------------------------
// Table of the caller's bots: provider icon + name + username + status
// badge + masked token + action buttons (test, activate/deactivate,
// workflows, link codes, history, broadcast, delete). «بات جدید» dialog
// (provider select, name, botToken password input, username optional).
// =====================================================================
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BotIcon,
  HistoryIcon,
  LinkIcon,
  Loader2Icon,
  PencilRulerIcon,
  PlusIcon,
  RadioIcon,
  SendIcon,
  ShieldCheckIcon,
  Trash2Icon,
  ZapIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, type BotListRow } from "@/components/postyar/api";
import { toPersianDigits } from "@/lib/persian";

const PROVIDERS: Array<{ value: "telegram" | "bale" | "rubika"; label: string }> = [
  { value: "telegram", label: "تلگرام" },
  { value: "bale", label: "بله" },
  { value: "rubika", label: "روبیكا" },
];

function providerLabel(p: string): string {
  return PROVIDERS.find((x) => x.value === p)?.label ?? p;
}

function statusBadge(status: string) {
  if (status === "active") return <Badge variant="default">فعال</Badge>;
  if (status === "inactive") return <Badge variant="secondary">غیرفعال</Badge>;
  if (status === "error") return <Badge variant="destructive">خطا</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

export interface BotsListViewProps {
  navigate: (to: string) => void;
}

export function BotsListView({ navigate }: BotsListViewProps) {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [provider, setProvider] = useState<"telegram" | "bale" | "rubika">("telegram");
  const [name, setName] = useState("");
  const [botToken, setBotToken] = useState("");
  const [username, setUsername] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["bots", "list"],
    queryFn: () => api.getBotsFull(),
    staleTime: 15_000,
  });

  const createMut = useMutation({
    mutationFn: () =>
      api.createBot({
        provider,
        name: name.trim(),
        botToken: botToken.trim(),
        username: username.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success("بات با موفقیت ساخته شد.");
      setShowCreate(false);
      setName("");
      setBotToken("");
      setUsername("");
      setProvider("telegram");
      qc.invalidateQueries({ queryKey: ["bots", "list"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "ساخت ربات ناموفق بود."),
  });

  const testMut = useMutation({
    mutationFn: (id: string) => api.testBot(id),
    onSuccess: () => toast.success("تست ارتباط با ربات موفق بود."),
    onError: (e: Error) => toast.error(e.message ?? "تست ربات ناموفق بود."),
    onSettled: () => qc.invalidateQueries({ queryKey: ["bots", "list"] }),
  });
  const activateMut = useMutation({
    mutationFn: (id: string) => api.activateBot(id),
    onSuccess: () => toast.success("بات فعال شد."),
    onError: (e: Error) => toast.error(e.message ?? "فعال‌سازی ناموفق بود."),
    onSettled: () => qc.invalidateQueries({ queryKey: ["bots", "list"] }),
  });
  const deactivateMut = useMutation({
    mutationFn: (id: string) => api.deactivateBot(id),
    onSuccess: () => toast.success("بات غیرفعال شد."),
    onError: (e: Error) => toast.error(e.message ?? "غیرفعال‌سازی ناموفق بود."),
    onSettled: () => qc.invalidateQueries({ queryKey: ["bots", "list"] }),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteBot(id),
    onSuccess: () => {
      toast.success("بات حذف شد.");
      setDeleteId(null);
      qc.invalidateQueries({ queryKey: ["bots", "list"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "حذف ناموفق بود."),
  });

  const bots = q.data ?? [];

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <BotIcon className="size-6" />
            بات‌ساز
          </h1>
          <p className="text-sm text-muted-foreground">
            ربات‌های تلگرام، بله و روبیکا را مدیریت و گردش کار بسازید.
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <PlusIcon className="size-4" />
          بات جدید
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">
            بات‌های شما ({toPersianDigits(bots.length)})
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
          {q.error && (
            <div className="p-4 text-sm text-destructive">بارگذاری بات‌ها ناموفق بود.</div>
          )}
          {!q.isLoading && bots.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
              <BotIcon className="size-8 opacity-50" />
              <div>هنوز باتی نساخته‌اید.</div>
              <Button size="sm" variant="outline" onClick={() => setShowCreate(true)}>
                <PlusIcon className="size-4" /> بات جدید
              </Button>
            </div>
          )}
          {bots.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>پروایدر</TableHead>
                    <TableHead>نام</TableHead>
                    <TableHead>یوزرنیم</TableHead>
                    <TableHead>وضعیت</TableHead>
                    <TableHead>توکن</TableHead>
                    <TableHead className="text-left">عملیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bots.map((b: BotListRow) => (
                    <TableRow key={b.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <RadioIcon className="size-4" />
                          <span>{providerLabel(b.provider)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{b.name}</TableCell>
                      <TableCell dir="ltr" className="text-xs text-muted-foreground">
                        {b.username ? `@${b.username}` : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {statusBadge(b.status)}
                          {b.lastError && (
                            <span className="text-[10px] text-destructive" title={b.lastError}>
                              خطای اخیر
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span dir="ltr" className="font-mono text-xs">
                          {b.maskedToken}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            title="تست اتصال"
                            onClick={() => testMut.mutate(b.id)}
                            disabled={testMut.isPending}
                          >
                            <ShieldCheckIcon className="size-4" />
                          </Button>
                          {b.status === "active" ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              title="غیرفعال"
                              onClick={() => deactivateMut.mutate(b.id)}
                              disabled={deactivateMut.isPending}
                            >
                              <ZapIcon className="size-4" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              title="فعال"
                              onClick={() => activateMut.mutate(b.id)}
                              disabled={activateMut.isPending}
                            >
                              <ZapIcon className="size-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            title="گردش کار"
                            onClick={() => navigate(`/dashboard/bot-workflow/${b.id}`)}
                          >
                            <PencilRulerIcon className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="کدهای اتصال"
                            onClick={() => navigate(`/dashboard/bot-link/${b.id}`)}
                          >
                            <LinkIcon className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="تاریخچه"
                            onClick={() => navigate(`/dashboard/bot-history/${b.id}`)}
                          >
                            <HistoryIcon className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="پیام گروهی"
                            onClick={() => navigate(`/dashboard/bot-broadcast/${b.id}`)}
                          >
                            <SendIcon className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="حذف"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeleteId(b.id)}
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

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>بات جدید</DialogTitle>
            <DialogDescription>
              اطلاعات ربات را وارد کنید. توکن هنگام ذخیره رمزگذاری می‌شود و هرگز به‌صورت متن ساده نمایش داده نمی‌شود.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              createMut.mutate();
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label>پروایدر</Label>
              <Select value={provider} onValueChange={(v) => setProvider(v as typeof provider)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="b-name">نام بات</Label>
              <Input
                id="b-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                placeholder="مثلاً: بات پشتیبانی فروشگاه"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="b-token">توکن بات</Label>
              <Input
                id="b-token"
                type="password"
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                dir="ltr"
                placeholder="توکن را از BotFather / بله / روبیکا دریافت کنید"
                autoComplete="off"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="b-username">یوزرنیم (اختیاری)</Label>
              <Input
                id="b-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                dir="ltr"
                placeholder="مثلاً: my_support_bot"
                maxLength={64}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>انصراف</Button>
              <Button type="submit" disabled={createMut.isPending || name.trim().length < 2 || botToken.trim().length < 8}>
                {createMut.isPending ? <Loader2Icon className="size-4 animate-spin" /> : null}
                ایجاد بات
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف ربات</AlertDialogTitle>
            <AlertDialogDescription>
              آیا از حذف این بات مطمئن هستید؟ گردش کارها، تاریخچه و کدهای اتصال این بات نیز حذف خواهند شد. این عمل قابل بازگشت نیست.
            </AlertDialogDescription>
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

export default BotsListView;
