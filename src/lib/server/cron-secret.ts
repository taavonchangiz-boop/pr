// =====================================================================
// POSTYAR — Cron secret gate
// ---------------------------------------------------------------------
// Compares the `x-postyar-cron-secret` request header to the configured
// env `POSTYAR_CRON_SECRET`. Uses constant-time compare to thwart
// timing-based discovery. In dev (NODE_ENV !== production) the secret is
// optional and defaults to a derived deterministic value so cron
// endpoints can be exercised without env config.
// =====================================================================
import { constantTimeEqual } from "@/lib/security/crypto";

function getConfiguredSecret(): string | null {
  const s = process.env.POSTYAR_CRON_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === "production") return null;
  // Dev fallback: a deterministic string derived from cwd (not cryptographically
  // strong — dev only).
  return "dev-cron-secret-not-for-prod";
}

export async function requireCronSecret(req: Request): Promise<{ ok: boolean; errorFa?: string }> {
  const expected = getConfiguredSecret();
  if (!expected) {
    return { ok: false, errorFa: "سرویس زمان‌بندی پیکربندی نشده است." };
  }
  const got = req.headers.get("x-postyar-cron-secret") ?? "";
  if (!got) {
    return { ok: false, errorFa: "هدر سرویس زمان‌بندی ارسال نشده است." };
  }
  if (got.length !== expected.length) return { ok: false, errorFa: "هدر نامعتبر است." };
  if (!constantTimeEqual(got, expected)) {
    return { ok: false, errorFa: "هدر نامعتبر است." };
  }
  return { ok: true };
}
