"use client";
// =====================================================================
// POSTYAR — Destinations View
// ---------------------------------------------------------------------
// Table: provider icon + label + chatId + status badge + masked token
//        + lastCheckedAt (Jalali) + عملیات
// Operations per row: تست اتصال، دکمه‌های شیشه‌ای، ویرایش، حذف
// «مقصد جدید» dialog: provider radio (Telegram/Bale/Rubika) + label +
//                       botToken + chatId
// Provider icons (lucide): Send (telegram), MessageCircle (bale), Bot (rubika)
// =====================================================================
import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BotIcon,
  CheckCircle2Icon,
  PlusIcon,
  RefreshCwIcon,
  SendIcon,
  Trash2Icon,
  PencilIcon,
  MessageCircleIcon,
  LayoutGridIcon,
  Loader2Icon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api, type DestinationRow } from "@/components/postyar/api";
import { formatJalaliDateTime, toPersianDigits } from "@/lib/persian";
import { cn } from "@/lib/utils";

export interface DestinationsViewProps {
  navigate?: (to: string) => void;
}

type ProviderName = "telegram" | "bale" | "rubika";

function providerMeta(p: string): { label: string; icon: React.ComponentType<{ className?: string }> } {
  switch (p) {
    case "telegram": return { label: "تلگرام", icon: SendIcon };
    case "bale": return { label: "بله", icon: MessageCircleIcon };
    case "rubika": return { label: "روبیکا", icon: BotIcon };
    default: return { label: p, icon: BotIcon };
  }
}

function statusBadge(status: string) {
  switch (status) {
    case "active": return <Badge variant="default">فعال</Badge>;
    case "inactive": return <Badge variant="secondary">غیرفعال</Badge>;
    case "error": return <Badge variant="destructive">خطا</Badge>;
    case "deleted": return <Badge variant="outline">حذف‌شده</Badge>;
    default: return <Badge variant="outline">{status}</Badge>;
  }
}

function fallbackNavigate(to: string) {
  if (typeof window !== "undefined") {
    window.location.hash = to;
  }
}

