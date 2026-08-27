// POSTYAR — /api/bots/[id]/history
// GET: paginated BotHistory for a bot. Sanitizes raw field.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, AuthError, safeJsonParse } from "@/lib/server/auth";
import { maskToken } from "@/lib/persian";

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 50;

function sanitizeRawForClient(rawJson: string | null): Record<string, unknown> | null {
  if (!rawJson) return null;
  try {
    const parsed = JSON.parse(rawJson) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    // Strip any field whose name looks tokenish — defense in depth even
    // though sanitizeRaw already did this at write time.
    const cleaned = stripTokenish(parsed as Record<string, unknown>);
    return cleaned;
  } catch {
    return null;
  }
}

function stripTokenish(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const klow = k.toLowerCase();
    if (klow === "token" || klow === "bottoken" || klow === "secret" || klow === "authorization" || klow === "password") {
      out[k] = "<REDACTED>";
    } else if (typeof v === "string") {
      out[k] = v.length > 500 ? v.slice(0, 500) + "..." : v;
    } else if (Array.isArray(v)) {
      out[k] = v.slice(0, 20);
    } else if (v && typeof v === "object") {
      out[k] = stripTokenish(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let user;
  try { user = await requireUser(); } catch (e) {
    return NextResponse.json({ errorFa: (e as AuthError).message }, { status: (e as AuthError).status });
  }
  const { id } = await params;
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(url.searchParams.get("pageSize") ?? String(DEFAULT_PAGE_SIZE))),
  );
  const direction = url.searchParams.get("direction") ?? undefined; // inbound|outbound
  const providerUserId = url.searchParams.get("providerUserId") ?? undefined;

  const bot = await db.bot.findFirst({
    where: { id, ownerId: user.id },
    select: { id: true },
  });
  if (!bot) {
    return NextResponse.json({ errorFa: "ربات یافت نشد." }, { status: 404 });
  }

  const where: Record<string, unknown> = { botId: id };
  if (direction === "inbound" || direction === "outbound") where.direction = direction;
  if (providerUserId) where.providerUserId = providerUserId;

  const [total, rows] = await Promise.all([
    db.botHistory.count({ where }),
    db.botHistory.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        direction: true,
        providerUserId: true,
        text: true,
        raw: true,
        userId: true,
        createdAt: true,
      },
    }),
  ]);

  const items = rows.map((r) => ({
    id: r.id,
    direction: r.direction,
    providerUserId: r.providerUserId ? maskToken(r.providerUserId) : null,
    text: r.text,
    raw: sanitizeRawForClient(r.raw),
    userId: r.userId,
    createdAt: r.createdAt.toISOString(),
  }));

  return NextResponse.json({
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
}

void safeJsonParse; // referenced indirectly via stripTokenish path
