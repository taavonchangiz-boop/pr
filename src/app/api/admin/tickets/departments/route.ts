// =====================================================================
// POSTYAR — /api/admin/tickets/departments
// ---------------------------------------------------------------------
// GET  — list all ticket departments (sorted by priority asc, name asc).
// POST — create a new department { nameFa, descriptionFa?, priority?, active? }.
//
// Authorization: requireRole(["admin"]). (Support can read-only via a
// separate call if needed; the UI here gates both on admin.)
// =====================================================================
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, clientIp, AuthError } from "@/lib/server/auth";
import {
  listDepartments,
  createDepartment,
} from "@/lib/tickets";

export async function GET() {
  let user;
  try {
    user = await requireRole(["admin", "support"]);
  } catch (e) {
    return NextResponse.json(
      { errorFa: (e as AuthError).message },
      { status: (e as AuthError).status },
    );
  }
  void user;
  const r = await listDepartments();
  return NextResponse.json(r);
}

const CreateSchema = z.object({
  nameFa: z.string().min(1, "نام دپارتمان لازم است.").max(60),
  descriptionFa: z.string().max(500).optional(),
  priority: z.number().int().min(0).max(10000).optional(),
  active: z.boolean().optional(),
});

export async function POST(req: Request) {
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
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { errorFa: "بدنه درخواست نامعتبر است." },
      { status: 400 },
    );
  }
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { errorFa: parsed.error.issues[0]?.message ?? "ورودی نامعتبر است." },
      { status: 400 },
    );
  }
  const r = await createDepartment({
    nameFa: parsed.data.nameFa,
    descriptionFa: parsed.data.descriptionFa ?? "",
    priority: parsed.data.priority,
    active: parsed.data.active,
  });
  if (!r.ok || !r.department) {
    return NextResponse.json(
      { errorFa: r.errorFa ?? "ایجاد دپارتمان ناموفق بود." },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true, department: r.department }, { status: 201 });
}
