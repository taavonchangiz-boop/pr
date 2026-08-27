// POSTYAR — /api/destinations/[id]/buttons/[buttonId]
// PATCH  update a single button (must belong to destinationId and user)
// DELETE delete a single button
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, clientIp, audit, AuthError } from "@/lib/server/auth";
import { rateLimit } from "@/lib/security/cache";
import { toGlassButtonView, assertOwnership } from "@/lib/destinations/helpers";

const PatchSchema = z.object({
  label: z.string().min(1).max(64).optional(),
  url: z.string().url().optional().nullable(),
  callbackData: z.string().min(1).max(64).optional().nullable(),
  rowOrder: z.number().int().min(0).max(20).optional(),
  enabled: z.boolean().optional(),
});

type Params = { params: Promise<{ id: string; buttonId: string }> };

export async function PATCH(req: Request, { params }: Params) {
  let user;
  try { user = await requireUser(); } catch (e) {
    return NextResponse.json({ errorFa: (e as AuthError).message }, { status: (e as AuthError).status });
  }
  const ip = clientIp(req);
  const { id, buttonId } = await params;

  const owns = await assertOwnership(id, user.id);
  if (!owns) {
    return NextResponse.json({ errorFa: "مقصد یافت نشد." }, { status: 404 });
  }
  const button = await db.glassButton.findUnique({ where: { id: buttonId } });
  if (!button || button.destinationId !== id) {
    return NextResponse.json({ errorFa: "دکمه یافت نشد." }, { status: 404 });
  }

  const rl = await rateLimit({ key: `btn:patch:${user.id}`, limit: 60, windowMs: 60 * 1000 });
  if (!rl.ok) {
    return NextResponse.json({ errorFa: "تعداد درخواست بیش از حد مجاز است." }, { status: 429 });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ errorFa: "بدنه درخواست نامعتبر است." }, { status: 400 });
  }
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { errorFa: parsed.error.issues[0]?.message ?? "ورودی نامعتبر است." },
      { status: 400 },
    );
  }
  const patch = parsed.data;
  const updated = await db.glassButton.update({
    where: { id: buttonId },
    data: {
      ...(patch.label !== undefined ? { label: patch.label } : {}),
      ...(patch.url !== undefined ? { url: patch.url } : {}),
      ...(patch.callbackData !== undefined ? { callbackData: patch.callbackData } : {}),
      ...(patch.rowOrder !== undefined ? { rowOrder: patch.rowOrder } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
    },
  });
  await audit({
    userId: user.id,
    actor: "user",
    action: "button_update",
    targetType: "destination",
    targetId: id,
    ip,
    meta: { buttonId, fields: Object.keys(patch) },
  });
  return NextResponse.json({ ok: true, button: toGlassButtonView(updated) });
}

export async function DELETE(req: Request, { params }: Params) {
  let user;
  try { user = await requireUser(); } catch (e) {
    return NextResponse.json({ errorFa: (e as AuthError).message }, { status: (e as AuthError).status });
  }
  const ip = clientIp(req);
  const { id, buttonId } = await params;
  const owns = await assertOwnership(id, user.id);
  if (!owns) {
    return NextResponse.json({ errorFa: "مقصد یافت نشد." }, { status: 404 });
  }
  const button = await db.glassButton.findUnique({ where: { id: buttonId } });
  if (!button || button.destinationId !== id) {
    return NextResponse.json({ errorFa: "دکمه یافت نشد." }, { status: 404 });
  }
  await db.glassButton.delete({ where: { id: buttonId } });
  await audit({
    userId: user.id,
    actor: "user",
    action: "button_delete",
    targetType: "destination",
    targetId: id,
    ip,
    meta: { buttonId },
  });
  return NextResponse.json({ ok: true });
}
