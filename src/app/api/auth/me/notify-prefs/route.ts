// POSTYAR — GET/PATCH /api/auth/me/notify-prefs — per-category notification switches
// Stored in Profile.notifyPrefs as a JSON object { category: boolean }.
// Default policy when a key is absent: enabled (true).
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, clientIp, audit, AuthError, safeJsonParse } from "@/lib/server/auth";

export const NOTIFY_CATEGORIES = [
  "system",
  "billing",
  "subscription",
  "content",
  "referral",
  "marketing",
] as const;

const PatchSchema = z
  .object({
    prefs: z.record(z.string(), z.boolean()).optional(),
    system: z.boolean().optional(),
    billing: z.boolean().optional(),
    subscription: z.boolean().optional(),
    content: z.boolean().optional(),
    referral: z.boolean().optional(),
    marketing: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "حداقل یک ترجیح ارسال شود." });

export async function GET() {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    return NextResponse.json({ errorFa: (e as AuthError).message }, { status: (e as AuthError).status });
  }
  const row = await db.profile.findUnique({ where: { userId: user.id }, select: { notifyPrefs: true } });
  const prefs: Record<string, boolean> = safeJsonParse(row?.notifyPrefs ?? "{}", {});
  // Always surface all known categories with their effective boolean.
  const out: Record<string, boolean> = {};
  for (const k of NOTIFY_CATEGORIES) out[k] = prefs[k] !== false;
  return NextResponse.json({ prefs: out });
}

export async function PATCH(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    return NextResponse.json({ errorFa: (e as AuthError).message }, { status: (e as AuthError).status });
  }
  const ip = clientIp(req);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ errorFa: "بدنه درخواست نامعتبر است." }, { status: 400 });
  }
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { errorFa: parsed.error.issues[0]?.message ?? "ورودی نامعتبر است." },
      { status: 400 },
    );
  }
  const incoming = parsed.data;
  const row = await db.profile.findUnique({ where: { userId: user.id }, select: { notifyPrefs: true } });
  const current: Record<string, boolean> = safeJsonParse(row?.notifyPrefs ?? "{}", {});
  // Apply only known keys; ignore junk like role/status.
  for (const k of NOTIFY_CATEGORIES) {
    if (typeof incoming[k] === "boolean") current[k] = incoming[k] as boolean;
  }
  if (incoming.prefs && typeof incoming.prefs === "object") {
    for (const k of NOTIFY_CATEGORIES) {
      if (typeof incoming.prefs[k] === "boolean") current[k] = incoming.prefs[k];
    }
  }
  await db.profile.upsert({
    where: { userId: user.id },
    create: { userId: user.id, notifyPrefs: JSON.stringify(current) },
    update: { notifyPrefs: JSON.stringify(current) },
  });
  await audit({
    userId: user.id,
    actor: "user",
    action: "notify_prefs_updated",
    targetType: "user",
    targetId: user.id,
    ip,
    meta: { prefs: current },
  });
  const out: Record<string, boolean> = {};
  for (const k of NOTIFY_CATEGORIES) out[k] = current[k] !== false;
  return NextResponse.json({ prefs: out });
}
