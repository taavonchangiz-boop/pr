// POSTYAR — GET /api/ads/serve/[placement] (PUBLIC, no auth)
// Returns the active+approved+currently-running campaigns for a placement.
//   JSON: { campaigns: [{ id, title, descriptionFa, link, imagePath, kind }] }
// Impressions are incremented fire-and-forget (the lib swallows errors). We
// do NOT block the response on the increment.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { incrementImpression } from "@/lib/payments/advertising";

type Params = { params: Promise<{ placement: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { placement } = await params;
  if (!placement || placement.length > 60) {
    return NextResponse.json({ campaigns: [] });
  }
  // Resolve the placement record; inactive or missing → empty list.
  const slot = await db.adPlacement.findUnique({ where: { key: placement } });
  if (!slot || !slot.active) {
    return NextResponse.json({ campaigns: [] });
  }
  const now = new Date();
  const rows = await db.adCampaign.findMany({
    where: {
      placement,
      status: { in: ["approved", "running"] },
      OR: [{ startAt: null }, { startAt: { lte: now } }],
      AND: [{ OR: [{ endAt: null }, { endAt: { gt: now } }] }],
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  // Fire-and-forget impressions. The lib already swallows errors so this is safe.
  for (const r of rows) {
    void incrementImpression(r.id);
  }
  return NextResponse.json({
    campaigns: rows.map((r) => ({
      id: r.id,
      title: r.title,
      descriptionFa: r.descriptionFa,
      link: r.link,
      imagePath: r.imagePath,
      kind: slot.kind,
    })),
  });
}
