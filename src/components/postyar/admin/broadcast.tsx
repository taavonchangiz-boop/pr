"use client";
// =====================================================================
// POSTYAR — Admin Notifications Broadcast View
// ---------------------------------------------------------------------
// Segmented-audience form. Admin chooses audience:
//   - «همه کاربران» (all)
//   - «یک کاربر»    (single — search by email/mobile)
//   - «کاربران یک اشتراک»    (plan — pick from /api/plans)
//   - «کاربران چند اشتراک» (plans — multi-select)
//   - «همکاران»    (support — role in [support, admin])
//
// Submit POSTs { category?, titleFa, bodyFa, link?, audienceType,
// audienceMeta } to /api/admin/notifications/broadcast. Toast
// «اعلان برای N کاربر ارسال شد» on success.
// =====================================================================
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertCircleIcon,
  Loader2Icon,
  MegaphoneIcon,
  SearchIcon,
  SendIcon,
  UsersIcon,
  ShieldCheckIcon,
  CheckIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, type AdminPlanRow, type AdminUserRow } from "@/components/postyar/api";
import { AdminGate } from "@/components/postyar/admin/gate";
import { toPersianDigits } from "@/lib/persian";

export interface AdminBroadcastViewProps {
  navigate: (to: string) => void;
}

type AudienceType = "all" | "single" | "plan" | "plans" | "support";

const AUDIENCE_OPTIONS: Array<{ value: AudienceType; label: string; hint: string }> = [
  { value: "all", label: "همه کاربران", hint: "ارسال به همهٔ کاربران فعال" },
  { value: "single", label: "یک کاربر", hint: "انتخاب یک کاربر با ایمیل/موبایل" },
  { value: "plan", label: "کاربران یک اشتراک", hint: "کاربران دارای اشتراک فعالِ یک پلن" },
  { value: "plans", label: "کاربران چند اشتراک", hint: "اجتماع کاربران چند پلن" },
  { value: "support", label: "همکاران", hint: "پشتیبان‌ها و مدیران" },
];

const CATEGORY_OPTIONS = [
  { value: "system", label: "سیستم" },
  { value: "publish", label: "انتشار" },
  { value: "payment", label: "مالی" },
  { value: "subscription", label: "اشتراک" },
  { value: "referral", label: "معرفی" },
  { value: "ad", label: "تبلیغ" },
  { value: "ticket", label: "تیکت" },
  { value: "gold", label: "طلا" },
  { value: "woo", label: "ووکامرس" },
  { value: "security", label: "امنیتی" },
];

function audienceLabel(t: AudienceType): string {
  return AUDIENCE_OPTIONS.find((o) => o.value === t)?.label ?? t;
}

interface SendResult { ok: boolean; sent: number; recipientCount?: number; broadcastId?: string; }

