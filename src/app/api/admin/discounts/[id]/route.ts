// POSTYAR — /api/admin/discounts/[id] — PATCH update / DELETE (admin only)
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole, clientIp, audit, AuthError } from "@/lib/server/auth";

type Params = { params: Promise<{ id: string }> };

const PatchSchema = z.object({
  kind: z.enum(["percent", "fixed"]).optional(),
  value: z.number().int().nonnegative().optional(),
  maxUses: z.number().int().nonnegative().optional(),
  perUserLimit: z.number().int().positive().optional(),
  expiresAt: z.string().nullable().optional(),
  active: z.boolean().optional(),
  planIds: z.array(z.string()).optional(),
});

export async function PATCH(req: Request, { params }: Params) {
  let user;
  try { user = await requireRole(["admin"]); } catch (e) {
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
  const existing = await db.discount.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ errorFa: "تخفیف یافت نشد." }, { status: 404 });

  // Plan list update — replace
  if (parsed.data.planIds) {
    await db.discountPlan.deleteMany({ where: { discountId: id } });
    if (parsed.data.planIds.length > 0) {
      await db.discountPlan.createMany({
        data: parsed.data.planIds.map((planId) => ({ discountId: id, planId })),
      });
    }
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.kind) data.kind = parsed.data.kind;
  if (parsed.data.value !== undefined) data.value = parsed.data.value;
  if (parsed.data.maxUses !== undefined) data.maxUses = parsed.data.maxUses;
  if (parsed.data.perUserLimit !== undefined) data.perUserLimit = parsed.data.perUserLimit;
  if (parsed.data.expiresAt !== undefined) {
    data.expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null;
  }
  if (parsed.data.active !== undefined) data.active = parsed.data.active;
  const updated = await db.discount.update({ where: { id }, data });
  await audit({
    userId: user.id,
    actor: "admin",
    action: "discount_updated",
    targetType: "discount",
    targetId: id,
    ip,
    meta: { fields: Object.keys(data), planIds: parsed.data.planIds },
  });
  return NextResponse.json({ ok: true, discount: updated });
}

export async function DELETE(req: Request, { params }: Params) {
  let user;
  try { user = await requireRole(["admin"]); } catch (e) {
    return NextResponse.json({ errorFa: (e as AuthError).message }, { status: (e as AuthError).status });
  }
  const ip = clientIp(req);
  const { id } = await params;
  await db.discount.delete({ where: { id } }).catch(() => null);
  await audit({
    userId: user.id,
    actor: "admin",
    action: "discount_deleted",
    targetType: "discount",
    targetId: id,
    ip,
  });
  return NextResponse.json({ ok: true });
}
