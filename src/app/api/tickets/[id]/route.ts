// POSTYAR — /api/tickets/[id]
// GET single, POST reply (body field `body` + `isStaff` from role)
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, clientIp, AuthError } from "@/lib/server/auth";
import { getTicket, replyTicket, closeTicket } from "@/lib/tickets";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let user;
  try { user = await requireUser(); } catch (e) {
    return NextResponse.json({ errorFa: (e as AuthError).message }, { status: (e as AuthError).status });
  }
  const { id } = await params;
  const isStaff = user.role === "admin" || user.role === "support";
  const r = await getTicket(id, user.id, isStaff);
  if (!r.ok) {
    return NextResponse.json({ errorFa: r.errorFa }, { status: 400 });
  }
  return NextResponse.json(r);
}

const ReplySchema = z.object({
  body: z.string().min(2, "متن پاسخ حداقل ۲ نویسه باشد.").max(8000),
  close: z.boolean().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let user;
  try { user = await requireUser(); } catch (e) {
    return NextResponse.json({ errorFa: (e as AuthError).message }, { status: (e as AuthError).status });
  }
  const ip = clientIp(req);
  const { id } = await params;
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ errorFa: "بدنه درخواست نامعتبر است." }, { status: 400 });
  }
  const parsed = ReplySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { errorFa: parsed.error.issues[0]?.message ?? "ورودی نامعتبر است." },
      { status: 400 },
    );
  }
  const isStaff = user.role === "admin" || user.role === "support";
  const r = await replyTicket({
    ticketId: id,
    userId: user.id,
    body: parsed.data.body,
    isStaff,
    ip,
  });
  if (!r.ok || !r.reply) {
    return NextResponse.json({ errorFa: r.errorFa }, { status: 400 });
  }
  if (parsed.data.close) {
    await closeTicket({ ticketId: id, userId: user.id, isStaff, ip });
  }
  return NextResponse.json({ ok: true, reply: r.reply }, { status: 201 });
}
