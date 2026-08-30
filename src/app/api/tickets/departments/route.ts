// =====================================================================
// POSTYAR — /api/tickets/departments
// ---------------------------------------------------------------------
// GET — list ACTIVE ticket departments for any authenticated user.
// Used by the user-facing «تیکت جدید» dialog so the user can pick a
// department when creating a ticket. Only `active=true` rows are
// returned; the ordering is identical to the admin view (priority asc,
// nameFa asc).
//
// Authorization: requireUser() — any signed-in user.
// =====================================================================
import { NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/server/auth";
import { listDepartments } from "@/lib/tickets";

export async function GET() {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    return NextResponse.json(
      { errorFa: (e as AuthError).message },
      { status: (e as AuthError).status },
    );
  }
  void user;
  const r = await listDepartments({ activeOnly: true });
  return NextResponse.json(r);
}
