// POSTYAR — GET /api/ads/placements (any logged-in user)
// Returns ACTIVE ad placements with the public fields an advertiser needs to
// build a campaign: key, labelFa, descriptionFa, kind, recommendedWidth,
// recommendedHeight, maxFileBytes. ACTIVE-only (no admin's `active` flag,
// no sortOrder leak). Used by the user-facing «کمپین جدید» form to populate
// the placement <Select> + the «سایز پیشنهادی» hint badge next to the image
// upload area + the live preview pane aspect ratio.
//
// Note: this is intentionally separate from the admin route
// /api/admin/ads/placements so the admin-only fields (campaignCount, active,
// createdAt, updatedAt) never leak to a non-admin caller.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureAdPlacementsSeeded } from "@/lib/payments/advertising";
import { requireUser, AuthError } from "@/lib/server/auth";

export interface PublicAdPlacementRow {
  key: string;
  labelFa: string;
  descriptionFa: string;
  kind: string;
  recommendedWidth: number;
  recommendedHeight: number;
  maxFileBytes: number;
}

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
  // Make sure default placements exist before listing — otherwise the first
  // user to land here sees an empty dropdown. Same idempotent helper the
  // create-ad path already uses.
  await ensureAdPlacementsSeeded();
  const rows = await db.adPlacement.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  const items: PublicAdPlacementRow[] = rows.map((r) => ({
    key: r.key,
    labelFa: r.labelFa,
    descriptionFa: r.descriptionFa,
    kind: r.kind,
    recommendedWidth: r.recommendedWidth,
    recommendedHeight: r.recommendedHeight,
    maxFileBytes: r.maxFileBytes,
  }));
  return NextResponse.json({ items });
}
