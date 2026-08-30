"use client";
// =====================================================================
// POSTYAR — Admin Users View
// ---------------------------------------------------------------------
// Paginated table: name, email, mobile masked, role, status, createdAt
// (Jalali), actions: «تعلیق/رفع تعلیق» toggle, role change (user/support
// /admin), and «تغییر رمز عبور» (reset password — POST /api/admin/users
// /[id]/reset-password). Search box. All actions PATCH /api/admin/users
// /[id]. Audit each action via toast.
// =====================================================================
// NOTE (ITEM 35): این بخش فقط برای مدیر سامانه قابل مشاهده است.
// The route /api/admin/users and the reset-password sibling enforce
// `requireRole(["admin"])`. The dashboard renders this view only for
// admins.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  KeyRoundIcon,
  Loader2Icon,
  LockIcon,
  SearchIcon,
  ShieldIcon,
  UserCogIcon,
  UsersIcon,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api, type AdminUserRow } from "@/components/postyar/api";
import { AdminGate } from "@/components/postyar/admin/gate";
import { useSession } from "@/components/layout/session-provider";
import { toPersianDigits } from "@/lib/persian";

const PAGE_SIZE = 25;

function roleBadge(role: string) {
  if (role === "admin") return <Badge variant="default">مدیر</Badge>;
  if (role === "support") return <Badge variant="secondary">پشتیبان</Badge>;
  return <Badge variant="outline">کاربر</Badge>;
}

function statusBadge(status: string) {
  if (status === "active") return <Badge variant="default">فعال</Badge>;
  if (status === "suspended") return <Badge variant="destructive">معلق</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

/**
 * Small lock badge shown next to the role of the bootstrap (super-admin)
 * user. It carries a tooltip «مدیر کل — قفل» so other admins understand why
 * all the row's action buttons are disabled.
 */
function SuperAdminLockBadge() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className="inline-flex cursor-default items-center gap-1 rounded-md border border-dashed bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <LockIcon className="size-3" />
          مدیر کل
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" dir="rtl">مدیر کل — قفل</TooltipContent>
    </Tooltip>
  );
}

export interface AdminUsersViewProps {
  navigate: (to: string) => void;
}

