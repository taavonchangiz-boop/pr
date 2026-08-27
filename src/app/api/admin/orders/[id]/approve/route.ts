// POSTYAR — POST /api/admin/orders/[id]/approve (admin only)
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, clientIp, AuthError } from "@/lib/server/auth";
import { adminApproveCardOrder } from "@/lib/payments/card";

type Params = { params: Promise<{ id: string }> };

const BodySchema = z.object({
  notes: z.string().max(500).optional(),
});

export async function POST(req: Request, { params }: Params) {
  let user;
  try { user = await requireRole(["admin"]); } catch (e) {
    return NextResponse.json({ errorFa: (e as AuthError).message }, { status: (e as AuthError).status });
  }
  const ip = clientIp(req);
  const { id } = await params;

  let body: unknown = {};
  try { body = await req.json(); } catch { /* allow empty */ }
  const parsed = BodySchema.safeParse(body);

  try {
    const r = await adminApproveCardOrder({
      orderId: id,
      adminId: user.id,
      ip,
      notes: parsed.success ? parsed.data.notes : undefined,
    });
    return NextResponse.json({ ...r, ok: r.ok });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ errorFa: e.message }, { status: e.status });
    }
    const msg = e instanceof Error ? e.message : "خطای داخلی.";
    return NextResponse.json({ errorFa: msg }, { status: 500 });
  }
}
