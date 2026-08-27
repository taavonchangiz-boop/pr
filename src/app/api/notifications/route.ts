// POSTYAR — /api/notifications
// GET list (mine), POST markRead body { notificationId }
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/server/auth";
import { listAll, markRead, markAllRead } from "@/lib/notifications";

const MarkSchema = z.object({ notificationId: z.string().min(1) });
const MarkAllSchema = z.object({ all: z.boolean().optional() });

export async function GET(req: Request) {
  let user;
  try { user = await requireUser(); } catch (e) {
    return NextResponse.json({ errorFa: (e as AuthError).message }, { status: (e as AuthError).status });
  }
  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit") ?? "50");
  const offset = Number(url.searchParams.get("offset") ?? "0");
  const category = url.searchParams.get("category") ?? undefined;
  const unreadOnly = url.searchParams.get("unreadOnly") === "1";
  const r = await listAll(user.id, {
    limit: Number.isFinite(limit) ? limit : 50,
    offset: Number.isFinite(offset) ? offset : 0,
    category: category ?? undefined,
    unreadOnly,
  });
  return NextResponse.json(r);
}

export async function POST(req: Request) {
  let user;
  try { user = await requireUser(); } catch (e) {
    return NextResponse.json({ errorFa: (e as AuthError).message }, { status: (e as AuthError).status });
  }
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ errorFa: "بدنه درخواست نامعتبر است." }, { status: 400 });
  }
  // Allow either { all: true } OR { notificationId }
  const parsed = (body as { all?: boolean })?.all === true
    ? MarkAllSchema.safeParse(body)
    : MarkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { errorFa: parsed.error.issues[0]?.message ?? "ورودی نامعتبر است." },
      { status: 400 },
    );
  }
  if ("all" in parsed.data && parsed.data.all) {
    const r = await markAllRead(user.id);
    return NextResponse.json({ ok: true, updated: r.updated });
  }
  const r = await markRead((parsed.data as { notificationId: string }).notificationId, user.id);
  if (!r.ok) {
    return NextResponse.json({ errorFa: r.errorFa }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
