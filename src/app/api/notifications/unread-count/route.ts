// POSTYAR — GET /api/notifications/unread-count
import { NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/server/auth";
import { getUnreadCount } from "@/lib/notifications";

export async function GET() {
  let user;
  try { user = await requireUser(); } catch (e) {
    return NextResponse.json({ errorFa: (e as AuthError).message }, { status: (e as AuthError).status });
  }
  const count = await getUnreadCount(user.id);
  return NextResponse.json({ count });
}
