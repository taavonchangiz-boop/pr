// POSTYAR — POST /api/payments/bank — create bank gateway request
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, clientIp, audit, AuthError } from "@/lib/server/auth";
import { getBankProvider, type BankMode } from "@/lib/payments/bank";

const BodySchema = z.object({
  orderId: z.string().min(1),
  mode: z.enum(["direct", "intermediary"]),
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
    mode: parsed.data.mode as BankMode,
  });
  if (result.errorFa) {
    await audit({
      userId: user.id,
      actor: "user",
      action: "bank_payment_request_failed",
      targetType: "order",
      targetId: order.id,
      ip,
      meta: { mode: parsed.data.mode, errorFa: result.errorFa },
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
    meta: { mode: parsed.data.mode, authority: result.authority },
  });
  return NextResponse.json({
    ok: true,
    redirectUrl: result.redirectUrl,
    authority: result.authority,
    mode: result.mode,
  });
}
