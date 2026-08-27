// POSTYAR — /api/admin/gold (GET all gold bots, admin-only)
import { NextResponse } from "next/server";
import { requireRole, AuthError } from "@/lib/server/auth";
import { db } from "@/lib/db";
import { formatJalaliDateTime } from "@/lib/persian";

export async function GET() {
  let user;
  try { user = await requireRole(["admin"]); } catch (e) {
    return NextResponse.json({ errorFa: (e as AuthError).message }, { status: (e as AuthError).status });
  }
  void user;
  const rows = await db.goldBot.findMany({
    orderBy: { createdAt: "desc" },
    include: { user: { select: { id: true, firstName: true, lastName: true, email: true, businessName: true } } },
  });
  return NextResponse.json({
    items: rows.map((b) => ({
      id: b.id,
      userId: b.userId,
      ownerName: b.user ? `${b.user.firstName ?? ""} ${b.user.lastName ?? ""}`.trim() : null,
      ownerEmail: b.user?.email ?? null,
      enabled: b.enabled,
      instrument: b.instrument,
      direction: b.direction,
      thresholdPct: b.thresholdPct,
      intervalMin: b.intervalMin,
      destinationId: b.destinationId,
      lastFiredAt: b.lastFiredAt?.toISOString() ?? null,
      lastFiredAtFa: b.lastFiredAt ? formatJalaliDateTime(b.lastFiredAt, { withTime: true }) : null,
      createdAt: b.createdAt.toISOString(),
      updatedAt: b.updatedAt.toISOString(),
    })),
  });
}
