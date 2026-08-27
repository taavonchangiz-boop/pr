// POSTYAR — /api/admin/settings (GET + POST SystemSetting rows)
// Admin only. Keys are validated against a whitelist of allowed keys.
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, clientIp, audit, AuthError } from "@/lib/server/auth";
import { db } from "@/lib/db";
import { formatJalaliDateTime } from "@/lib/persian";

const ALLOWED_KEYS = [
  "site.nameFa",
  "site.supportEmail",
  "site.supportMobile",
  "site.termsUrl",
  "site.privacyUrl",
  "ai.defaultProvider",
  "ai.defaultModel",
  "gold.defaultInstrument",
  "sms.enabled",
  "email.enabled",
  "signup.enabled",
  "maintenance.messageFa",
];

const PostSchema = z.object({
  key: z.string().min(1).max(80),
  value: z.string().max(8000),
});

export async function GET() {
  let user;
  try { user = await requireRole(["admin"]); } catch (e) {
    return NextResponse.json({ errorFa: (e as AuthError).message }, { status: (e as AuthError).status });
  }
  void user;
  const rows = await db.systemSetting.findMany();
  return NextResponse.json({
    items: rows.map((r) => ({
      key: r.key,
      value: r.value,
      updatedAt: r.updatedAt.toISOString(),
      updatedAtFa: formatJalaliDateTime(r.updatedAt, { withTime: true }),
    })),
    allowedKeys: ALLOWED_KEYS,
  });
}

export async function POST(req: Request) {
  let user;
  try { user = await requireRole(["admin"]); } catch (e) {
    return NextResponse.json({ errorFa: (e as AuthError).message }, { status: (e as AuthError).status });
  }
  const ip = clientIp(req);
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ errorFa: "بدنه درخواست نامعتبر است." }, { status: 400 });
  }
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { errorFa: parsed.error.issues[0]?.message ?? "ورودی نامعتبر است." },
      { status: 400 },
    );
  }
  if (!ALLOWED_KEYS.includes(parsed.data.key)) {
    return NextResponse.json({ errorFa: "این کلید تنظیمات پشتیبانی نمی‌شود." }, { status: 400 });
  }
  const updated = await db.systemSetting.upsert({
    where: { key: parsed.data.key },
    create: { key: parsed.data.key, value: parsed.data.value },
    update: { value: parsed.data.value },
  });
  await audit({
    userId: user.id,
    actor: "admin",
    action: "system_setting_updated",
    targetType: "system_setting",
    targetId: updated.key,
    ip,
    meta: { key: updated.key },
  });
  return NextResponse.json({
    ok: true,
    setting: {
      key: updated.key,
      value: updated.value,
      updatedAt: updated.updatedAt.toISOString(),
    },
  });
}