function AdminUsersInner({ navigate: _navigate }: AdminUsersViewProps) {
  const qc = useQueryClient();
  const { user: me } = useSession();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [confirm, setConfirm] = useState<{ id: string; action: "suspend" | "unsuspend" } | null>(null);
  const [roleChange, setRoleChange] = useState<{ id: string; role: "user" | "support" | "admin" } | null>(null);
  const [pwReset, setPwReset] = useState<{ id: string; name: string } | null>(null);

  const q = useQuery({
    queryKey: ["admin", "users", search, page],
    queryFn: () => api.getAdminUsersTyped({ search: search.trim() || undefined, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    staleTime: 15_000,
  });

  const patchMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { status?: "active" | "suspended"; role?: "user" | "support" | "admin" } }) =>
      api.adminUserPatch(id, body),
    onSuccess: (_data, vars) => {
      const verb = vars.body.status === "suspended" ? "تعلیق" : vars.body.status === "active" ? "رفع تعلیق" : "تغییر نقش";
      toast.success(`عمل «${verb}» با موفقیت ثبت شد.`);
      setConfirm(null);
      setRoleChange(null);
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "عملیات ناموفق بود."),
  });

  const users = q.data?.items ?? [];
  const total = q.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <UsersIcon className="size-6" />
          کاربران
        </h1>
        <p className="text-sm text-muted-foreground">
          مشاهده و مدیریت کاربران سیستم (تعلیق / رفع تعلیق / تغییر نقش / بازنشانی رمز عبور).
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex flex-wrap items-center gap-3">
            <span>فهرست کاربران ({toPersianDigits(total)} مورد)</span>
            {q.isFetching && <Loader2Icon className="size-4 animate-spin" />}
          </CardTitle>
          <div className="relative mt-2 max-w-md">
            <SearchIcon className="absolute right-2 top-2.5 size-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="جستجو بر اساس نام، ایمیل، موبایل یا کد معرف"
              className="pr-8"
            />
          </div>
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
            <div className="p-4 text-sm text-destructive">بارگذاری کاربران ناموفق بود.</div>
          )}
          {!q.isLoading && users.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
              <UsersIcon className="size-8 opacity-50" />
              <div>کاربری یافت نشد.</div>
            </div>
          )}
          {users.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>نام</TableHead>
                    <TableHead>ایمیل</TableHead>
                    <TableHead>موبایل</TableHead>
                    <TableHead>نقش</TableHead>
                    <TableHead>وضعیت</TableHead>
                    <TableHead>ساخته‌شده</TableHead>
                    <TableHead className="text-left">عملیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u: AdminUserRow) => {
                    const locked = !!u.isSuperAdmin;
                    return (
                    <TableRow key={u.id}>
                      <TableCell>
                        <div className="font-medium">{u.firstName} {u.lastName}</div>
                        {u.businessName && <div className="text-[10px] text-muted-foreground">{u.businessName}</div>}
                      </TableCell>
                      <TableCell dir="ltr" className="text-xs">{u.email}</TableCell>
                      <TableCell dir="ltr" className="text-xs">{u.mobileMasked}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Select
                            value={u.role}
                            disabled={locked}
                            onValueChange={(v) => setRoleChange({ id: u.id, role: v as "user" | "support" | "admin" })}
                          >
                            <SelectTrigger
                              className="w-28 h-8 text-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                              aria-label={locked ? "نقش مدیر کل قفل است" : "تغییر نقش کاربر"}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="user">کاربر</SelectItem>
                              <SelectItem value="support">پشتیبان</SelectItem>
                              <SelectItem value="admin">مدیر</SelectItem>
                            </SelectContent>
                          </Select>
                          {locked && <SuperAdminLockBadge />}
                        </div>
                      </TableCell>
                      <TableCell>{statusBadge(u.status)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{u.createdAtFa}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span tabIndex={locked ? 0 : -1} className="inline-flex">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setPwReset({ id: u.id, name: `${u.firstName} ${u.lastName}`.trim() || u.email })}
                                  disabled={locked || (!!me && me.id === u.id)}
                                  title={locked ? "حساب مدیر کل قابل تغییر نیست" : (me && me.id === u.id ? "برای تغییر رمز خود از پروفایل استفاده کنید" : "بازنشانی رمز عبور کاربر")}
                                  className="gap-1.5 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                >
                                  {locked ? <LockIcon className="size-3.5" /> : <KeyRoundIcon className="size-3.5" />}
                                  تغییر رمز
                                </Button>
                              </span>
                            </TooltipTrigger>
                            {locked && <TooltipContent side="top" dir="rtl">مدیر کل — قفل</TooltipContent>}
                          </Tooltip>
                          {locked ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span tabIndex={0} className="inline-flex">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled
                                    className="gap-1.5 cursor-not-allowed focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                  >
                                    <LockIcon className="size-3.5" /> تعلیق
                                  </Button>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" dir="rtl">مدیر کل — قفل</TooltipContent>
                            </Tooltip>
                          ) : u.status === "active" ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setConfirm({ id: u.id, action: "suspend" })}
                              className="cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                            >
                              <ShieldIcon className="size-3.5" /> تعلیق
                            </Button>
                          ) : (
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => setConfirm({ id: u.id, action: "unsuspend" })}
                              className="cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                            >
                              رفع تعلیق
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t p-3">
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                <ChevronRightIcon className="size-4" /> قبلی
              </Button>
              <span className="text-xs text-muted-foreground">
                صفحهٔ {toPersianDigits(page)} از {toPersianDigits(totalPages)}
              </span>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                بعدی <ChevronLeftIcon className="size-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.action === "suspend" ? "تعلیق کاربر" : "رفع تعلیق کاربر"}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.action === "suspend"
                ? "کاربر پس از تعلیق نمی‌تواند وارد سیستم شود. آیا مطمئن هستید؟"
                : "با رفع تعلیق، کاربر دوباره می‌تواند وارد سیستم شود."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">انصراف</AlertDialogCancel>
            <AlertDialogAction
              className={confirm?.action === "suspend" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" : "cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"}
              onClick={() => confirm && patchMut.mutate({ id: confirm.id, body: { status: confirm.action === "suspend" ? "suspended" : "active" } })}
            >
              تأیید
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!roleChange} onOpenChange={(o) => !o && setRoleChange(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تغییر نقش کاربر</AlertDialogTitle>
            <AlertDialogDescription>
              نقش انتخابی به <strong>{roleLabelFa(roleChange?.role ?? "")}</strong> تغییر خواهد کرد. این عمل در ممیزی ثبت می‌شود.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">انصراف</AlertDialogCancel>
            <AlertDialogAction
              className="cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              onClick={() => roleChange && patchMut.mutate({ id: roleChange.id, body: { role: roleChange.role } })}
            >
              تأیید
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {pwReset && (
        <ResetPasswordDialog
          target={pwReset}
          onClose={() => setPwReset(null)}
          onDone={() => {
            setPwReset(null);
            qc.invalidateQueries({ queryKey: ["admin", "users"] });
          }}
        />
      )}
    </div>
  );
}

