// POSTYAR — /api/admin/audit (GET list with filters)
import { NextResponse } from "next/server";
import { requireRole, AuthError } from "@/lib/server/auth";
import { db } from "@/lib/db";
import { formatJalaliDateTime } from "@/lib/persian";

export async function GET(req: Request) {
  let user;
  try { user = await requireRole(["admin"]); } catch (e) {
    return NextResponse.json({ errorFa: (e as AuthError).message }, { status: (e as AuthError).status });
  }
  void user;
  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? undefined;
  const actor = url.searchParams.get("actor") ?? undefined;
  const targetType = url.searchParams.get("targetType") ?? undefined;
  const limit = Number(url.searchParams.get("limit") ?? "100");
  const offset = Number(url.searchParams.get("offset") ?? "0");
  const where: Record<string, unknown> = {};
  if (action) where.action = action;
  if (actor) where.actor = actor;
  if (targetType) where.targetType = targetType;
  const [rows, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: Number.isFinite(limit) ? Math.min(limit, 500) : 100,
      skip: Number.isFinite(offset) ? offset : 0,
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
    }),
    db.auditLog.count({ where }),
  ]);
  return NextResponse.json({
    items: rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      actor: r.actor,
      action: r.action,
      targetType: r.targetType,
      targetId: r.targetId,
      ip: r.ip,
      meta: r.meta,
      createdAt: r.createdAt.toISOString(),
      createdAtFa: formatJalaliDateTime(r.createdAt, { withTime: true }),
      userName: r.user ? `${r.user.firstName ?? ""} ${r.user.lastName ?? ""}`.trim() : null,
      userEmail: r.user?.email ?? null,
    })),
    total,
  });
}
