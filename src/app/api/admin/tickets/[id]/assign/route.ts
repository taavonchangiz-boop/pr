// =====================================================================
// POSTYAR — /api/admin/tickets/[id]/assign
// ---------------------------------------------------------------------
// POST — assign the ticket to a department and/or a support-staff user
//        and/or set the ticket priority, in a single call.
//
// Body: { departmentId?: string|null, assignedToId?: string|null, priority?:
//        "low"|"normal"|"high"|"urgent" }
//
// Authorization: requireRole(["admin"]).
// =====================================================================
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, clientIp, AuthError } from "@/lib/server/auth";
import { assignTicketFields, type TicketPriority } from "@/lib/tickets";

const AssignSchema = z
  .object({
    departmentId: z.string().nullable().optional(),
    assignedToId: z.string().nullable().optional(),
    priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  })
  .refine(
    (v) =>
      v.departmentId !== undefined ||
      v.assignedToId !== undefined ||
      v.priority !== undefined,
    { message: "حداقل یکی از فیلدهای departmentId / assignedToId / priority لازم است." },
  );

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let user;
  try {
    user = await requireRole(["admin"]);
  } catch (e) {
    return NextResponse.json(
      { errorFa: (e as AuthError).message },
      { status: (e as AuthError).status },
    );
  }
  const ip = clientIp(req);
  const { id: ticketId } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { errorFa: "بدنه درخواست نامعتبر است." },
      { status: 400 },
    );
  }
  const parsed = AssignSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json(
      { errorFa: first?.message ?? "ورودی نامعتبر است." },
      { status: 400 },
    );
  }
  const r = await assignTicketFields({
    ticketId,
    adminId: user.id,
    departmentId: parsed.data.departmentId,
    assignedToId: parsed.data.assignedToId,
    priority: parsed.data.priority as TicketPriority | undefined,
    ip,
  });
  if (!r.ok) {
    return NextResponse.json(
      { errorFa: r.errorFa ?? "انتساب ناموفق بود." },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true });
}
