"use client";
// POSTYAR auth flow: tabs login email+password | login mobile+OTP | register (7 fields) | complete-mobile-register
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useSession } from "@/components/layout/session-provider";
import { isValidEmail, isValidIranMobile, normalizeMobile, toPersianDigits } from "@/lib/persian";
import { SendIcon, ArrowLeftIcon } from "lucide-react";

export interface AuthProps {
  navigate: (to: string) => void;
}

type Tab = "login-email" | "login-mobile" | "register";

export function Auth({ navigate }: AuthProps) {
  const { refresh } = useSession();
  const [tab, setTab] = useState<Tab>("login-email");

  async function handleEmailLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email") ?? "");
    const password = String(f.get("password") ?? "");
    if (!isValidEmail(email)) return toast.error("ایمیل نامعتبر است.");
    const r = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }), credentials: "same-origin" });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return toast.error(data?.errorFa ?? "ورود ناموفق بود.");
    toast.success("خوش آمدید!");
    await refresh();
    navigate("/dashboard");
  }

  // Mobile OTP step
  const [mobile, setMobile] = useState("");
  const [otpStep, setOtpStep] = useState<"request" | "verify" | "complete">("request");
  const [cooldown, setCooldown] = useState(0);
  const [verifyToken, setVerifyToken] = useState("");

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function requestOtp() {
    if (!isValidIranMobile(mobile)) return toast.error("شماره موبایل نامعتبر است (۰۹XXXXXXXXX).");
    setCooldown(0);
    const r = await fetch("/api/auth/otp-request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mobile, purpose: "login" }), credentials: "same-origin" });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      toast.error(data?.errorFa ?? "درخواست کد ناموفق بود.");
      if (data?.cooldownSec) setCooldown(Math.ceil(data.cooldownSec));
      return;
    }
    toast.success("کد یکبار مصرف ارسال شد.");
    setOtpStep("verify");
    if (data?.cooldownSec) setCooldown(Math.ceil(data.cooldownSec));
  }

  async function verifyOtp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const code = String(f.get("code") ?? "");
    if (!/^\d{6}$/.test(code)) return toast.error("کد ۶ رقمی را وارد کنید.");
    const r = await fetch("/api/auth/otp-verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mobile, code, purpose: "login" }), credentials: "same-origin" });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return toast.error(data?.errorFa ?? "تأیید کد ناموفق بود.");
    if (data?.purpose === "login" && data?.user) {
      toast.success("خوش آمدید!");
      await refresh();
      navigate("/dashboard");
      return;
    }
    if (data?.verifyToken) {
      setVerifyToken(data.verifyToken);
      setOtpStep("complete");
      toast.info("برای تکمیل ثبت‌نام، اطلاعات حساب را وارد کنید.");
    }
  }

  async function completeRegister(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = {
      mobile,
      verifyToken,
      firstName: String(f.get("firstName") ?? ""),
      lastName: String(f.get("lastName") ?? ""),
      email: String(f.get("email") ?? ""),
      password: String(f.get("password") ?? ""),
      activityType: String(f.get("activityType") ?? "personal"),
      businessName: String(f.get("businessName") ?? ""),
      referralCode: String(f.get("referralCode") ?? ""),
    };
    if (!isValidEmail(body.email)) return toast.error("ایمیل نامعتبر است.");
    const r = await fetch("/api/auth/complete-mobile-register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return toast.error(data?.errorFa ?? "ثبت‌نام ناموفق بود.");
    toast.success("حساب شما ساخته شد!");
    await refresh();
    navigate("/dashboard");
  }

  async function handleRegister(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = {
      firstName: String(f.get("firstName") ?? ""),
      lastName: String(f.get("lastName") ?? ""),
      email: String(f.get("email") ?? ""),
      mobile: String(f.get("mobile") ?? ""),
      password: String(f.get("password") ?? ""),
      activityType: String(f.get("activityType") ?? "personal"),
      businessName: String(f.get("businessName") ?? ""),
      referralCode: String(f.get("referralCode") ?? ""),
    };
    if (!isValidEmail(body.email)) return toast.error("ایمیل نامعتبر است.");
    if (!isValidIranMobile(body.mobile)) return toast.error("موبایل نامعتبر است (۰۹XXXXXXXXX).");
    if (body.password.length < 8) return toast.error("رمز عبور باید حداقل ۸ نویسه باشد.");
    const r = await fetch("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return toast.error(data?.errorFa ?? "ثبت‌نام ناموفق بود.");
    toast.success("حساب شما ساخته شد! اکنون وارد شوید.");
    setTab("login-email");
  }

  return (
    <div className="flex min-h-screen flex-col bg-background" dir="rtl">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4">
          <button onClick={() => navigate("/")} className="flex items-center gap-2">
            <div className="rounded-md bg-primary p-1.5 text-primary-foreground">
              <SendIcon className="size-4" />
            </div>
            <span className="font-bold">پُست‌یار</span>
          </button>
          <Button variant="ghost" size="sm" onClick={() => navigate("/")}>بازگشت به خانه</Button>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center">ورود / ثبت‌نام</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} dir="rtl">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="login-email">ایمیل</TabsTrigger>
                <TabsTrigger value="login-mobile">موبایل</TabsTrigger>
                <TabsTrigger value="register">ثبت‌نام</TabsTrigger>
              </TabsList>

              {/* Email + password */}
              <TabsContent value="login-email">
                <form onSubmit={handleEmailLogin} className="space-y-3 pt-2">
                  <div className="space-y-1">
                    <Label htmlFor="email">ایمیل</Label>
                    <Input id="email" name="email" type="email" autoComplete="email" required dir="ltr" placeholder="you@example.com" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="password">رمز عبور</Label>
                    <Input id="password" name="password" type="password" autoComplete="current-password" required dir="ltr" />
                  </div>
                  <Button type="submit" className="w-full gap-2">
                    ورود <ArrowLeftIcon className="size-4" />
                  </Button>
                </form>
              </TabsContent>

              {/* Mobile + OTP */}
              <TabsContent value="login-mobile">
                {otpStep === "request" && (
                  <div className="space-y-3 pt-2">
                    <div className="space-y-1">
                      <Label htmlFor="mobile">شماره موبایل</Label>
                      <Input
                        id="mobile"
                        inputMode="numeric"
                        value={mobile}
                        onChange={(e) => setMobile(normalizeMobile(e.target.value))}
                        dir="ltr"
                        placeholder="۰۹۱۲۳۴۵۶۷۸۹"
                        className="text-left"
                      />
                    </div>
                    <Button onClick={requestOtp} disabled={cooldown > 0} className="w-full">
                      {cooldown > 0 ? `ارسال مجدد در ${toPersianDigits(cooldown)} ثانیه` : "ارسال کد"}
                    </Button>
                    <div className="text-xs text-muted-foreground">
                      کد یکبار مصرف از طریق پیامک ارسال می‌شود. در محیط پیش‌نمایش می‌توانید کد را از <a href="/api/auth/dev/otp-test?mobile=09123456789" className="underline" target="_blank" rel="noreferrer">آدرس تست</a> بخوانید.
                    </div>
                  </div>
                )}

                {otpStep === "verify" && (
                  <form onSubmit={verifyOtp} className="space-y-3 pt-2">
                    <div className="space-y-1">
                      <Label htmlFor="code">کد یکبار مصرف</Label>
                      <Input id="code" name="code" inputMode="numeric" maxLength={6} required dir="ltr" placeholder="۱۲۳۴۵۶" className="text-left" />
                    </div>
                    <Button type="submit" className="w-full">تأیید و ورود</Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setOtpStep("request")} className="w-full">بازگشت</Button>
                  </form>
                )}

                {otpStep === "complete" && (
                  <form onSubmit={completeRegister} className="space-y-3 pt-2">
                    <p className="text-xs text-muted-foreground">برای تکمیل ثبت‌نام، اطلاعات زیر را وارد کنید.</p>
                    <Field label="نام" name="firstName" required />
                    <Field label="نام خانوادگی" name="lastName" required />
                    <Field label="ایمیل" name="email" type="email" required dir="ltr" />
                    <Field label="رمز عبور (حداقل ۸ نویسه)" name="password" type="password" required dir="ltr" />
                    <ActivityField />
                    <Field label="نام کسب‌وکار" name="businessName" />
                    <Field label="کد معرف (اختیاری)" name="referralCode" dir="ltr" />
                    <Button type="submit" className="w-full gap-2">تکمیل ثبت‌نام <ArrowLeftIcon className="size-4" /></Button>
                  </form>
                )}
              </TabsContent>

              {/* Full register */}
              <TabsContent value="register">
                <form onSubmit={handleRegister} className="space-y-3 pt-2">
                  <p className="text-xs text-muted-foreground">هر هفت فیلد زیر ضروری هستند.</p>
                  <Field label="نام" name="firstName" required />
                  <Field label="نام خانوادگی" name="lastName" required />
                  <Field label="ایمیل" name="email" type="email" required dir="ltr" />
                  <Field label="موبایل" name="mobile" required dir="ltr" placeholder="۰۹XXXXXXXXX" />
                  <Field label="رمز عبور (حداقل ۸ نویسه)" name="password" type="password" required dir="ltr" />
                  <ActivityField />
                  <Field label="نام کسب‌وکار" name="businessName" />
                  <Field label="کد معرف (اختیاری)" name="referralCode" dir="ltr" />
                  <Button type="submit" className="w-full">ساخت حساب کاربری</Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </main>

      <footer className="mt-auto border-t py-4 text-center text-xs text-muted-foreground">
        © {toPersianDigits(new Date().getFullYear())} پُست‌یار
      </footer>
    </div>
  );
}

function Field({ label, name, type = "text", required, dir, placeholder }: { label: string; name: string; type?: string; required?: boolean; dir?: "ltr" | "rtl"; placeholder?: string }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={name}>{label}{required && <span className="text-destructive">*</span>}</Label>
      <Input id={name} name={name} type={type} required={required} dir={dir ?? "rtl"} placeholder={placeholder} />
    </div>
  );
}

function ActivityField() {
  return (
    <div className="space-y-1">
      <Label htmlFor="activityType">نوع فعالیت</Label>
      <Select name="activityType" defaultValue="personal">
        <SelectTrigger id="activityType"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="personal">شخصی</SelectItem>
          <SelectItem value="business">کسب‌وکار</SelectItem>
          <SelectItem value="marketer">بازاریاب</SelectItem>
          <SelectItem value="service">خدماتی</SelectItem>
          <SelectItem value="media">رسانه</SelectItem>
          <SelectItem value="other">سایر</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

export default Auth;
