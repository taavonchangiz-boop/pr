// POSTYAR — /api/admin/bots (GET all bots across users)
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
  const rows = await db.bot.findMany({
    orderBy: { createdAt: "desc" },
    include: { owner: { select: { id: true, firstName: true, lastName: true, email: true, businessName: true } } },
    take: 500,
  });
  return NextResponse.json({
    items: rows.map((b) => ({
      id: b.id,
      ownerId: b.ownerId,
      ownerName: b.owner ? `${b.owner.firstName ?? ""} ${b.owner.lastName ?? ""}`.trim() : null,
      ownerEmail: b.owner?.email ?? null,
      provider: b.provider,
      name: b.name,
      username: b.username ?? null,
      status: b.status,
      lastError: b.lastError ?? null,
      destinationId: b.destinationId,
      createdAt: b.createdAt.toISOString(),
      createdAtFa: formatJalaliDateTime(b.createdAt, { withTime: true }),
      updatedAt: b.updatedAt.toISOString(),
    })),
  });
}
