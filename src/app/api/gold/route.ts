// POSTYAR — GET /api/gold
// Returns current prices for all instruments (or a specific one via ?instrument=).
import { NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/server/auth";
import { getAllGoldPrices, getGoldPrice, type GoldInstrument } from "@/lib/providers/gold";

export async function GET(req: Request) {
  let user;
  try { user = await requireUser(); } catch (e) {
    return NextResponse.json({ errorFa: (e as AuthError).message }, { status: (e as AuthError).status });
  }
  void user;
  const url = new URL(req.url);
  const inst = url.searchParams.get("instrument") as GoldInstrument | null;
  if (inst) {
    const r = await getGoldPrice(inst);
    return NextResponse.json(r);
  }
  const all = await getAllGoldPrices();
  return NextResponse.json({ items: all });
}
