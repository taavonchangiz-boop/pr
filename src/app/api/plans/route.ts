// POSTYAR — GET /api/plans — list public plans
import { NextResponse } from "next/server";
import { listPublicPlans } from "@/lib/payments/plans";

export async function GET() {
  try {
    const plans = await listPublicPlans();
    return NextResponse.json({ items: plans });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "خطای داخلی.";
    return NextResponse.json({ errorFa: msg }, { status: 500 });
  }
}
