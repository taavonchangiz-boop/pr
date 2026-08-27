// POSTYAR — /api/content/[id]
// GET    fetch one (ownership enforced)
// PATCH  update title/body/mediaIds/destinationIds; status transitions limited
//        to "draft" -> "cancelled" (cancel a draft). Other status transitions
//        go through /api/publish/schedule.
// DELETE soft delete (status = "cancelled") ; ?hard=1 admin-only hard delete
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, requireRole, clientIp, audit, AuthError, safeJsonParse } from "@/lib/server/auth";
import { rateLimit } from "@/lib/security/cache";
import { isContentStatus, assertTransition } from "@/lib/publishing/state";

const PatchSchema = z.object({
  title: z.string().trim().min(3, "عنوان باید حداقل ۳ نویسه باشد.").max(200).optional(),
  body: z.string().max(20_000).optional(),
  mediaIds: z.array(z.string().min(1).max(64)).max(20).optional(),
  destinationIds: z.array(z.string().min(1).max(64)).max(20).optional(),
  status: z.string().optional(),
});

type Params = { params: Promise<{ id: string }> };

function toContentView(c: {
  id: string;
  title: string;
  body: string;
  status: string;
  mediaIds: string;
  destinationIds: string;
  scheduledAt: Date | null;
  publishedAt: Date | null;
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: c.id,
    title: c.title,
    body: c.body,
    status: c.status,
    mediaIds: safeJsonParse<string[]>(c.mediaIds, []),
    destinationIds: safeJsonParse<string[]>(c.destinationIds, []),
    scheduledAt: c.scheduledAt ? c.scheduledAt.toISOString() : null,
    publishedAt: c.publishedAt ? c.publishedAt.toISOString() : null,
    failureReason: c.failureReason,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

export async function GET(req: Request, { params }: Params) {
  let user;
  try { user = await requireUser(); } catch (e) {
    return NextResponse.json({ errorFa: (e as AuthError).message }, { status: (e as AuthError).status });
  }
  const { id } = await params;
  const c = await db.content.findUnique({ where: { id } });
  if (!c || c.ownerId !== user.id) {
    return NextResponse.json({ errorFa: "محتوا یافت نشد." }, { status: 404 });
  }
  return NextResponse.json({ content: toContentView(c) });
}

export async function PATCH(req: Request, { params }: Params) {
  let user;
  try { user = await requireUser(); } catch (e) {
    return NextResponse.json({ errorFa: (e as AuthError).message }, { status: (e as AuthError).status });
  }
  const ip = clientIp(req);
  const { id } = await params;

  const rl = await rateLimit({ key: `content:patch:${user.id}`, limit: 60, windowMs: 60 * 1000 });
  if (!rl.ok) {
    return NextResponse.json({ errorFa: "تعداد درخواست بیش از حد مجاز است." }, { status: 429 });
  }

  const existing = await db.content.findUnique({ where: { id } });
  if (!existing || existing.ownerId !== user.id) {
    return NextResponse.json({ errorFa: "محتوا یافت نشد." }, { status: 404 });
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

  // If status is changing, validate the transition. Only allow:
  //   draft     -> cancelled
  //   scheduled -> cancelled
  //   queued    -> cancelled
  //   failed    -> cancelled
  // (Other transitions happen via /api/publish/schedule.)
  if (patch.status !== undefined) {
    if (!isContentStatus(patch.status)) {
      return NextResponse.json({ errorFa: "وضعیت نامعتبر است." }, { status: 400 });
    }
    if (patch.status !== "cancelled") {
      return NextResponse.json(
        { errorFa: "تغییر وضعیت به این حالت از این مسیر مجاز نیست." },
        { status: 400 },
      );
    }
    try {
      assertTransition(existing.status as never, patch.status as never);
    } catch {
      return NextResponse.json(
        { errorFa: `انتقال وضعیت از «${existing.status}» به «${patch.status}» مجاز نیست.` },
        { status: 400 },
      );
    }
  }

  // Resolve destination IDs to ones actually owned by the user.
  let validDestIds: string[] | undefined;
  if (patch.destinationIds) {
    const uniq = Array.from(new Set(patch.destinationIds));
    const owned = await db.destination.findMany({
      where: { id: { in: uniq }, ownerId: user.id, status: { not: "deleted" } },
      select: { id: true },
    });
    validDestIds = owned.map((d) => d.id);
  }

  let validMediaIds: string[] | undefined;
  if (patch.mediaIds) {
    const uniq = Array.from(new Set(patch.mediaIds));
    const owned = await db.media.findMany({
      where: { id: { in: uniq }, ownerId: user.id },
      select: { id: true },
    });
    validMediaIds = owned.map((m) => m.id);
  }

  const updated = await db.content.update({
    where: { id },
    data: {
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      ...(validMediaIds !== undefined ? { mediaIds: JSON.stringify(validMediaIds) } : {}),
      ...(validDestIds !== undefined ? { destinationIds: JSON.stringify(validDestIds) } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
    },
  });

  await audit({
    userId: user.id,
    actor: "user",
    action: "content_update",
    targetType: "content",
    targetId: id,
    ip,
    meta: {
      titleChanged: patch.title !== undefined,
      bodyChanged: patch.body !== undefined,
      mediaChanged: validMediaIds !== undefined,
      destinationsChanged: validDestIds !== undefined,
      statusChanged: patch.status !== undefined,
    },
  });

  return NextResponse.json({ ok: true, content: toContentView(updated) });
}

export async function DELETE(req: Request, { params }: Params) {
  let user;
  try { user = await requireUser(); } catch (e) {
    return NextResponse.json({ errorFa: (e as AuthError).message }, { status: (e as AuthError).status });
  }
  const ip = clientIp(req);
  const { id } = await params;

  const url = new URL(req.url);
  const hard = url.searchParams.get("hard") === "1";
  if (hard) {
    try { await requireRole(["admin"]); } catch (e) {
      return NextResponse.json({ errorFa: (e as AuthError).message }, { status: (e as AuthError).status });
    }
  }

  const existing = await db.content.findUnique({ where: { id } });
  if (!existing || existing.ownerId !== user.id) {
    return NextResponse.json({ errorFa: "محتوا یافت نشد." }, { status: 404 });
  }

  if (hard) {
    await db.content.delete({ where: { id } });
    await audit({
      userId: user.id,
      actor: "admin",
      action: "content_delete_hard",
      targetType: "content",
      targetId: id,
      ip,
    });
  } else {
    // Soft-delete: mark as cancelled. Idempotent.
    if (existing.status !== "cancelled") {
      try {
        assertTransition(existing.status as never, "cancelled");
      } catch {
        // Already terminal — leave alone.
      }
      await db.content.update({ where: { id }, data: { status: "cancelled" } });
    }
    await audit({
      userId: user.id,
      actor: "user",
      action: "content_delete_soft",
      targetType: "content",
      targetId: id,
      ip,
    });
  }

  return NextResponse.json({ ok: true });
}
