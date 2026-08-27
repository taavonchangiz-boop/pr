// POSTYAR — /api/ads/[id]
//   GET    — single ad (ownership)
//   PATCH  — update fields (owner)
//   POST   — submit for review (owner)
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, clientIp, audit, AuthError } from "@/lib/server/auth";
import { getAd, submitAdForReview } from "@/lib/payments/advertising";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  let user;
  try { user = await requireUser(); } catch (e) {
    return NextResponse.json({ errorFa: (e as AuthError).message }, { status: (e as AuthError).status });
  }
  const { id } = await params;
  try {
    const ad = await getAd(id, user.id);
    return NextResponse.json({ ad });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ errorFa: e.message }, { status: e.status });
    }
    return NextResponse.json({ errorFa: "خطای داخلی." }, { status: 500 });
  }
}

const PatchSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  descriptionFa: z.string().max(1000).optional(),
  link: z.string().max(500).optional(),
  placement: z.string().max(40).optional(),
  startAt: z.string().optional(),
  endAt: z.string().optional(),
  imageBase64: z.string().optional(),
});

export async function PATCH(req: Request, { params }: Params) {
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
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { errorFa: parsed.error.issues[0]?.message ?? "ورودی نامعتبر است." },
      { status: 400 },
    );
  }
  const ad = await db.adCampaign.findUnique({ where: { id } });
  if (!ad) return NextResponse.json({ errorFa: "تبلیغ یافت نشد." }, { status: 404 });
  if (ad.ownerId !== user.id) return NextResponse.json({ errorFa: "دسترسی غیرمجاز." }, { status: 403 });
  if (ad.status !== "pending" && ad.status !== "rejected") {
    return NextResponse.json({ errorFa: "ویرایش فقط در حالت پیش‌نویس ممکن است." }, { status: 400 });
  }
  // Build update data
  const data: Record<string, unknown> = {};
  if (parsed.data.title) data.title = parsed.data.title.slice(0, 200);
  if (parsed.data.descriptionFa !== undefined) data.descriptionFa = parsed.data.descriptionFa.slice(0, 1000);
  if (parsed.data.link !== undefined) data.link = parsed.data.link.slice(0, 500);
  if (parsed.data.placement) data.placement = parsed.data.placement.slice(0, 40);
  if (parsed.data.startAt !== undefined) data.startAt = parsed.data.startAt ? new Date(parsed.data.startAt) : null;
  if (parsed.data.endAt !== undefined) data.endAt = parsed.data.endAt ? new Date(parsed.data.endAt) : null;
  // Image update handled separately by re-upload flow — skip for now
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ errorFa: "هیچ فیلدی برای به‌روزرسانی ارسال نشده است." }, { status: 400 });
  }
  const updated = await db.adCampaign.update({ where: { id }, data });
  await audit({
    userId: user.id,
    actor: "user",
    action: "ad_updated",
    targetType: "ad",
    targetId: id,
    ip,
    meta: { fields: Object.keys(data) },
  });
  return NextResponse.json({ ok: true, ad: updated });
}

export async function POST(req: Request, { params }: Params) {
  let user;
  try { user = await requireUser(); } catch (e) {
    return NextResponse.json({ errorFa: (e as AuthError).message }, { status: (e as AuthError).status });
  }
  const ip = clientIp(req);
  const { id } = await params;
  try {
    const ad = await submitAdForReview({ id, userId: user.id, ip });
    return NextResponse.json({ ok: true, ad });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ errorFa: e.message }, { status: e.status });
    }
    return NextResponse.json({ errorFa: "خطای داخلی." }, { status: 500 });
  }
}
