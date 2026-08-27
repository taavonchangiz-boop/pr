"use client";
// =====================================================================
// POSTYAR — Profile View (settings)
// ---------------------------------------------------------------------
// Three cards:
//   1) Profile fields: firstName, lastName, email, mobile (masked, editable
//      with re-verification handled server-side), activityType (Select),
//      businessName, referralCode. Save via PATCH /api/auth/me/profile.
//   2) Change password: currentPassword + newPassword (verified server-side
//      before being rotated). POST /api/auth/me/password.
//   3) Notification preferences: a Switch per category. PATCH
//      /api/auth/me/notify-prefs.
// =====================================================================
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  BellIcon,
  CopyIcon,
  KeyRoundIcon,
  Loader2Icon,
  LockIcon,
  RefreshCwIcon,
  SaveIcon,
  ShieldCheckIcon,
  UserIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { api } from "@/components/postyar/api";
import { useSession } from "@/components/layout/session-provider";
import { toPersianDigits } from "@/lib/persian";

export interface ProfileViewProps {
  navigate: (to: string) => void;
}

const ACTIVITY_TYPES = [
  { value: "personal", label: "شخصی" },
  { value: "business", label: "کسب‌وکار" },
  { value: "marketer", label: "بازاریاب" },
  { value: "service", label: "خدمات" },
  { value: "media", label: "رسانه" },
  { value: "other", label: "سایر" },
];

// 7 persisted profile fields schema. role/status are NOT here — server enforces
// the same whitelist.
const ProfileSchema = z.object({
  firstName: z.string().min(1, "نام را وارد کنید.").max(80),
  lastName: z.string().min(1, "نام خانوادگی را وارد کنید.").max(120),
  email: z.string().email("ایمیل نامعتبر است."),
  mobile: z.string().optional(),
  activityType: z.enum(["personal", "business", "marketer", "service", "media", "other"]),
  businessName: z.string().max(200).optional(),
  referralCode: z.string().min(4).max(32).optional(),
  bio: z.string().max(500).optional(),
});

type ProfileFormValues = z.infer<typeof ProfileSchema>;

