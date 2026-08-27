"use client";
// =====================================================================
// POSTYAR — Admin Notifications Broadcast View
// ---------------------------------------------------------------------
// Form: filter select (all / role:user / plan:xxx), titleFa, bodyFa,
// optional link. Submit → POST /api/admin/notifications/broadcast.
// =====================================================================
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Loader2Icon,
  MegaphoneIcon,
  SendIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { api } from "@/components/postyar/api";
import { AdminGate } from "@/components/postyar/admin/gate";
import { toPersianDigits } from "@/lib/persian";

export interface AdminBroadcastViewProps {
  navigate: (to: string) => void;
}

function AdminBroadcastInner({ navigate: _navigate }: AdminBroadcastViewProps) {
  const [filter, setFilter] = useState<string>("all");
  const [planCode, setPlanCode] = useState("");
  const [titleFa, setTitleFa] = useState("");
  const [bodyFa, setBodyFa] = useState("");
  const [link, setLink] = useState("");
  const [sentCount, setSentCount] = useState<number | null>(null);

  const sendMut = useMutation({
    mutationFn: () => {
      const actualFilter = filter === "plan" && planCode.trim() ? `plan:${planCode.trim()}` : filter;
      return api.adminBroadcast({
        filter: actualFilter,
        titleFa: titleFa.trim(),
        bodyFa: bodyFa.trim(),
        link: link.trim() || undefined,
      });
    },
    onSuccess: (data) => {
      setSentCount(data.sent);
      toast.success(`اعلان به ${toPersianDigits(data.sent)} کاربر ارسال شد.`);
      setTitleFa("");
      setBodyFa("");
      setLink("");
    },
    onError: (e: Error) => toast.error(e.message ?? "ارسال ناموفق بود."),
  });

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <MegaphoneIcon className="size-6" />
          ارسال اعلان گروهی
        </h1>
        <p className="text-sm text-muted-foreground">
          ارسال اعلان به همهٔ کاربران یا فیلتر بر اساس نقش/پلن.
        </p>
      </div>

      <Alert>
        <AlertTitle>تذکر</AlertTitle>
        <AlertDescription>
          اعلان گروهی به‌صورت ناهمگام ارسال می‌شود و در صندوق اعلان هر کاربر ثبت خواهد شد.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">فرم اعلان</CardTitle>
          <CardDescription>عنوان و متن را وارد کنید. لینک اختیاری است.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>فیلتر گیرندگان</Label>
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همهٔ کاربران</SelectItem>
                  <SelectItem value="role:user">فقط نقش کاربر</SelectItem>
                  <SelectItem value="plan">بر اساس کد پلن</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {filter === "plan" && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="plan-code">کد پلن</Label>
                <Input id="plan-code" dir="ltr" value={planCode} onChange={(e) => setPlanCode(e.target.value)} placeholder="مثلاً: pro" />
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="t-title">عنوان (فارسی)</Label>
            <Input id="t-title" value={titleFa} onChange={(e) => setTitleFa(e.target.value)} maxLength={200} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="t-body">متن (فارسی)</Label>
            <Textarea id="t-body" rows={5} value={bodyFa} onChange={(e) => setBodyFa(e.target.value)} maxLength={2000} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="t-link">لینک (اختیاری)</Label>
            <Input id="t-link" dir="ltr" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://..." />
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={() => sendMut.mutate()} disabled={sendMut.isPending || titleFa.trim().length < 1 || bodyFa.trim().length < 1}>
              {sendMut.isPending ? <Loader2Icon className="size-4 animate-spin" /> : <SendIcon className="size-4" />}
              ارسال
            </Button>
            {sentCount !== null && (
              <span className="text-xs text-muted-foreground">
                آخرین ارسال: {toPersianDigits(sentCount)} گیرنده
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function AdminBroadcastView(props: AdminBroadcastViewProps) {
  return (
    <AdminGate>
      <AdminBroadcastInner {...props} />
    </AdminGate>
  );
}

export default AdminBroadcastView;
