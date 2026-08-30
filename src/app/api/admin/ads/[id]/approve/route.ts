// POSTYAR — POST /api/admin/ads/[id]/approve (admin only)
// Body (optional): { placement?: string } — assigns the campaign to a new
// placement AT THE SAME TIME as approving. The placement must exist as an
// AdPlacement.key (FK). If the placement doesn't exist we return 400 with
// a Persian error and DO NOT approve.
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole, clientIp, AuthError } from "@/lib/server/auth";
import { adminApproveAd } from "@/lib/payments/advertising";

type Params = { params: Promise<{ id: string }> };

const BodySchema = z.object({
  placement: z.string()
    .min(2, "کلید جایگاه حداقل ۲ نویسه باشد.")
    .max(60, "کلید جایگاه حداکثر ۶۰ نویسه باشد.")
    .regex(/^[a-z0-9_]+$/, "کلید جایگاه نامعتبر است.")
    .optional(),
});

export async function POST(req: Request, { params }: Params) {
  let user;
  try { user = await requireRole(["admin"]); } catch (e) {
    return NextResponse.json({ errorFa: (e as AuthError).message }, { status: (e as AuthError).status });
  }
  const ip = clientIp(req);
  const { id } = await params;

  // Parse optional body (allow empty).
  let body: unknown = {};
  try { body = await req.json(); } catch { /* allow empty body */ }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { errorFa: parsed.error.issues[0]?.message ?? "ورودی نامعتبر است." },
      { status: 400 },
    );
  }

  // If a placement is provided, verify it exists BEFORE approving so we
  // never leave the row in an inconsistent state.
  if (parsed.data.placement) {
    const slot = await db.adPlacement.findUnique({ where: { key: parsed.data.placement } });
    if (!slot) {
      return NextResponse.json({ errorFa: "جایگاه انتخاب‌شده یافت نشد." }, { status: 400 });
    }
  }

  try {
    const ad = await adminApproveAd({ id, adminId: user.id, ip });
    // Apply the placement assignment AFTER approval so the row is already
    // approved (and the audit trail for approval is intact). This is a tiny
    // extra update; the lib approve already wrote status+reviewedAt.
    if (parsed.data.placement && parsed.data.placement !== ad.placement) {
      const updated = await db.adCampaign.update({
        where: { id },
        data: { placement: parsed.data.placement },
      });
      return NextResponse.json({ ok: true, ad: { ...ad, placement: updated.placement } });
    }
    return NextResponse.json({ ok: true, ad });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ errorFa: e.message }, { status: e.status });
    }
    return NextResponse.json({ errorFa: "خطای داخلی." }, { status: 500 });
  }
}
