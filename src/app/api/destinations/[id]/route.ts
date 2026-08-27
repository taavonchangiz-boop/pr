// POSTYAR — /api/destinations/[id]
// GET    fetch one (ownership-enforced)
// PATCH  update label/status/chatId; new botToken only if provided (re-verify)
// DELETE soft delete (status = "deleted")
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, clientIp, audit, AuthError } from "@/lib/server/auth";
import { rateLimit } from "@/lib/security/cache";
import { encryptString } from "@/lib/security/crypto";
import {
  toDestinationView,
  getDestinationProvider,
  isValidProviderName,
} from "@/lib/destinations/helpers";

const PatchSchema = z.object({
  label: z.string().min(1).max(120).optional(),
  status: z.enum(["active", "inactive", "error"]).optional(),
  chatId: z.string().min(1).max(64).optional(),
  botToken: z.string().min(8).max(256).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  let user;
  try { user = await requireUser(); } catch (e) {
    return NextResponse.json({ errorFa: (e as AuthError).message }, { status: (e as AuthError).status });
  }
  const { id } = await params;
  const d = await db.destination.findUnique({ where: { id } });
  if (!d || d.ownerId !== user.id || d.status === "deleted") {
    return NextResponse.json({ errorFa: "مقصد یافت نشد." }, { status: 404 });
  }
  return NextResponse.json({ destination: toDestinationView(d) });
}

export async function PATCH(req: Request, { params }: Params) {
  let user;
  try { user = await requireUser(); } catch (e) {
    return NextResponse.json({ errorFa: (e as AuthError).message }, { status: (e as AuthError).status });
  }
  const ip = clientIp(req);
  const { id } = await params;

  const rl = await rateLimit({ key: `dst:patch:${user.id}`, limit: 60, windowMs: 60 * 1000 });
  if (!rl.ok) {
    return NextResponse.json({ errorFa: "تعداد درخواست بیش از حد مجاز است." }, { status: 429 });
  }

  const existing = await db.destination.findUnique({ where: { id } });
  if (!existing || existing.ownerId !== user.id || existing.status === "deleted") {
    return NextResponse.json({ errorFa: "مقصد یافت نشد." }, { status: 404 });
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
  if (!isValidProviderName(existing.provider)) {
    return NextResponse.json({ errorFa: "پروایدر مقصد نامعتبر است." }, { status: 400 });
  }

  // If rotating the token, we must re-verify with the new credentials before
  // persisting them.
  let newTokenEnc: string | null = null;
  if (patch.botToken) {
    const prov = getDestinationProvider(existing.provider);
    const verify = await prov.verifyCredentials({
      botToken: patch.botToken,
      chatId: patch.chatId ?? existing.chatId,
    });
    if (!verify.ok) {
      await audit({
        userId: user.id,
        actor: "user",
        action: "destination_token_rotate_verify_failed",
        targetType: "destination",
        targetId: id,
        ip,
        meta: { errorFa: verify.errorFa },
      });
      return NextResponse.json(
        { errorFa: verify.errorFa ?? "اعتبارسنجی توکن جدید ناموفق بود." },
        { status: 401 },
      );
    }
    newTokenEnc = encryptString(patch.botToken);
  }

  const updated = await db.destination.update({
    where: { id },
    data: {
      ...(patch.label !== undefined ? { label: patch.label.slice(0, 120) } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.chatId !== undefined ? { chatId: patch.chatId } : {}),
      ...(patch.config !== undefined ? { config: JSON.stringify(patch.config) } : {}),
      ...(newTokenEnc ? { botTokenEnc: newTokenEnc, lastCheckedAt: new Date(), lastError: null } : {}),
    },
  });
  await audit({
    userId: user.id,
    actor: "user",
    action: "destination_update",
    targetType: "destination",
    targetId: id,
    ip,
    meta: {
      labelChanged: patch.label !== undefined,
      statusChanged: patch.status !== undefined,
      chatIdChanged: patch.chatId !== undefined,
      tokenRotated: patch.botToken !== undefined,
    },
  });
  return NextResponse.json({ ok: true, destination: toDestinationView(updated) });
}

export async function DELETE(req: Request, { params }: Params) {
  let user;
  try { user = await requireUser(); } catch (e) {
    return NextResponse.json({ errorFa: (e as AuthError).message }, { status: (e as AuthError).status });
  }
  const ip = clientIp(req);
  const { id } = await params;
  const existing = await db.destination.findUnique({ where: { id } });
  if (!existing || existing.ownerId !== user.id) {
    return NextResponse.json({ errorFa: "مقصد یافت نشد." }, { status: 404 });
  }
  // Soft delete: keep the row for audit history; mark as deleted so it
  // disappears from the user's list. Pending jobs continue referencing the
  // row but the worker will detect status=deleted and refuse to publish.
  await db.destination.update({ where: { id }, data: { status: "deleted" } });
  await audit({
    userId: user.id,
    actor: "user",
    action: "destination_delete",
    targetType: "destination",
    targetId: id,
    ip,
  });
  return NextResponse.json({ ok: true });
}
