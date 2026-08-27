// POSTYAR — GET /api/admin/ads — list all ads (admin only)
import { NextResponse } from "next/server";
import { requireRole, AuthError } from "@/lib/server/auth";
import { listAllAdsForAdmin } from "@/lib/payments/advertising";

export async function GET() {
  let user;
  try { user = await requireRole(["admin"]); } catch (e) {
    return NextResponse.json({ errorFa: (e as AuthError).message }, { status: (e as AuthError).status });
  }
  void user;
  const items = await listAllAdsForAdmin();
  return NextResponse.json({ items });
}
