// POSTYAR — /api/bots/[id]/deactivate
// Set status=inactive, delete webhook from provider.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  requireUser,
  clientIp,
  audit,
  AuthError,
} from "@/lib/server/auth";
import { deleteWebhook } from "@/lib/bots/register-webhook";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let user;
  try { user = await requireUser(); } catch (e) {
    return NextResponse.json({ errorFa: (e as AuthError).message }, { status: (e as AuthError).status });
  }
  const ip = clientIp(req);
  const { id } = await params;
  const bot = await db.bot.findFirst({ where: { id, ownerId: user.id } });
  if (!bot) {
    return NextResponse.json({ errorFa: "ربات یافت نشد." }, { status: 404 });
  }
  if (bot.status === "inactive") {
    return NextResponse.json({ ok: true, alreadyInactive: true });
  }
  await db.bot.update({ where: { id }, data: { status: "inactive" } });
  // Best-effort delete the webhook — we don't block deactivation on
  // provider errors. The webhookSecret column is cleared either way so
  // incoming requests will be rejected even if the provider still calls us.
  await deleteWebhook(id);
  await audit({
    userId: user.id,
    actor: "user",
    action: "bot_deactivated",
    targetType: "bot",
    targetId: id,
    ip,
    meta: { provider: bot.provider },
  });
  return NextResponse.json({ ok: true });
}
