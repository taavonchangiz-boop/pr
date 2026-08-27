// POSTYAR — /api/admin/users (GET list users with filters)
import { NextResponse } from "next/server";
import { requireRole, AuthError } from "@/lib/server/auth";
import { db } from "@/lib/db";
import { formatJalaliDateTime, maskMobile, maskToken } from "@/lib/persian";

export async function GET(req: Request) {
  let user;
  try { user = await requireRole(["admin"]); } catch (e) {
    return NextResponse.json({ errorFa: (e as AuthError).message }, { status: (e as AuthError).status });
  }
  void user;
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
    })),
    total,
  });
}

void maskToken; // silence linter
