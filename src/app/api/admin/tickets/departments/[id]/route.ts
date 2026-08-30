// =====================================================================
// POSTYAR — /api/admin/tickets/departments/[id]
// ---------------------------------------------------------------------
// PATCH  — partial update { nameFa?, descriptionFa?, priority?, active? }.
// DELETE — remove the department. Schema onDelete: SetNull will nullify
//          all tickets.departmentId rows.
//
// Authorization: requireRole(["admin"]).
// =====================================================================
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, clientIp, AuthError } from "@/lib/server/auth";
import { updateDepartment, deleteDepartment } from "@/lib/tickets";

const PatchSchema = z.object({
  nameFa: z.string().min(1, "نام دپارتمان لازم است.").max(60).optional(),
  descriptionFa: z.string().max(500).optional(),
  priority: z.number().int().min(0).max(10000).optional(),
  active: z.boolean().optional(),
});

export async function PATCH(
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
  void ip;
  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { errorFa: "بدنه درخواست نامعتبر است." },
      { status: 400 },
    );
  }
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { errorFa: parsed.error.issues[0]?.message ?? "ورودی نامعتبر است." },
      { status: 400 },
    );
  }
  const r = await updateDepartment({
    id,
    nameFa: parsed.data.nameFa,
    descriptionFa: parsed.data.descriptionFa,
    priority: parsed.data.priority,
    active: parsed.data.active,
  });
  if (!r.ok) {
    return NextResponse.json(
      { errorFa: r.errorFa ?? "به‌روزرسانی دپارتمان ناموفق بود." },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(
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
  void ip;
  const { id } = await params;
  const r = await deleteDepartment(id);
  if (!r.ok) {
    return NextResponse.json(
      { errorFa: r.errorFa ?? "حذف دپارتمان ناموفق بود." },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true });
}
