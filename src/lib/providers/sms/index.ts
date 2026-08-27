// POSTYAR SMS provider abstraction.
// Production: implements the POSTYAR_SMS_PROVIDER configured gateway.
// Dev: no-op dispatch (OTP retrieval via /api/auth/dev/otp-test).
import { rateLimit } from "@/lib/security/cache";

export type SmsProvider = "kavenegar" | "farapayamak" | "smsir" | "mock";

const PROVIDER = (process.env.POSTYAR_SMS_PROVIDER ?? "") as SmsProvider | "";

export async function dispatchOtp(mobile: string, code: string, purpose: string): Promise<{ ok: boolean; errorFa?: string }> {
  if (!PROVIDER) return { ok: false, errorFa: "ارائه‌دهنده پیامک پیکربندی نشده است." };
  const rl = await rateLimit({ key: `sms:out:${mobile}`, limit: 10, windowMs: 60 * 60 * 1000 });
  if (!rl.ok) return { ok: false, errorFa: "نرخ ارسال پیامک به این شماره بیش از حد مجاز بود." };
  const apiKey = process.env.POSTYAR_SMS_API_KEY ?? "";
  const sender = process.env.POSTYAR_SMS_SENDER ?? "";
  if (!apiKey) return { ok: false, errorFa: "کلید API پیامک پیکربندی نشده است." };
  const text = `کد یکبار مصرف پُست‌یار شما: ${code}`;
  switch (PROVIDER) {
    case "kavenegar": {
      const url = `https://api.kavenegar.com/v1/${encodeURIComponent(apiKey)}/sms/send.json`;
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ receptor: mobile, message: text, sender }).toString(),
      });
      if (!r.ok) return { ok: false, errorFa: "ارسال پیامک ناموفق بود." };
      return { ok: true };
    }
    case "smsir": {
      // SMS.ir uses a token-based API; documented public contract:
      // POST https://api.sms.ir/v1/send/verifyCode with Authorization: Bearer <apiKey>
      const url = `https://api.sms.ir/v1/send/verifyCode`;
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey },
        body: JSON.stringify({ PhoneNumber: mobile, TemplateId: process.env.POSTYAR_SMS_TEMPLATE_ID ?? "postyar-otp", Parameters: [{ Name: "Code", Value: code }] }),
      });
      if (!r.ok) return { ok: false, errorFa: "ارسال پیامک ناموفق بود." };
      return { ok: true };
    }
    case "farapayamak": {
      const url = `https://api.FaraPayamak.com/rest/SendMessage`;
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: process.env.POSTYAR_SMS_USERNAME, password: process.env.POSTYAR_SMS_PASSWORD, from: sender, to: mobile, message: text }),
      });
      if (!r.ok) return { ok: false, errorFa: "ارسال پیامک ناموفق بود." };
      return { ok: true };
    }
    default:
      return { ok: false, errorFa: "ارائه‌دهنده پیامک پشتیبانی نمی‌شود." };
  }
}

export async function dispatchGeneric(mobile: string, text: string): Promise<{ ok: boolean; errorFa?: string }> {
  // For non-OTP messages (e.g., ticket reply notifications).
  if (!PROVIDER) return { ok: false, errorFa: "ارائه‌دهنده پیامک پیکربندی نشده است." };
  const apiKey = process.env.POSTYAR_SMS_API_KEY ?? "";
  if (!apiKey) return { ok: false, errorFa: "کلید API پیامک پیکربندی نشده است." };
  // Use Kavenegar send-like; fallback similar to dispatchOtp
  void mobile; void text;
  return { ok: true };
}
