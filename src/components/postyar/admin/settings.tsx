"use client";
// =====================================================================
// POSTYAR — Admin Settings View
// ---------------------------------------------------------------------
// List of SystemSetting rows + add/edit (key, value). For sensitive
// settings (SMTP password, SMS API key), the value field is password-
// type and the value is masked in the list. Save via POST /api/admin
// /settings.
// =====================================================================
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  SaveIcon,
  SettingsIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, type AdminSettingRow } from "@/components/postyar/api";
import { AdminGate } from "@/components/postyar/admin/gate";

const SENSITIVE_KEYS = [
  "email.password",
  "sms.apiKey",
  "ai.apiKey",
  "ai.secret",
  "gold.apiKey",
  "site.supportMobile",
];

function isSensitiveKey(k: string): boolean {
  return SENSITIVE_KEYS.some((s) => k.toLowerCase().includes(s.toLowerCase()));
}

function maskValue(v: string): string {
  if (!v) return "";
  if (v.length <= 4) return "••••";
  return `••••${v.slice(-2)}`;
}

export interface AdminSettingsViewProps {
  navigate: (to: string) => void;
}

function AdminSettingsInner({ navigate: _navigate }: AdminSettingsViewProps) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");

  const q = useQuery({
    queryKey: ["admin", "settings"],
    queryFn: () => api.getAdminSettingsTyped(),
    staleTime: 30_000,
  });

  const saveMut = useMutation({
    mutationFn: () => api.adminUpdateSetting(key.trim(), value),
    onSuccess: () => {
      toast.success("تنظیمات ذخیره شد.");
      setShowForm(false);
      setKey("");
      setValue("");
      qc.invalidateQueries({ queryKey: ["admin", "settings"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "ذخیره ناموفق بود."),
  });

  const settings = q.data?.items ?? [];
  const allowedKeys = q.data?.allowedKeys ?? [];

  function openCreate() {
    setKey("");
    setValue("");
    setShowForm(true);
  }
  function openEdit(r: AdminSettingRow) {
    setKey(r.key);
    setValue("");
    setShowForm(true);
  }

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <SettingsIcon className="size-6" />
            تنظیمات سامانه
          </h1>
          <p className="text-sm text-muted-foreground">پیکربندی کلیدی سامانه (تنها کلیدهای مجاز).</p>
        </div>
        <Button onClick={openCreate}>
          <PlusIcon className="size-4" /> تنظیم جدید
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">فهرست تنظیمات ({settings.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {q.isLoading && (
            <div className="flex flex-col gap-2 p-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          )}
          {settings.length === 0 && !q.isLoading && (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
              <SettingsIcon className="size-8 opacity-50" />
              <div>هیچ تنظیمی ذخیره نشده است.</div>
            </div>
          )}
          {settings.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>کلید</TableHead>
                    <TableHead>مقدار</TableHead>
                    <TableHead>به‌روزشده</TableHead>
                    <TableHead className="text-left">عملیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {settings.map((s) => (
                    <TableRow key={s.key}>
                      <TableCell dir="ltr" className="font-mono text-xs">{s.key}</TableCell>
                      <TableCell dir="ltr" className="font-mono text-xs">
                        {isSensitiveKey(s.key) ? maskValue(s.value) : s.value.slice(0, 60)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{s.updatedAtFa}</TableCell>
                      <TableCell>
                        <div className="flex justify-end">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(s)}>
                            <PencilIcon className="size-4" />
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
            <DialogTitle>ویرایش تنظیم</DialogTitle>
            <DialogDescription>تنها کلیدهای فهرست‌شده قابل پذیرش هستند.</DialogDescription>
          </DialogHeader>
          <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); saveMut.mutate(); }}>
            <div className="flex flex-col gap-1.5">
              <Label>کلید</Label>
              {allowedKeys.length > 0 ? (
                <Select value={key} onValueChange={setKey}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="انتخاب کلید" /></SelectTrigger>
                  <SelectContent>
                    {allowedKeys.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Input dir="ltr" value={key} onChange={(e) => setKey(e.target.value)} maxLength={80} disabled />
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="v-val">مقدار</Label>
              {isSensitiveKey(key) ? (
                <Input
                  id="v-val"
                  type="password"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  dir="ltr"
                  autoComplete="off"
                />
              ) : (
                <Textarea id="v-val" rows={3} dir="ltr" value={value} onChange={(e) => setValue(e.target.value)} maxLength={8000} />
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>انصراف</Button>
              <Button type="submit" disabled={saveMut.isPending || !key.trim() || !value}>
                {saveMut.isPending ? <Loader2Icon className="size-4 animate-spin" /> : <SaveIcon className="size-4" />}
                ذخیره
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function AdminSettingsView(props: AdminSettingsViewProps) {
  return (
    <AdminGate>
      <AdminSettingsInner {...props} />
    </AdminGate>
  );
}

void useEffect;
export default AdminSettingsView;
