// POSTYAR — GET /api/orders/[id] — single order (ownership-enforced)
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, AuthError } from "@/lib/server/auth";
import { formatRials } from "@/lib/persian";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  let user;
  try { user = await requireUser(); } catch (e) {
    return NextResponse.json({ errorFa: (e as AuthError).message }, { status: (e as AuthError).status });
  }
  const { id } = await params;
  const order = await db.order.findUnique({
    where: { id },
    include: { cardReceipt: true, bankRef: true, baleRef: true },
  });
  if (!order) {
    return NextResponse.json({ errorFa: "سفارش یافت نشد." }, { status: 404 });
  }
  if (order.userId !== user.id && user.role !== "admin") {
    return NextResponse.json({ errorFa: "دسترسی غیرمجاز." }, { status: 403 });
  }
  // Plan is a separate (planId-only foreign key on Order; no relation) lookup
  const plan = order.planId ? await db.plan.findUnique({ where: { id: order.planId }, select: { nameFa: true } }) : null;
  return NextResponse.json({
    order: {
      id: order.id,
      kind: order.kind,
      amountRials: order.amountRials,
      amountFa: formatRials(order.amountRials),
      descriptionFa: order.descriptionFa,
      status: order.status,
      provider: order.provider,
      providerRef: order.providerRef,
      planId: order.planId,
      planName: plan?.nameFa ?? null,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      cardReceipt: order.cardReceipt
        ? {
            id: order.cardReceipt.id,
            status: order.cardReceipt.status,
            mediaId: null, // receipts are stored via the media pipeline; UI fetches via /api/media/<id>
            storagePath: order.cardReceipt.storagePath,
            publicId: order.cardReceipt.publicId,
            reviewedAt: order.cardReceipt.reviewedAt?.toISOString() ?? null,
          }
        : null,
      bankRef: order.bankRef
        ? {
            authority: order.bankRef.authority,
            mode: order.bankRef.mode,
            traceNo: order.bankRef.traceNo,
            paidAt: order.bankRef.paidAt?.toISOString() ?? null,
          }
        : null,
      baleRef: order.baleRef
        ? {
            botId: order.baleRef.botId,
            chargeId: order.baleRef.chargeId,
            paidAt: order.baleRef.paidAt?.toISOString() ?? null,
          }
        : null,
    },
  });
}
