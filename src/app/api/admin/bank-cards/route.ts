// POSTYAR — /api/admin/bank-cards — GET list / POST create (admin only)
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, clientIp, AuthError } from "@/lib/server/auth";
import { listBankCards, addBankCard, ALLOWED_BANKS } from "@/lib/payments/bank-cards";

export async function GET() {
  let user;
  try { user = await requireRole(["admin"]); } catch (e) {
    return NextResponse.json({ errorFa: (e as AuthError).message }, { status: (e as AuthError).status });
  }
  void user;
  const items = await listBankCards();
  return NextResponse.json({ items, allowedBanks: ALLOWED_BANKS });
}

const PostSchema = z.object({
  cardNumber: z.string().min(4, "شماره کارت حداقل ۴ رقم است.").max(19),
  holderName: z.string().min(3).max(80),
  bankName: z.string().min(2).max(40),
});

export async function POST(req: Request) {
  let user;
  try { user = await requireRole(["admin"]); } catch (e) {
    return NextResponse.json({ errorFa: (e as AuthError).message }, { status: (e as AuthError).status });
  }
  const ip = clientIp(req);
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ errorFa: "بدنه درخواست نامعتبر است." }, { status: 400 });
  }
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { errorFa: parsed.error.issues[0]?.message ?? "ورودی نامعتبر است." },
      { status: 400 },
    );
  }
  try {
    const card = await addBankCard({
      cardNumber: parsed.data.cardNumber,
      holderName: parsed.data.holderName,
      bankName: parsed.data.bankName,
      adminId: user.id,
      ip,
    });
    return NextResponse.json({ ok: true, card }, { status: 201 });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ errorFa: e.message }, { status: e.status });
    }
    return NextResponse.json({ errorFa: "خطای داخلی." }, { status: 500 });
  }
}
