// POSTYAR — POST /api/stats/track
// Lightweight analytics event: increments a view/click counter on a content
// post, destination (channel), or glass button. Authenticated to prevent abuse.
// Body: { type: "view" | "click", targetType: "content" | "destination" | "button", targetId: string }
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, AuthError } from "@/lib/server/auth";

const Schema = z.object({
  type: z.enum(["view", "click"]),
  targetType: z.enum(["content", "destination", "button"]),
  targetId: z.string().min(1),
});

export async function POST(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    return NextResponse.json({ errorFa: (e as AuthError).message }, { status: (e as AuthError).status });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ errorFa: "بدنه درخواست نامعتبر است." }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ errorFa: parsed.error.issues[0]?.message ?? "ورودی نامعتبر است." }, { status: 400 });
  }
  const { type, targetType, targetId } = parsed.data;

  try {
    if (targetType === "content") {
      // Only the owner may bump their own content stat (no cross-user inflation).
      const c = await db.content.findUnique({ where: { id: targetId }, select: { ownerId: true } });
      if (!c || c.ownerId !== user.id) return NextResponse.json({ ok: false }, { status: 404 });
      if (type === "view") {
        await db.content.update({ where: { id: targetId }, data: { views: { increment: 1 } } });
      }
      return NextResponse.json({ ok: true });
    }
    if (targetType === "destination") {
      const d = await db.destination.findUnique({ where: { id: targetId }, select: { ownerId: true } });
      if (!d || d.ownerId !== user.id) return NextResponse.json({ ok: false }, { status: 404 });
      if (type === "view") {
        await db.destination.update({ where: { id: targetId }, data: { views: { increment: 1 } } });
      } else {
        await db.destination.update({ where: { id: targetId }, data: { clicks: { increment: 1 } } });
      }
      return NextResponse.json({ ok: true });
    }
    // button
    const b = await db.glassButton.findUnique({ where: { id: targetId }, include: { destination: { select: { ownerId: true } } } });
    if (!b || b.destination.ownerId !== user.id) return NextResponse.json({ ok: false }, { status: 404 });
    if (type === "click") {
      await db.glassButton.update({ where: { id: targetId }, data: { clicks: { increment: 1 } } });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
