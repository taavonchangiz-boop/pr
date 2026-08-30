// POSTYAR — POST /api/payments/bank — create bank gateway request
// ---------------------------------------------------------------------
// ITEM 41 — the `mode` body field is OPTIONAL. The default ("direct") is
// resolved by the backend; the user never picks "direct" vs "intermediary"
// in the UI. The bank lib (`lib/payments/bank.ts`) still supports both
// modes for backward compat with the persisted `BankGatewayRef.mode`
// column + the verify callback; the API just no longer makes the user
// choose. The resolved mode is recorded in the audit log.
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, clientIp, audit, AuthError } from "@/lib/server/auth";
import { getBankProvider, type BankMode } from "@/lib/payments/bank";

const BodySchema = z.object({
  orderId: z.string().min(1),
  // Optional — defaults to "direct" server-side. The UI no longer asks
  // the user to pick direct/intermediary.
  mode: z.enum(["direct", "intermediary"]).optional(),
});

export async function POST(req: Request) {
  let user;
  try { user = await requireUser(); } catch (e) {
    return NextResponse.json({ errorFa: (e as AuthError).message }, { status: (e as AuthError).status });
  }
  const ip = clientIp(req);

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ errorFa: "بدنه درخواست نامعتبر است." }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { errorFa: parsed.error.issues[0]?.message ?? "ورودی نامعتبر است." },
      { status: 400 },
    );
  }
  const order = await db.order.findUnique({ where: { id: parsed.data.orderId } });
  if (!order) {
    return NextResponse.json({ errorFa: "سفارش یافت نشد." }, { status: 404 });
  }
  if (order.userId !== user.id) {
    return NextResponse.json({ errorFa: "دسترسی غیرمجاز." }, { status: 403 });
  }
  if (order.status === "paid" || order.status === "awaiting_review") {
    return NextResponse.json({ errorFa: "این سفارش قابل پرداخت نیست." }, { status: 400 });
  }

  // Resolve the mode — the user no longer picks; we use "direct" by
  // default (or whatever the client explicitly sent — kept for backward
  // compat with any older client that still sends a mode).
  const mode: BankMode = parsed.data.mode ?? "direct";

  const provider = getBankProvider();
  const result = await provider.bankCreatePaymentRequest({
    order: {
      id: order.id,
      userId: order.userId,
      kind: order.kind,
      amountRials: order.amountRials,
      descriptionFa: order.descriptionFa,
      status: order.status,
    },
    mode,
  });
  if (result.errorFa) {
    await audit({
      userId: user.id,
      actor: "user",
      action: "bank_payment_request_failed",
      targetType: "order",
      targetId: order.id,
      ip,
      meta: { mode, errorFa: result.errorFa },
    });
    return NextResponse.json({ errorFa: result.errorFa }, { status: 422 });
  }
  await audit({
    userId: user.id,
    actor: "user",
    action: "bank_payment_request_created",
    targetType: "order",
    targetId: order.id,
    ip,
    meta: { mode, authority: result.authority },
  });
  return NextResponse.json({
    ok: true,
    redirectUrl: result.redirectUrl,
    authority: result.authority,
    mode: result.mode,
  });
}
