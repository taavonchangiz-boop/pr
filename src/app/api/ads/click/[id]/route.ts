// POSTYAR — POST /api/ads/click/[id] (PUBLIC, no auth)
// Increments the click counter for an active+approved campaign. Fire-and-
// forget style: returns 200 immediately; the lib swallows DB errors so a
// bad id (404-ish) won't break the click handler on the client.
import { NextResponse } from "next/server";
import { incrementClick } from "@/lib/payments/advertising";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  const { id } = await params;
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  void incrementClick(id); // fire-and-forget (lib catches errors)
  return NextResponse.json({ ok: true });
}