function AdminBroadcastInner({ navigate: _navigate }: AdminBroadcastViewProps) {
  void _navigate;
  const [audienceType, setAudienceType] = useState<AudienceType>("all");
  const [category, setCategory] = useState<string>("system");
  const [titleFa, setTitleFa] = useState("");
  const [bodyFa, setBodyFa] = useState("");
  const [link, setLink] = useState("");
  const [sentCount, setSentCount] = useState<number | null>(null);
  const [broadcastId, setBroadcastId] = useState<string | null>(null);

  // single audience
  const [userSearch, setUserSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<AdminUserRow | null>(null);

  // plan audience
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");

  // plans audience (multi)
  const [selectedPlanIds, setSelectedPlanIds] = useState<string[]>([]);

  // ----- plans list -----
  const plansQ = useQuery({
    queryKey: ["admin", "plans", "list"],
    queryFn: () => api.getAdminPlansTyped(),
    staleTime: 60_000,
    enabled: audienceType === "plan" || audienceType === "plans",
  });
  const plans: AdminPlanRow[] = useMemo(() => plansQ.data?.items ?? [], [plansQ.data]);

  // ----- user search -----
  const usersQ = useQuery({
    queryKey: ["admin", "users", "search", userSearch] as const,
    queryFn: () => api.getAdminUsersTyped({ search: userSearch || undefined, limit: 10 }),
    staleTime: 10_000,
    enabled: audienceType === "single" && userSearch.trim().length >= 2,
  });
  const userResults: AdminUserRow[] = useMemo(() => usersQ.data?.items ?? [], [usersQ.data]);

  const sendMut = useMutation({
    mutationFn: async (): Promise<SendResult> => {
      const audienceMeta: Record<string, unknown> = {};
      if (audienceType === "single") {
        if (!selectedUser) throw new Error("یک کاربر انتخاب کنید.");
        audienceMeta.userId = selectedUser.id;
      } else if (audienceType === "plan") {
        if (!selectedPlanId) throw new Error("یک پلن انتخاب کنید.");
        audienceMeta.planId = selectedPlanId;
      } else if (audienceType === "plans") {
        if (selectedPlanIds.length === 0) throw new Error("حداقل یک پلن انتخاب کنید.");
        audienceMeta.planIds = selectedPlanIds;
      }
      const r = await fetch("/api/admin/notifications/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audienceType,
          audienceMeta,
          category,
          titleFa: titleFa.trim(),
          bodyFa: bodyFa.trim(),
          link: link.trim() || undefined,
        }),
        credentials: "same-origin",
      });
      const data = (await r.json().catch(() => ({}))) as Partial<SendResult> & { errorFa?: string };
      if (!r.ok || !data.ok) {
        throw new Error(data.errorFa ?? `ارسال ناموفق بود (کد ${r.status}).`);
      }
      return {
        ok: true,
        sent: typeof data.sent === "number" ? data.sent : 0,
        recipientCount: typeof data.recipientCount === "number" ? data.recipientCount : undefined,
        broadcastId: typeof data.broadcastId === "string" ? data.broadcastId : undefined,
      };
    },
    onSuccess: (data) => {
      const n = data.recipientCount ?? data.sent;
      setSentCount(n);
      setBroadcastId(data.broadcastId ?? null);
      toast.success(`اعلان برای ${toPersianDigits(n)} کاربر ارسال شد.`);
      // Don't auto-clear — admin may want to re-check; keep form populated.
    },
    onError: (e: Error) => toast.error(e.message ?? "ارسال ناموفق بود."),
  });

  const canSubmit =
    titleFa.trim().length >= 1 &&
    bodyFa.trim().length >= 1 &&
    (audienceType === "all" ||
      audienceType === "support" ||
      (audienceType === "single" && !!selectedUser) ||
      (audienceType === "plan" && !!selectedPlanId) ||
      (audienceType === "plans" && selectedPlanIds.length > 0));

  function togglePlanId(id: string) {
    setSelectedPlanIds((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
    );
  }

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <MegaphoneIcon className="size-6" />
          ارسال اعلان گروهی
        </h1>
        <p className="text-sm text-muted-foreground">
          ارسال اعلان به بخش‌بندی‌های مختلف کاربران. اعلان در صندوق اعلان هر گیرنده ثبت می‌شود.
        </p>
      </div>

      <Alert>
        <AlertTitle>تذکر</AlertTitle>
        <AlertDescription>
          اعلان گروهی به‌صورت ناهمگام ارسال می‌شود و در صندوق اعلان هر کاربر ثبت خواهد شد. یک ردیف BroadcastNotification با تعداد گیرندگان ذخیره می‌شود.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">فرم اعلان گروهی</CardTitle>
          <CardDescription>
            نوع مخاطب، عنوان و متن را وارد کنید. لینک اختیاری است.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* Audience selector */}
          <div className="flex flex-col gap-2">
            <Label>مخاطب</Label>
            <Select value={audienceType} onValueChange={(v) => setAudienceType(v as AudienceType)}>
              <SelectTrigger className="w-full cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AUDIENCE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                    <span className="text-xs text-muted-foreground"> — {o.hint}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* single — user search */}
          {audienceType === "single" && (
            <div className="flex flex-col gap-2 rounded-md border bg-muted/20 p-3">
              <Label>جستجوی کاربر</Label>
              <div className="relative">
                <SearchIcon className="absolute right-2 top-2.5 size-4 text-muted-foreground" />
                <Input
                  dir="ltr"
                  value={userSearch}
                  onChange={(e) => {
                    setUserSearch(e.target.value);
                    setSelectedUser(null);
                  }}
                  placeholder="email یا mobile"
                  className="pr-8"
                />
              </div>
              {selectedUser ? (
                <div className="flex flex-wrap items-center gap-2 rounded-md border bg-emerald-50 p-2 text-xs">
                  <CheckIcon className="size-4 text-emerald-600" />
                  <span className="font-medium">{selectedUser.firstName} {selectedUser.lastName}</span>
                  <span dir="ltr" className="text-muted-foreground">{selectedUser.email}</span>
                  <Badge variant="outline" className="text-[10px]">{selectedUser.role}</Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    onClick={() => setSelectedUser(null)}
                    aria-label="حذف انتخاب"
                  >
                    <XIcon className="size-3.5" />
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  {usersQ.isLoading && userSearch.trim().length >= 2 && (
                    <div className="flex items-center gap-2 p-2 text-xs text-muted-foreground">
                      <Loader2Icon className="size-3.5 animate-spin" /> در حال جستجو…
                    </div>
                  )}
                  {usersQ.isError && (
                    <div className="p-2 text-xs text-destructive">جستجو ناموفق بود.</div>
                  )}
                  {!usersQ.isLoading && userResults.length === 0 && userSearch.trim().length >= 2 && (
                    <div className="p-2 text-xs text-muted-foreground">نتیجه‌ای یافت نشد.</div>
                  )}
                  {userResults.slice(0, 8).map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => { setSelectedUser(u); setUserSearch(""); }}
                      className="flex cursor-pointer items-center justify-between gap-2 rounded-md border bg-background p-2 text-right text-xs transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <span className="flex flex-col">
                        <span className="font-medium">{u.firstName} {u.lastName}</span>
                        <span dir="ltr" className="text-muted-foreground">{u.email}</span>
                      </span>
                      <Badge variant="outline" className="text-[10px]">{u.role}</Badge>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* plan — single-select */}
          {audienceType === "plan" && (
            <div className="flex flex-col gap-2 rounded-md border bg-muted/20 p-3">
              <Label>انتخاب پلن</Label>
              {plansQ.isLoading ? (
                <Skeleton className="h-9 w-full" />
              ) : plansQ.error ? (
                <div className="text-xs text-destructive">بارگذاری پلن‌ها ناموفق بود.</div>
              ) : plans.length === 0 ? (
                <div className="text-xs text-muted-foreground">هیچ پلنی موجود نیست.</div>
              ) : (
                <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
                  <SelectTrigger className="w-full cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"><SelectValue placeholder="انتخاب پلن" /></SelectTrigger>
                  <SelectContent>
                    {plans.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nameFa} <span dir="ltr" className="text-[10px] text-muted-foreground">{p.code}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* plans — multi-select */}
          {audienceType === "plans" && (
            <div className="flex flex-col gap-2 rounded-md border bg-muted/20 p-3">
              <Label>انتخاب چند پلن</Label>
              {plansQ.isLoading ? (
                <Skeleton className="h-16 w-full" />
              ) : plansQ.error ? (
                <div className="text-xs text-destructive">بارگذاری پلن‌ها ناموفق بود.</div>
              ) : plans.length === 0 ? (
                <div className="text-xs text-muted-foreground">هیچ پلنی موجود نیست.</div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {plans.map((p) => {
                    const active = selectedPlanIds.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => togglePlanId(p.id)}
                        className={
                          "flex cursor-pointer items-center gap-1 rounded-md border px-3 py-1.5 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none " +
                          (active
                            ? "border-primary bg-primary/10 text-primary"
                            : "bg-background text-foreground hover:bg-muted/40")
                        }
                      >
                        {active ? <CheckIcon className="size-3" /> : null}
                        {p.nameFa}
                        <span dir="ltr" className="text-[10px] text-muted-foreground">{p.code}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              {selectedPlanIds.length > 0 && (
                <div className="text-xs text-muted-foreground">
                  {toPersianDigits(selectedPlanIds.length)} پلن انتخاب شده.
                </div>
              )}
            </div>
          )}

          {/* support hint */}
          {audienceType === "support" && (
            <Alert>
              <ShieldCheckIcon className="size-4" />
              <AlertTitle>همکاران</AlertTitle>
              <AlertDescription>
                اعلان به همهٔ کاربران فعال با نقش «پشتیبان» یا «مدیر» ارسال می‌شود.
              </AlertDescription>
            </Alert>
          )}

          {/* category + title + body + link */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="t-cat">دسته</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-full cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" id="t-cat"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="t-title">عنوان (فارسی)</Label>
              <Input
                id="t-title"
                value={titleFa}
                onChange={(e) => setTitleFa(e.target.value)}
                maxLength={200}
                className="focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="t-body">متن (فارسی)</Label>
            <Textarea
              id="t-body"
              rows={5}
              value={bodyFa}
              onChange={(e) => setBodyFa(e.target.value)}
              maxLength={2000}
              className="focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            />
            <span className="text-[10px] text-muted-foreground">
              {toPersianDigits(bodyFa.length)} / {toPersianDigits(2000)} نویسه
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="t-link">لینک (اختیاری)</Label>
            <Input
              id="t-link"
              dir="ltr"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://..."
              className="focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            />
          </div>

          {/* submit + result */}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => sendMut.mutate()}
              disabled={sendMut.isPending || !canSubmit}
              className="cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {sendMut.isPending ? <Loader2Icon className="size-4 animate-spin" /> : <SendIcon className="size-4" />}
              ارسال
            </Button>
            {sentCount !== null && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <UsersIcon className="size-3.5" />
                <span>آخرین ارسال: {audienceLabel(audienceType)} — {toPersianDigits(sentCount)} گیرنده</span>
                {broadcastId && (
                  <Badge variant="outline" className="text-[10px]" dir="ltr">
                    id: {broadcastId.slice(-8)}
                  </Badge>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Alert>
        <AlertCircleIcon className="size-4" />
        <AlertDescription>
          برای ارسال به همهٔ کاربران، صبر کنید تا عملیات تمام شود. ارسال‌های بزرگ ممکن است چند دقیقه طول بکشد.
        </AlertDescription>
      </Alert>
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
