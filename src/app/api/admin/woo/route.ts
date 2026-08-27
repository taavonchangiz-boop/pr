// POSTYAR — /api/admin/woo (GET all woo stores)
import { NextResponse } from "next/server";
import { requireRole, AuthError } from "@/lib/server/auth";
import { db } from "@/lib/db";
import { decryptString } from "@/lib/security/crypto";
import { maskToken } from "@/lib/persian";
import { formatJalaliDateTime } from "@/lib/persian";

function maskKey(k: string): string {
  if (!k) return "";
  if (k.length <= 8) return "••••";
  return `${k.slice(0, 4)}••••${k.slice(-4)}`;
}

export async function GET() {
  let user;
  try { user = await requireRole(["admin"]); } catch (e) {
    return NextResponse.json({ errorFa: (e as AuthError).message }, { status: (e as AuthError).status });
  }
  void user;
  const rows = await db.wooCommerceStore.findMany({
    orderBy: { createdAt: "desc" },
    include: { user: { select: { id: true, firstName: true, lastName: true, email: true, businessName: true } } },
  });
  return NextResponse.json({
    items: rows.map((s) => {
      let masked = "";
      try { masked = maskKey(decryptString(s.consumerKeyEnc)); } catch { masked = ""; }
      return {
        id: s.id,
        userId: s.userId,
        ownerName: s.user ? `${s.user.firstName ?? ""} ${s.user.lastName ?? ""}`.trim() : null,
        ownerEmail: s.user?.email ?? null,
        storeUrl: s.storeUrl,
        status: s.status,
        consumerKeyMasked: masked,
        lastSyncAt: s.lastSyncAt?.toISOString() ?? null,
        lastSyncAtFa: s.lastSyncAt ? formatJalaliDateTime(s.lastSyncAt, { withTime: true }) : null,
        createdAt: s.createdAt.toISOString(),
      };
    }),
  });
}

void maskToken; // silence linter about unused symbol
