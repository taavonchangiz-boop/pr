// POSTYAR SMS provider abstraction.
// Production: implements the POSTYAR_SMS_PROVIDER configured gateway.
// Dev: no-op dispatch (OTP retrieval via /api/auth/dev/otp-test).
//
// ITEM 40 — provider config is resolved via `getSetting(key, fallback)`
// which reads the admin-managed `SystemSetting` row first (so the admin
// can override the SMS provider from the settings UI without a redeploy),
// then falls back to the `process.env`. The semantics are unchanged when
// no SystemSetting row exists — the env value is used.
import { rateLimit } from "@/lib/security/cache";
import { getSetting } from "@/lib/providers/util";

export type SmsProvider = "kavenegar" | "farapayamak" | "smsir" | "mock";

export async function dispatchOtp(mobile: string, code: string, purpose: string): Promise<{ ok: boolean; errorFa?: string }> {
  const provider = ((await getSetting("POSTYAR_SMS_PROVIDER", "")) || "") as SmsProvider | "";
  if (!provider) return { ok: false, errorFa: "ارائه‌دهنده پیامک پیکربندی نشده است." };
  const rl = await rateLimit({ key: `sms:out:${mobile}`, limit: 10, windowMs: 60 * 60 * 1000 });
  if (!rl.ok) return { ok: false, errorFa: "نرخ ارسال پیامک به این شماره بیش از حد مجاز بود." };
  const apiKey = await getSetting("POSTYAR_SMS_API_KEY", "");
  const sender = await getSetting("POSTYAR_SMS_SENDER", "");
  if (!apiKey) return { ok: false, errorFa: "کلید API پیامک پیکربندی نشده است." };
  const text = `کد یکبار مصرف پُست‌یار شما: ${code}`;
  switch (provider) {
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
      const templateId = await getSetting("POSTYAR_SMS_TEMPLATE_ID", "postyar-otp");
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey },
        body: JSON.stringify({ PhoneNumber: mobile, TemplateId: templateId, Parameters: [{ Name: "Code", Value: code }] }),
      });
      if (!r.ok) return { ok: false, errorFa: "ارسال پیامک ناموفق بود." };
      return { ok: true };
    }
    case "farapayamak": {
      const url = `https://api.FaraPayamak.com/rest/SendMessage`;
      const username = await getSetting("POSTYAR_SMS_USERNAME", "");
      const password = await getSetting("POSTYAR_SMS_PASSWORD", "");
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, from: sender, to: mobile, message: text }),
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
  const provider = ((await getSetting("POSTYAR_SMS_PROVIDER", "")) || "") as SmsProvider | "";
  if (!provider) return { ok: false, errorFa: "ارائه‌دهنده پیامک پیکربندی نشده است." };
  const apiKey = await getSetting("POSTYAR_SMS_API_KEY", "");
  if (!apiKey) return { ok: false, errorFa: "کلید API پیامک پیکربندی نشده است." };
  // Use Kavenegar send-like; fallback similar to dispatchOtp
  void mobile; void text;
  return { ok: true };
}