function ProfileFieldsCard() {
  const qc = useQueryClient();
  const { refresh } = useSession();
  const profileQ = useQuery({
    queryKey: ["profile", "me"],
    queryFn: () => api.getProfile(),
    staleTime: 60_000,
  });

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(ProfileSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      mobile: "",
      activityType: "personal",
      businessName: "",
      referralCode: "",
      bio: "",
    },
  });

  // Sync the form when the server returns its first snapshot.
  useEffect(() => {
    if (profileQ.data) {
      form.reset({
        firstName: profileQ.data.firstName,
        lastName: profileQ.data.lastName,
        email: profileQ.data.email,
        mobile: profileQ.data.mobile, // masked — user can edit if they want to change
        activityType: (profileQ.data.activityType as ProfileFormValues["activityType"]) ?? "personal",
        businessName: profileQ.data.businessName ?? "",
        referralCode: profileQ.data.referralCode,
        bio: profileQ.data.bio ?? "",
      });
    }
  }, [profileQ.data, form]);

  // Watch the activityType so the Select stays in sync without calling form.watch() inline.
  const activityType = useWatch({ control: form.control, name: "activityType" }) ?? "personal";

  const save = useMutation({
    mutationFn: (values: ProfileFormValues) =>
      api.updateProfile({
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        mobile: values.mobile,
        activityType: values.activityType,
        businessName: values.businessName,
        referralCode: values.referralCode,
        bio: values.bio,
      }),
    onSuccess: async (updated) => {
      toast.success("پروفایل به‌روزرسانی شد.");
      form.reset({
        firstName: updated.firstName,
        lastName: updated.lastName,
        email: updated.email,
        mobile: updated.mobile,
        activityType: (updated.activityType as ProfileFormValues["activityType"]) ?? "personal",
        businessName: updated.businessName,
        referralCode: updated.referralCode,
        bio: updated.bio ?? "",
      });
      qc.invalidateQueries({ queryKey: ["profile", "me"] });
      // Refresh session in case the user changed their name (which is shown in the topbar).
      void refresh();
    },
    onError: (e: Error) => {
      toast.error(e.message ?? "به‌روزرسانی ناموفق بود.");
    },
  });

  if (profileQ.isLoading) {
    return (
      <Card dir="rtl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserIcon className="size-4" />
            اطلاعات پروفایل
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  const onSubmit = form.handleSubmit((values) => save.mutate(values));

  return (
    <Card dir="rtl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UserIcon className="size-4" />
          اطلاعات پروفایل
        </CardTitle>
        <CardDescription className="text-xs">
          نام، ایمیل، موبایل و سایر مشخصه‌های خود را اینجا ویرایش کنید.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pf-first">نام</Label>
              <Input id="pf-first" {...form.register("firstName")} />
              {form.formState.errors.firstName && (
                <p className="text-xs text-destructive">{form.formState.errors.firstName.message}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pf-last">نام خانوادگی</Label>
              <Input id="pf-last" {...form.register("lastName")} />
              {form.formState.errors.lastName && (
                <p className="text-xs text-destructive">{form.formState.errors.lastName.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pf-email">ایمیل</Label>
              <Input id="pf-email" type="email" dir="ltr" className="text-left" {...form.register("email")} />
              {form.formState.errors.email && (
                <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pf-mobile">موبایل</Label>
              <Input
                id="pf-mobile"
                dir="ltr"
                className="text-left"
                placeholder="۰۹۱۲***۴۵۶۷"
                {...form.register("mobile")}
              />
              <p className="text-xs text-muted-foreground">
                برای تغییر شماره، عدد جدید را وارد کنید. در صورت تکراری بودن، خطا نمایش داده می‌شود.
              </p>
              {form.formState.errors.mobile && (
                <p className="text-xs text-destructive">{form.formState.errors.mobile.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>نوع فعالیت</Label>
              <Select
                value={activityType}
                onValueChange={(v) => form.setValue("activityType", v as ProfileFormValues["activityType"], { shouldDirty: true })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTIVITY_TYPES.map((a) => (
                    <SelectItem key={a.value} value={a.value}>
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pf-biz">نام کسب‌وکار / برند</Label>
              <Input id="pf-biz" {...form.register("businessName")} placeholder="اختیاری" />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pf-refcode">کد معرفی</Label>
            <div className="flex gap-2">
              <Input
                id="pf-refcode"
                dir="ltr"
                className="text-left font-mono"
                {...form.register("referralCode")}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0"
                aria-label="کپی کد معرفی"
                onClick={() => {
                  const v = form.getValues("referralCode");
                  if (!v) return;
                  navigator.clipboard?.writeText(v).then(
                    () => toast.success("کد معرفی کپی شد."),
                    () => toast.error("کپی ناموفق بود."),
                  );
                }}
              >
                <CopyIcon className="size-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              کد معرفی، شناسهٔ یکتای شماست. دوستان می‌توانند هنگام ثبت‌نام از این کد استفاده کنند.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pf-bio">دربارهٔ شما</Label>
            <Input id="pf-bio" {...form.register("bio")} placeholder="اختیاری — تا ۵۰۰ نویسه" />
          </div>

          <Separator />

          <div className="flex items-center gap-2">
            <Button type="submit" disabled={save.isPending || !form.formState.isDirty} className="gap-2">
              {save.isPending ? <Loader2Icon className="size-4 animate-spin" /> : <SaveIcon className="size-4" />}
              ذخیرهٔ تغییرات
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => profileQ.data && form.reset({
                firstName: profileQ.data.firstName,
                lastName: profileQ.data.lastName,
                email: profileQ.data.email,
                mobile: profileQ.data.mobile,
                activityType: (profileQ.data.activityType as ProfileFormValues["activityType"]) ?? "personal",
                businessName: profileQ.data.businessName,
                referralCode: profileQ.data.referralCode,
                bio: profileQ.data.bio ?? "",
              })}
              disabled={save.isPending}
            >
              بازنشانی
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function ChangePasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  const change = useMutation({
    mutationFn: () => api.changePassword({ currentPassword: current, newPassword: next }),
    onSuccess: () => {
      toast.success("رمز عبور با موفقیت تغییر کرد.");
      setCurrent("");
      setNext("");
      setConfirm("");
    },
    onError: (e: Error) => {
      toast.error(e.message ?? "تغییر رمز ناموفق بود.");
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== confirm) {
      toast.error("تکرار رمز جدید با رمز اصلی همخوانی ندارد.");
      return;
    }
    if (next.length < 8) {
      toast.error("رمز جدید باید حداقل ۸ نویسه باشد.");
      return;
    }
    change.mutate();
  };

  return (
    <Card dir="rtl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRoundIcon className="size-4" />
          تغییر رمز عبور
        </CardTitle>
        <CardDescription className="text-xs">
          برای امنیت بیشتر، رمز فعلی شما پیش از تغییر بررسی می‌شود.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cp-current">رمز فعلی</Label>
            <Input
              id="cp-current"
              type="password"
              dir="ltr"
              className="text-left"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cp-new">رمز جدید</Label>
              <Input
                id="cp-new"
                type="password"
                dir="ltr"
                className="text-left"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                autoComplete="new-password"
              />
              <p className="text-xs text-muted-foreground">حداقل ۸ نویسه.</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cp-confirm">تکرار رمز جدید</Label>
              <Input
                id="cp-confirm"
                type="password"
                dir="ltr"
                className="text-left"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          </div>
          <div>
            <Button type="submit" disabled={change.isPending || !current || !next || !confirm} className="gap-2">
              {change.isPending ? <Loader2Icon className="size-4 animate-spin" /> : <LockIcon className="size-4" />}
              تغییر رمز
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

const NOTIFY_CATEGORIES: Array<{ key: string; label: string; description: string }> = [
  { key: "system", label: "سیستمی", description: "اعلان‌های فنی و امنیتی" },
  { key: "billing", label: "مالی", description: "پرداخت‌ها، فاکتورها، بازگشت وجه" },
  { key: "subscription", label: "اشتراک", description: "تمدید، انقضا و تغییر پلن" },
  { key: "content", label: "محتوا", description: "وضعیت انتشار و زمان‌بندی" },
  { key: "referral", label: "معرفی", description: "ثبت زیرمجموعهٔ جدید و واریز پاداش" },
  { key: "marketing", label: "بازاریابی", description: "نوآوری‌ها و پیشنهادها" },
];

function NotificationPrefsCard() {
  const qc = useQueryClient();
  const prefsQ = useQuery({
    queryKey: ["profile", "notify-prefs"],
    queryFn: () => api.getNotifyPrefs(),
    staleTime: 60_000,
  });

  // Track pending overrides (optimistic UI). Cleared when the server confirms.
  const [pending, setPending] = useState<Record<string, boolean>>({});

  const update = useMutation({
    mutationFn: (next: Record<string, boolean>) => api.updateNotifyPrefs(next),
    onMutate: async (next) => {
      // Optimistically update the React Query cache so the UI flickers less.
      await qc.cancelQueries({ queryKey: ["profile", "notify-prefs"] });
      const previous = qc.getQueryData<Record<string, boolean>>(["profile", "notify-prefs"]);
      qc.setQueryData<Record<string, boolean>>(["profile", "notify-prefs"], () => next);
      return { previous };
    },
    onError: (e: Error, _next, ctx) => {
      if (ctx?.previous) qc.setQueryData(["profile", "notify-prefs"], ctx.previous);
      toast.error(e.message ?? "به‌روزرسانی ناموفق بود.");
    },
    onSettled: () => {
      setPending({});
      qc.invalidateQueries({ queryKey: ["profile", "notify-prefs"] });
    },
    onSuccess: () => {
      toast.success("ترجیح‌های اعلان به‌روزرسانی شد.");
    },
  });

  // Derived view: server prefs overlaid with pending overrides.
  const data = prefsQ.data ?? {};
  const effective: Record<string, boolean> = { ...data, ...pending };

  return (
    <Card dir="rtl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BellIcon className="size-4" />
          ترجیح‌های اعلان
        </CardTitle>
        <CardDescription className="text-xs">
          انتخاب کنید کدام رویدادها برای شما پیامک یا ایمیل کنند.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {prefsQ.isLoading ? (
          Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)
        ) : (
          NOTIFY_CATEGORIES.map((c) => {
            const value = effective[c.key] !== false;
            return (
              <div
                key={c.key}
                className="flex items-center justify-between gap-3 rounded-md border p-3"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">{c.label}</span>
                  <span className="text-xs text-muted-foreground">{c.description}</span>
                </div>
                <Switch
                  checked={value}
                  onCheckedChange={(v) => {
                    const next = { ...effective, [c.key]: v };
                    setPending((p) => ({ ...p, [c.key]: v }));
                    update.mutate(next);
                  }}
                  disabled={update.isPending}
                />
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

export default function ProfileView({ navigate: _navigate }: ProfileViewProps) {
  void _navigate;
  return (
    <div className="flex flex-col gap-4" dir="rtl">
      <header>
        <h1 className="text-2xl font-bold">پروفایل و تنظیمات</h1>
        <p className="text-sm text-muted-foreground">
          اطلاعات حساب کاربری خود را اینجا مدیریت کنید.
        </p>
      </header>

      <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground" dir="rtl">
        <ShieldCheckIcon className="size-4" />
        <span>
          برای امنیت شما، نقش و وضعیت حساب از طریق این فرم قابل ویرایش نیست.
        </span>
        <Badge variant="outline" className="mr-auto">فقط ۷ فیلد پروفایل</Badge>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ProfileFieldsCard />
        <div className="flex flex-col gap-4">
          <ChangePasswordCard />
          <NotificationPrefsCard />
        </div>
      </div>
    </div>
  );
}