export function DestinationsView({ navigate }: DestinationsViewProps) {
  const qc = useQueryClient();
  const go = useCallback((to: string) => (navigate ? navigate(to) : fallbackNavigate(to)), [navigate]);

  const listQ = useQuery({
    queryKey: ["destinations", "list"] as const,
    queryFn: () => api.getDestinations(),
    staleTime: 10_000,
  });

  // New destination dialog state
  const [newOpen, setNewOpen] = useState(false);
  const [form, setForm] = useState<{ provider: ProviderName; label: string; botToken: string; chatId: string }>({
    provider: "telegram",
    label: "",
    botToken: "",
    chatId: "",
  });

  // Edit dialog state
  const [editTarget, setEditTarget] = useState<DestinationRow | null>(null);
  const [editForm, setEditForm] = useState<{ label: string; chatId: string; botToken: string }>({
    label: "",
    chatId: "",
    botToken: "",
  });

  // Delete confirm
  const [pendingDelete, setPendingDelete] = useState<DestinationRow | null>(null);

  // Test-connection per-row loading tracker (id → boolean)
  const [testingId, setTestingId] = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: () =>
      api.createDestination({
        provider: form.provider,
        label: form.label.trim(),
        botToken: form.botToken.trim(),
        chatId: form.chatId.trim(),
      }),
    onSuccess: () => {
      toast.success("مقصد ساخته شد.");
      setNewOpen(false);
      setForm({ provider: "telegram", label: "", botToken: "", chatId: "" });
      void qc.invalidateQueries({ queryKey: ["destinations"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "ساخت مقصد ناموفق بود."),
  });

  const updateMut = useMutation({
    mutationFn: () => {
      if (!editTarget) throw new Error("مقصد انتخاب نشده است.");
      const patch: { label?: string; chatId?: string; botToken?: string } = {
        label: editForm.label.trim(),
        chatId: editForm.chatId.trim(),
      };
      if (editForm.botToken.trim().length > 0) patch.botToken = editForm.botToken.trim();
      return api.updateDestination(editTarget.id, patch);
    },
    onSuccess: () => {
      toast.success("مقصد به‌روزرسانی شد.");
      setEditTarget(null);
      void qc.invalidateQueries({ queryKey: ["destinations"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "به‌روزرسانی ناموفق بود."),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteDestination(id),
    onSuccess: () => {
      toast.success("مقصد حذف شد.");
      void qc.invalidateQueries({ queryKey: ["destinations"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "حذف ناموفق بود."),
  });

  async function onTest(d: DestinationRow) {
    setTestingId(d.id);
    try {
      const r = await api.testDestination(d.id);
      if (r.ok) {
        toast.success("اتصال موفق بود.", { description: `توکن: ${d.tokenPreview ?? d.maskedToken ?? "••••"}` });
      } else {
        toast.error(r.errorFa ?? "اتصال ناموفق بود.");
      }
      void qc.invalidateQueries({ queryKey: ["destinations"] });
    } catch (e) {
      const err = e as Error;
      toast.error(err.message ?? "اتصال ناموفق بود.");
    } finally {
      setTestingId(null);
    }
  }

  const rows = listQ.data ?? [];

  function openEdit(d: DestinationRow) {
    setEditTarget(d);
    setEditForm({ label: d.label, chatId: d.chatId, botToken: "" });
  }

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div className="flex flex-col gap-1">
            <CardTitle>مقاصد</CardTitle>
            <p className="text-xs text-muted-foreground">
              کانال‌ها و گروه‌های تلگرام، بله و روبیکا برای انتشار محتوا.
            </p>
          </div>
          <Button onClick={() => setNewOpen(true)} className="gap-2">
            <PlusIcon className="size-4" />
            مقصد جدید
          </Button>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[12rem]">پروایدر</TableHead>
                  <TableHead>چت‌آیدی</TableHead>
                  <TableHead>وضعیت</TableHead>
                  <TableHead>توکن</TableHead>
                  <TableHead>آخرین بررسی</TableHead>
                  <TableHead className="text-left">عملیات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listQ.isLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={`sk-${i}`}>
                      <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                      <TableCell><Skeleton className="h-7 w-20" /></TableCell>
                    </TableRow>
                  ))
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="p-0">
                      <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                        <div className="rounded-full bg-muted p-3">
                          <PlusIcon className="size-6 text-muted-foreground" />
                        </div>
                        <div className="text-sm font-medium">هنوز مقصدی نساخته‌اید</div>
                        <div className="max-w-md text-xs text-muted-foreground">
                          برای انتشار محتوا در کانال یا گروه، نخست یک مقصد بسازید.
                        </div>
                        <Button size="sm" onClick={() => setNewOpen(true)} className="mt-2 gap-2">
                          <PlusIcon className="size-4" />
                          ساخت نخستین مقصد
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((d) => {
                    const meta = providerMeta(d.provider);
                    const Icon = meta.icon;
                    return (
                      <TableRow key={d.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="flex size-9 items-center justify-center rounded-md bg-muted">
                              <Icon className="size-4" />
                            </div>
                            <div className="flex flex-col">
                              <span className="font-medium">{d.label}</span>
                              <span className="text-[0.7rem] text-muted-foreground">{meta.label}</span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{d.chatId}</TableCell>
                        <TableCell>{statusBadge(d.status)}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {d.tokenPreview ?? d.maskedToken ?? "••••"}
                        </TableCell>
                        <TableCell>
                          {d.lastCheckedAt ? (
                            <span className="text-xs">{formatJalaliDateTime(d.lastCheckedAt, { withTime: true })}</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                          {d.lastError && (
                            <div className="text-[0.65rem] text-destructive">{d.lastError}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">عملیات</Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="min-w-[12rem]">
                              <DropdownMenuItem onSelect={() => onTest(d)} disabled={testingId === d.id}>
                                {testingId === d.id ? (
                                  <Loader2Icon className="size-4 animate-spin" />
                                ) : (
                                  <RefreshCwIcon className="size-4" />
                                )}
                                تست اتصال
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => go(`/dashboard/glass-buttons/${d.id}`)}>
                                <LayoutGridIcon className="size-4" />
                                دکمه‌های شیشه‌ای
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onSelect={() => openEdit(d)}>
                                <PencilIcon className="size-4" />
                                ویرایش
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={() => setPendingDelete(d)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2Icon className="size-4" />
                                حذف
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* New destination dialog */}
      <Dialog open={newOpen} onOpenChange={(o) => { setNewOpen(o); if (!o) setForm({ provider: "telegram", label: "", botToken: "", chatId: "" }); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>مقصد جدید</DialogTitle>
            <DialogDescription>
              توکن و چت‌آیدی مقصد را وارد کنید. پیش از ذخیره، اعتبار توکن بررسی می‌شود.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4" dir="rtl">
            <div className="flex flex-col gap-2">
              <Label>پروایدر</Label>
              <RadioGroup
                value={form.provider}
                onValueChange={(v) => setForm((f) => ({ ...f, provider: v as ProviderName }))}
                className="grid grid-cols-3 gap-2"
              >
                {[
                  { id: "telegram" as const, label: "تلگرام", icon: SendIcon },
                  { id: "bale" as const, label: "بله", icon: MessageCircleIcon },
                  { id: "rubika" as const, label: "روبیکا", icon: BotIcon },
                ].map((p) => {
                  const Icon = p.icon;
                  return (
                    <label
                      key={p.id}
                      className={cn(
                        "flex flex-col items-center justify-center gap-1 rounded-md border p-3 text-xs cursor-pointer hover:bg-accent/40",
                        form.provider === p.id && "border-primary bg-accent/40",
                      )}
                    >
                      <RadioGroupItem value={p.id} id={`prov-${p.id}`} className="sr-only" />
                      <Icon className="size-5" />
                      <span>{p.label}</span>
                    </label>
                  );
                })}
              </RadioGroup>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nd-label">برچسب</Label>
              <Input
                id="nd-label"
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="مثلاً: کانال اطلاع‌رسانی"
                maxLength={120}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nd-token">توکن ربات</Label>
              <Input
                id="nd-token"
                value={form.botToken}
                onChange={(e) => setForm((f) => ({ ...f, botToken: e.target.value }))}
                placeholder="توکن از BotFather / بله / روبیکا"
                dir="ltr"
                className="text-left font-mono text-xs"
                autoComplete="off"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nd-chat">چت‌آیدی</Label>
              <Input
                id="nd-chat"
                value={form.chatId}
                onChange={(e) => setForm((f) => ({ ...f, chatId: e.target.value }))}
                placeholder="مثلاً: @channel_name یا -1001234"
                dir="ltr"
                className="text-left font-mono text-xs"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNewOpen(false)}>انصراف</Button>
            <Button
              onClick={() => createMut.mutate()}
              disabled={
                createMut.isPending
                || form.label.trim().length < 1
                || form.botToken.trim().length < 8
                || form.chatId.trim().length < 1
              }
              className="gap-2"
            >
              {createMut.isPending ? <Loader2Icon className="size-4 animate-spin" /> : <CheckCircle2Icon className="size-4" />}
              ذخیره
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editTarget} onOpenChange={(o) => { if (!o) setEditTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ویرایش مقصد</DialogTitle>
            <DialogDescription>
              می‌توانید برچسب، چت‌آیدی یا توکن مقصد را تغییر دهید. در صورت ورود توکن جدید، پیش از ذخیره اعتبارسنجی می‌شود.
            </DialogDescription>
          </DialogHeader>
          {editTarget && (
            <div className="flex flex-col gap-4" dir="rtl">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>پروایدر:</span>
                <Badge variant="outline">{providerMeta(editTarget.provider).label}</Badge>
                <span>توکن فعلی:</span>
                <span className="font-mono">{editTarget.tokenPreview ?? editTarget.maskedToken ?? "••••"}</span>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ed-label">برچسب</Label>
                <Input
                  id="ed-label"
                  value={editForm.label}
                  onChange={(e) => setEditForm((f) => ({ ...f, label: e.target.value }))}
                  maxLength={120}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ed-chat">چت‌آیدی</Label>
                <Input
                  id="ed-chat"
                  value={editForm.chatId}
                  onChange={(e) => setEditForm((f) => ({ ...f, chatId: e.target.value }))}
                  dir="ltr"
                  className="text-left font-mono text-xs"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ed-token">توکن جدید (اختیاری)</Label>
                <Input
                  id="ed-token"
                  value={editForm.botToken}
                  onChange={(e) => setEditForm((f) => ({ ...f, botToken: e.target.value }))}
                  placeholder="برای تغییر توکن، مقدار جدید را اینجا وارد کنید"
                  dir="ltr"
                  className="text-left font-mono text-xs"
                  autoComplete="off"
                />
                <p className="text-[0.7rem] text-muted-foreground">
                  خالی بگذارید تا توکن فعلی حفظ شود.
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditTarget(null)}>انصراف</Button>
            <Button
              onClick={() => updateMut.mutate()}
              disabled={updateMut.isPending || editForm.label.trim().length < 1 || editForm.chatId.trim().length < 1}
              className="gap-2"
            >
              {updateMut.isPending ? <Loader2Icon className="size-4 animate-spin" /> : <SaveIcon className="size-4" />}
              ذخیره تغییرات
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => { if (!o) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف مقصد</AlertDialogTitle>
            <AlertDialogDescription>
              آیا از حذف مقصد «{pendingDelete?.label}» مطمئن هستید؟ این عملیات نرم است و وضعیت مقصد به «حذف‌شده» تغییر می‌کند؛ اما ردیف برای حسابرسی نگه داشته می‌شود.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) deleteMut.mutate(pendingDelete.id);
                setPendingDelete(null);
              }}
              className={cn("bg-destructive text-white hover:bg-destructive/90")}
              disabled={deleteMut.isPending}
            >
              {deleteMut.isPending ? "در حال حذف…" : "حذف"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SaveIcon(props: { className?: string }) {
  // Small inline fallback icon so we don't depend on a lucide export name that
  // may or may not exist across versions. Behaves as a generic save glyph.
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
      aria-hidden="true"
    >
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </svg>
  );
}

export default DestinationsView;
