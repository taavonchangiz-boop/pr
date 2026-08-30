// POSTYAR — /api/admin/tickets (GET all tickets, PATCH assign)
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, clientIp, AuthError } from "@/lib/server/auth";
import { listAllTicketsForAdmin, assignTicket } from "@/lib/tickets";

export async function GET(req: Request) {
  let user;
  try { user = await requireRole(["admin", "support"]); } catch (e) {
    return NextResponse.json({ errorFa: (e as AuthError).message }, { status: (e as AuthError).status });
  }
  void user;
  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit") ?? "50");
  const offset = Number(url.searchParams.get("offset") ?? "0");
  const status = url.searchParams.get("status") ?? undefined;
  const assignedToId = url.searchParams.get("assignedToId") ?? undefined;
  const departmentId = url.searchParams.get("departmentId") ?? undefined;
  const r = await listAllTicketsForAdmin({
    limit: Number.isFinite(limit) ? limit : 50,
    offset: Number.isFinite(offset) ? offset : 0,
    status: status ?? undefined,
    assignedToId: assignedToId === "null" ? null : assignedToId ?? undefined,
    departmentId: departmentId === "null" ? null : departmentId ?? undefined,
  });
  return NextResponse.json(r);
}

const PatchSchema = z.object({
  id: z.string().min(1),
  supportUserId: z.string().min(1),
});

export async function PATCH(req: Request) {
  let user;
  try { user = await requireRole(["admin"]); } catch (e) {
    return NextResponse.json({ errorFa: (e as AuthError).message }, { status: (e as AuthError).status });
  }
  const ip = clientIp(req);
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
  const r = await assignTicket({
    ticketId: parsed.data.id,
    supportUserId: parsed.data.supportUserId,
    adminId: user.id,
    ip,
  });
  if (!r.ok) {
    return NextResponse.json({ errorFa: r.errorFa }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
