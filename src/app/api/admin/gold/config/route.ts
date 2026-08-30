// POSTYAR — /api/admin/gold/config (GET + POST)
// ---------------------------------------------------------------------
// Admin-managed single-row config for the gold price source. Backed by
// the `GoldPriceConfig` Prisma model (already in schema).
//
// The `token` field (when source === "custom_token") is encrypted at rest
// using AES-256-GCM (src/lib/security/crypto) and is NEVER returned in
// plaintext to the UI — the GET response only includes a masked preview
// (last 4 chars). The actual token is decrypted only inside the refresh
// route, which uses it to fetch prices.
//
// POST body shape (all fields optional except `source`):
//   { source, endpoint?, token?, selector18k?, selectorEmami?,
//     selectorBahar?, selectorOunce?, refreshMinutes?, active? }
//
// ITEM 28.
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, clientIp, audit, AuthError } from "@/lib/server/auth";
import { db } from "@/lib/db";
import { encryptString, decryptString } from "@/lib/security/crypto";
import { formatJalaliDateTime, maskToken } from "@/lib/persian";

const SOURCES = ["free_talaapi", "free_tgju", "free_bonmarket", "custom_json", "custom_token"] as const;

const PostSchema = z.object({
  source: z.enum(SOURCES),
  endpoint: z.string().max(2048).optional().nullable(),
  // Token: when non-empty string, encrypt + store. When empty/null,
  // CLEAR the existing token (so the admin can revoke). When `undefined`,
  // leave the existing token untouched (so the admin can change other
  // fields without re-entering the token).
  token: z.string().max(4096).optional().nullable(),
  selector18k: z.string().max(256).optional().nullable(),
  selectorEmami: z.string().max(256).optional().nullable(),
  selectorBahar: z.string().max(256).optional().nullable(),
  selectorOunce: z.string().max(256).optional().nullable(),
  refreshMinutes: z.number().int().min(1).max(1440).optional(),
  active: z.boolean().optional(),
});

// Default endpoint URLs for the built-in free platforms are duplicated in
// the refresh route (`/api/admin/gold/refresh/route.ts`) — kept there
// because App Router route files shouldn't be imported across each
// other. The admin can override any of them via `endpoint`. These are
// best-effort public JSON endpoints; if a platform changes its API,
// the admin can switch to `custom_json` / `custom_token`.

export async function GET() {
  let user;
  try { user = await requireRole(["admin"]); } catch (e) {
    return NextResponse.json({ errorFa: (e as AuthError).message }, { status: (e as AuthError).status });
  }
  void user;

  const row = await db.goldPriceConfig.findFirst({ orderBy: { id: "asc" } });
  if (!row) {
    // No config yet — return sensible defaults so the UI has something
    // to render. The actual refresh will use `POSTYAR_GOLD_PROVIDER_URL`
    // as a fallback until the admin saves real config.
    return NextResponse.json({
      source: "free_talaapi",
      endpoint: null,
      token: null,
      tokenPreview: null,
      selector18k: null,
      selectorEmami: null,
      selectorBahar: null,
      selectorOunce: null,
      refreshMinutes: 5,
      active: true,
      updatedAt: null,
      updatedAtFa: null,
    });
  }
  // Decrypt the token (best-effort) just for the masked preview. If
  // decryption fails (e.g. POSTYAR_MASTER_KEY was rotated), mask whatever
  // raw value we have so the UI doesn't break.
  let tokenPreview: string | null = null;
  if (row.token) {
    try {
      const raw = decryptString(row.token);
      tokenPreview = maskToken(raw);
    } catch {
      tokenPreview = "•••• (قفل نامعتبر)";
    }
  }
  return NextResponse.json({
    source: row.source,
    endpoint: row.endpoint,
    token: tokenPreview, // masked — never the raw token
    tokenPreview,
    selector18k: row.selector18k,
    selectorEmami: row.selectorEmami,
    selectorBahar: row.selectorBahar,
    selectorOunce: row.selectorOunce,
    refreshMinutes: row.refreshMinutes,
    active: row.active,
    updatedAt: row.updatedAt.toISOString(),
    updatedAtFa: formatJalaliDateTime(row.updatedAt, { withTime: true }),
  });
}

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
  // Validate per-source requirements:
  //   - custom_json requires endpoint
  //   - custom_token requires both endpoint AND token (non-empty on first save)
  const src = parsed.data.source;
  const endpoint = parsed.data.endpoint ?? null;
  if ((src === "custom_json" || src === "custom_token") && !endpoint) {
    return NextResponse.json(
      { errorFa: "برای منبع دلخواه، نشانی endpoint الزامی است." },
      { status: 400 },
    );
  }

  // Resolve the singleton row. findFirst → if exists update; else create.
  const existing = await db.goldPriceConfig.findFirst({ orderBy: { id: "asc" } });

  // Build the data payload. Only update fields the admin actually
  // submitted (so a PATCH-style partial update is supported).
  const data: Record<string, unknown> = {
    source: src,
    endpoint,
    selector18k: parsed.data.selector18k ?? null,
    selectorEmami: parsed.data.selectorEmami ?? null,
    selectorBahar: parsed.data.selectorBahar ?? null,
    selectorOunce: parsed.data.selectorOunce ?? null,
  };
  if (parsed.data.refreshMinutes !== undefined) data.refreshMinutes = parsed.data.refreshMinutes;
  if (parsed.data.active !== undefined) data.active = parsed.data.active;

  // Token handling — see PostSchema.note.
  if (parsed.data.token !== undefined) {
    const t = parsed.data.token ?? "";
    data.token = t ? encryptString(t) : null;
  }

  let row;
  if (existing) {
    row = await db.goldPriceConfig.update({ where: { id: existing.id }, data });
  } else {
    row = await db.goldPriceConfig.create({
      data: {
        source: data.source as string,
        endpoint: data.endpoint as string | null,
        token: (data.token as string | null) ?? null,
        selector18k: data.selector18k as string | null,
        selectorEmami: data.selectorEmami as string | null,
        selectorBahar: data.selectorBahar as string | null,
        selectorOunce: data.selectorOunce as string | null,
        refreshMinutes: (data.refreshMinutes as number | undefined) ?? 5,
        active: (data.active as boolean | undefined) ?? true,
      },
    });
  }

  await audit({
    userId: user.id,
    actor: "admin",
    action: "gold_config_updated",
    targetType: "gold_config",
    targetId: row.id,
    ip,
    meta: { source: row.source, endpoint: row.endpoint, active: row.active, refreshMinutes: row.refreshMinutes },
  });

  // Mask the token in the response.
  let tokenPreview: string | null = null;
  if (row.token) {
    try {
      tokenPreview = maskToken(decryptString(row.token));
    } catch {
      tokenPreview = "•••• (قفل نامعتبر)";
    }
  }
  return NextResponse.json({
    ok: true,
    config: {
      source: row.source,
      endpoint: row.endpoint,
      token: tokenPreview,
      tokenPreview,
      selector18k: row.selector18k,
      selectorEmami: row.selectorEmami,
      selectorBahar: row.selectorBahar,
      selectorOunce: row.selectorOunce,
      refreshMinutes: row.refreshMinutes,
      active: row.active,
      updatedAt: row.updatedAt.toISOString(),
      updatedAtFa: formatJalaliDateTime(row.updatedAt, { withTime: true }),
    },
  });
}