function roleLabelFa(r: string): string {
  if (r === "admin") return "مدیر";
  if (r === "support") return "پشتیبان";
  return "کاربر";
}

interface ResetPasswordDialogProps {
  target: { id: string; name: string };
  onClose: () => void;
  onDone: () => void;
}

function ResetPasswordDialog({ target, onClose, onDone }: ResetPasswordDialogProps) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [show, setShow] = useState(false);

  const mut = useMutation({
    mutationFn: () => {
      if (newPassword.length < 8) throw new Error("رمز عبور باید حداقل ۸ کاراکتر باشد.");
      if (newPassword !== confirmPw) throw new Error("رمز عبور و تکرار آن یکسان نیستند.");
      return api.adminResetUserPassword(target.id, newPassword);
    },
    onSuccess: () => {
      toast.success("رمز عبور کاربر با موفقیت بازنشانی شد.");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message ?? "بازنشانی رمز ناموفق بود."),
  });

  const canSubmit = newPassword.length >= 8 && newPassword === confirmPw && !mut.isPending;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRoundIcon className="size-5" />
            تغییر رمز عبور
          </DialogTitle>
          <DialogDescription>
            رمز عبور جدید را برای کاربر «<strong>{target.name}</strong>» وارد کنید. این عمل در ممیزی ثبت می‌شود و رمز هرگز نمایش داده نمی‌شود.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => { e.preventDefault(); if (canSubmit) mut.mutate(); }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-pw">رمز عبور جدید</Label>
            <Input
              id="new-pw"
              type={show ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              dir="ltr"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              placeholder="حداقل ۸ کاراکتر"
              className="cursor-text focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            />
            <p className="text-[10px] text-muted-foreground">حداقل ۸ کاراکتر. توصیه می‌شود ترکیبی از حروف، عدد و نماد باشد.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirm-pw">تکرار رمز عبور جدید</Label>
            <Input
              id="confirm-pw"
              type={show ? "text" : "password"}
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              dir="ltr"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              className="cursor-text focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            />
            {confirmPw.length > 0 && confirmPw !== newPassword && (
              <p className="text-[10px] text-destructive">رمز و تکرار آن یکسان نیستند.</p>
            )}
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={show}
              onChange={(e) => setShow(e.target.checked)}
              className="size-4 cursor-pointer accent-primary"
            />
            نمایش رمز
          </label>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              انصراف
            </Button>
            <Button
              type="submit"
              disabled={!canSubmit}
              className="gap-1.5 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {mut.isPending ? <Loader2Icon className="size-4 animate-spin" /> : <KeyRoundIcon className="size-4" />}
              بازنشانی رمز
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AdminUsersView(props: AdminUsersViewProps) {
  return (
    <AdminGate>
      <AdminUsersInner {...props} />
    </AdminGate>
  );
}

void UserCogIcon;
export default AdminUsersView;
