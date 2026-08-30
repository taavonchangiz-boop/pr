// POSTYAR Email provider abstraction (SMTP).
// Production: real SMTP relay configured via env.
// Dev: in-memory cache that the dev-only endpoint reads.
//
// ITEM 40 — provider config is resolved via `getSetting(key, fallback)`
// which reads the admin-managed `SystemSetting` row first (so the admin
// can override SMTP settings from the settings UI without a redeploy),
// then falls back to the `process.env`. The semantics are unchanged when
// no SystemSetting row exists — the env value is used.
import { cache } from "@/lib/security/cache";
import { getSetting } from "@/lib/providers/util";

export async function sendEmail(opts: { to: string; subjectFa: string; htmlFa: string }): Promise<{ ok: boolean; errorFa?: string }> {
  const host = await getSetting("POSTYAR_SMTP_HOST", "");
  const user = await getSetting("POSTYAR_SMTP_USER", "");
  const portStr = await getSetting("POSTYAR_SMTP_PORT", "587");
  const port = Number(portStr || "587");
  const password = await getSetting("POSTYAR_SMTP_PASSWORD", "");
  const sender = await getSetting("POSTYAR_SMTP_SENDER_EMAIL", "no-reply@postyar.local");
  const senderName = await getSetting("POSTYAR_SMTP_SENDER_NAME", "پُست‌یار");

  if (process.env.NODE_ENV !== "production" || !host || !user) {
    // Dev preview
    await cache.set(`dev:email:${opts.to}:${Date.now()}`, opts, 30 * 60 * 1000);
    return { ok: true };
  }
  // Production SMTP using fetch to an SMTP-over-HTTP relay is not straightforward;
  // use Node's net to do SMTP directly OR delegate to a transactional service.
  // For cPanel/Passenger, use sendmail if available. Otherwise document.
  try {
    const { sendMail } = await import("./sendmail");
    await sendMail({ host, port, user, password, sender, senderName, ...opts });
    return { ok: true };
  } catch {
    return { ok: false, errorFa: "ارسال ایمیل ناموفق بود." };
  }
}
