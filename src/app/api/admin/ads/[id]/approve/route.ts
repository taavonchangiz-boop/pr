// POSTYAR — POST /api/admin/ads/[id]/approve (admin only)
import { NextResponse } from "next/server";
import { requireRole, clientIp, AuthError } from "@/lib/server/auth";
import { adminApproveAd } from "@/lib/payments/advertising";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  let user;
  try { user = await requireRole(["admin"]); } catch (e) {
    return NextResponse.json({ errorFa: (e as AuthError).message }, { status: (e as AuthError).status });
  }
  const ip = clientIp(req);
  const { id } = await params;
  try {
    const ad = await adminApproveAd({ id, adminId: user.id, ip });
    return NextResponse.json({ ok: true, ad });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ errorFa: e.message }, { status: e.status });
    }
    return NextResponse.json({ errorFa: "خطای داخلی." }, { status: 500 });
  }
}
