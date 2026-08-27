// POSTYAR — /api/admin/plans (GET, POST create plan — admin)
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, clientIp, audit, AuthError } from "@/lib/server/auth";
import { db } from "@/lib/db";
import { formatRials, formatJalaliDate } from "@/lib/persian";

export async function GET() {
  let user;
  try { user = await requireRole(["admin"]); } catch (e) {
    return NextResponse.json({ errorFa: (e as AuthError).message }, { status: (e as AuthError).status });
  }
  void user;
  const rows = await db.plan.findMany({
    orderBy: { priceRials: "asc" },
    include: { _count: { select: { subscriptions: true } } },
  });
  return NextResponse.json({
    items: rows.map((p) => ({
      id: p.id,
      code: p.code,
      nameFa: p.nameFa,
      descriptionFa: p.descriptionFa,
      priceRials: p.priceRials,
      priceRialsFa: formatRials(p.priceRials),
      intervalMonths: p.intervalMonths,
      quota: JSON.parse(p.quota || "{}"),
      active: p.active,
      isPublic: p.isPublic,
      subscriptionCount: p._count.subscriptions,
      createdAt: p.createdAt.toISOString(),
      createdAtFa: formatJalaliDate(p.createdAt),
    })),
  });
}

const PostSchema = z.object({
  code: z.string().min(2).max(40),
  nameFa: z.string().min(2).max(80),
  descriptionFa: z.string().max(800).optional(),
  priceRials: z.number().int().nonnegative(),
  intervalMonths: z.number().int().min(1).max(12),
  quota: z.record(z.string(), z.number()).optional(),
  active: z.boolean().optional(),
  isPublic: z.boolean().optional(),
});

export async function POST(req: Request) {
  let user;
  try { user = await requireRole(["admin"]); } catch (e) {
    return NextResponse.json({ errorFa: (e as AuthError).message }, { status: (e as AuthError).status });
  }
  const ip = clientIp(req);
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ errorFa: "بدنه درخواست نامعتبر است." }, { status: 400 });
  }
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { errorFa: parsed.error.issues[0]?.message ?? "ورودی نامعتبر است." },
      { status: 400 },
    );
  }
  const dup = await db.plan.findUnique({ where: { code: parsed.data.code } });
  if (dup) {
    return NextResponse.json({ errorFa: "این کد طرح قبلاً ثبت شده است." }, { status: 409 });
  }
  const created = await db.plan.create({
    data: {
      code: parsed.data.code,
      nameFa: parsed.data.nameFa,
      descriptionFa: parsed.data.descriptionFa ?? "",
      priceRials: parsed.data.priceRials,
      intervalMonths: parsed.data.intervalMonths,
      quota: JSON.stringify(parsed.data.quota ?? {}),
      active: parsed.data.active ?? true,
      isPublic: parsed.data.isPublic ?? true,
    },
  });
  await audit({
    userId: user.id,
    actor: "admin",
    action: "plan_created",
    targetType: "plan",
    targetId: created.id,
    ip,
    meta: { code: parsed.data.code, priceRials: parsed.data.priceRials },
  });
  return NextResponse.json({ ok: true, planId: created.id }, { status: 201 });
}
