// POSTYAR: sign out current session
import { NextResponse } from "next/server";
import { revokeCurrentSession, getCurrentUser, clientIp, audit } from "@/lib/server/auth";

export async function POST(req: Request) {
  const u = await getCurrentUser();
  if (u) await audit({ userId: u.id, actor: "user", action: "signout", targetType: "user", targetId: u.id, ip: clientIp(req) });
  await revokeCurrentSession();
  return NextResponse.json({ ok: true });
}
