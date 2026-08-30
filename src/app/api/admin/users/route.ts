// POSTYAR — /api/admin/users (GET list users with filters)
import { NextResponse } from "next/server";
import { requireRole, AuthError } from "@/lib/server/auth";
import { db } from "@/lib/db";
import { formatJalaliDateTime, maskMobile, maskToken } from "@/lib/persian";

// ---------------------------------------------------------------------
// SUPER-ADMIN column was added to the User model in this iteration. We
// read & write it via raw SQL ($queryRaw / $executeRaw) so the route
// works even while a long-lived Next.js dev server still has the
// pre-migration @prisma/client singleton in its require cache. The
// typed Prisma client API gains `isSuperAdmin` automatically on the
// next server restart — these helpers remain a safe, schema-aware
// fallback forever.
// ---------------------------------------------------------------------

interface SuperAdminRow {
  id: string;
  isSuperAdmin: number;
}

async function readSuperAdminFlags(ids: string[]): Promise<Map<string, boolean>> {
  const out = new Map<string, boolean>();
  if (ids.length === 0) return out;
  const rows = await db.$queryRawUnsafe<SuperAdminRow[]>(
    `SELECT id, isSuperAdmin FROM User WHERE id IN (${ids.map(() => "?").join(",")})`,
    ...ids,
  );
  for (const r of rows) out.set(r.id, !!r.isSuperAdmin);
  return out;
}

/**
 * One-shot backfill: ensure there is exactly one super-admin in the system.
 * The bootstrap admin (the earliest-created admin) is the only user that
 * should have `isSuperAdmin === true`. If no super-admin exists yet (e.g.
 * the dev DB predates the column), promote the earliest admin. This runs
 * lazily on the first admin-only GET and is a no-op afterwards.
 */
async function ensureSuperAdminBackfill(): Promise<void> {
  const existing = await db.$queryRawUnsafe<SuperAdminRow[]>(
    `SELECT id FROM User WHERE isSuperAdmin = 1 LIMIT 1`,
  );
  if (existing.length > 0) return;
  const earliestAdmin = await db.user.findFirst({
    where: { role: "admin" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!earliestAdmin) return;
  await db.$executeRawUnsafe(
    `UPDATE User SET isSuperAdmin = 1 WHERE id = ?`,
    earliestAdmin.id,
  );
}

export async function GET(req: Request) {
  let user;
  try { user = await requireRole(["admin"]); } catch (e) {
    return NextResponse.json({ errorFa: (e as AuthError).message }, { status: (e as AuthError).status });
  }
  void user;
  await ensureSuperAdminBackfill();
  const url = new URL(req.url);
  const search = url.searchParams.get("search") ?? "";
  const status = url.searchParams.get("status") ?? undefined;
  const role = url.searchParams.get("role") ?? undefined;
  const limit = Number(url.searchParams.get("limit") ?? "50");
  const offset = Number(url.searchParams.get("offset") ?? "0");

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (role) where.role = role;
  if (search) {
    where.OR = [
      { email: { contains: search } },
      { mobile: { contains: search } },
      { firstName: { contains: search } },
      { lastName: { contains: search } },
      { businessName: { contains: search } },
      { referralCode: { contains: search } },
    ];
  }

  const [rows, total] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: Number.isFinite(limit) ? Math.min(limit, 200) : 50,
      skip: Number.isFinite(offset) ? offset : 0,
      select: {
        id: true,
        email: true,
        mobile: true,
        firstName: true,
        lastName: true,
        businessName: true,
        activityType: true,
        role: true,
        status: true,
        referralCode: true,
        referredById: true,
        createdAt: true,
      },
    }),
    db.user.count({ where }),
  ]);

  // Merge the isSuperAdmin flag from raw SQL — bypasses the cached Prisma
  // client that may predate the isSuperAdmin column.
  const saMap = await readSuperAdminFlags(rows.map((u) => u.id));

  return NextResponse.json({
    items: rows.map((u) => ({
      id: u.id,
      email: u.email,
      mobileMasked: maskMobile(u.mobile),
      firstName: u.firstName,
      lastName: u.lastName,
      businessName: u.businessName,
      activityType: u.activityType,
      role: u.role,
      status: u.status,
      referralCode: u.referralCode,
      referredById: u.referredById ?? null,
      createdAt: u.createdAt.toISOString(),
      createdAtFa: formatJalaliDateTime(u.createdAt, { withTime: true }),
      isSuperAdmin: saMap.get(u.id) ?? false,
    })),
    total,
  });
}

void maskToken; // silence linter
