// POSTYAR — POST /api/admin/ads/[id]/reject (admin only)
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, clientIp, AuthError } from "@/lib/server/auth";
import { adminRejectAd } from "@/lib/payments/advertising";

type Params = { params: Promise<{ id: string }> };

const BodySchema = z.object({
  reason: z.string().max(500).optional(),
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
    const ad = await adminRejectAd({
      id,
      adminId: user.id,
      reason: parsed.success ? parsed.data.reason : undefined,
      ip,
    });
    return NextResponse.json({ ok: true, ad });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ errorFa: e.message }, { status: e.status });
    }
    return NextResponse.json({ errorFa: "خطای داخلی." }, { status: 500 });
  }
}
