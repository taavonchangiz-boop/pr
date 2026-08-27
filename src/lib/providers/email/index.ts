// POSTYAR Email provider abstraction (SMTP).
// Production: real SMTP relay configured via env.
// Dev: in-memory cache that the dev-only endpoint reads.
import { cache } from "@/lib/security/cache";

const HOST = process.env.POSTYAR_SMTP_HOST ?? "";
const PORT = Number(process.env.POSTYAR_SMTP_PORT ?? "587");
const USER = process.env.POSTYAR_SMTP_USER ?? "";
const PASSWORD = process.env.POSTYAR_SMTP_PASSWORD ?? "";
const SENDER = process.env.POSTYAR_SMTP_SENDER_EMAIL ?? "no-reply@postyar.local";
const SENDER_NAME = process.env.POSTYAR_SMTP_SENDER_NAME ?? "پُست‌یار";

export async function sendEmail(opts: { to: string; subjectFa: string; htmlFa: string }): Promise<{ ok: boolean; errorFa?: string }> {
  if (process.env.NODE_ENV !== "production" || !HOST || !USER) {
    // Dev preview
    await cache.set(`dev:email:${opts.to}:${Date.now()}`, opts, 30 * 60 * 1000);
    return { ok: true };
  }
  // Production SMTP using fetch to an SMTP-over-HTTP relay is not straightforward;
  // use Node's net to do SMTP directly OR delegate to a transactional service.
  // For cPanel/Passenger, use sendmail if available. Otherwise document.
  try {
    const { sendMail } = await import("./sendmail");
    await sendMail({ host: HOST, port: PORT, user: USER, password: PASSWORD, sender: SENDER, senderName: SENDER_NAME, ...opts });
    return { ok: true };
  } catch (e) {
    return { ok: false, errorFa: "ارسال ایمیل ناموفق بود." };
  }
}
