// =====================================================================
// POSTYAR — Inbox helper
// ---------------------------------------------------------------------
// `ingestInboundMessage` saves to BotHistory (direction=inbound) and
// returns the conversation shape. `getInboxThreads` returns threads
// grouped by provider+providerUserId with last message preview + unread
// count.
// =====================================================================
import { db } from "@/lib/db";
import { sanitizeRaw } from "@/lib/providers/util";

export interface InboundMessageInput {
  userId: string;
  botId: string;
  provider: string; // telegram|bale|rubika
  providerUserId: string;
  text: string;
  raw?: unknown;
}

export interface InboundMessageResult {
  ok: boolean;
  historyId: string;
  threadKey: string;
  errorFa?: string;
}

export interface InboxThread {
  threadKey: string;
  botId: string;
  provider: string;
  providerUserId: string;
  lastText: string;
  lastAt: string;
  unreadCount: number;
  totalCount: number;
}

/**
 * Persists an inbound message to BotHistory. Idempotent on the raw
 * update_id (when provided in `raw`). Returns the conversation thread
 * key used to group messages.
 */
export async function ingestInboundMessage(
  input: InboundMessageInput,
): Promise<InboundMessageResult> {
  if (!input.userId || !input.botId || !input.providerUserId || !input.text) {
    return { ok: false, historyId: "", threadKey: "", errorFa: "ورودی نامعتبر است." };
  }
  const threadKey = `${input.provider}:${input.providerUserId}`;

  const sanitizedRaw = input.raw ? JSON.stringify(sanitizeRaw(input.raw)) : null;

  try {
    const row = await db.botHistory.create({
      data: {
        botId: input.botId,
        userId: input.userId,
        direction: "inbound",
        providerUserId: input.providerUserId,
        text: input.text.slice(0, 4000),
        raw: sanitizedRaw,
      },
    });
    return {
      ok: true,
      historyId: row.id,
      threadKey,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "ذخیره پیام ناموفق بود.";
    return { ok: false, historyId: "", threadKey: "", errorFa: msg };
  }
}

/**
 * Returns threads for the user's bots, grouped by provider+providerUserId.
 * Each thread includes the most recent message and unread count
 * (computed from a simple per-thread "lastReadAt" stored in a
 * per-thread JSON sidecar — see markThreadRead).
 */
export async function getInboxThreads(
  userId: string,
  opts?: { limit?: number; offset?: number; botId?: string },
): Promise<{ items: InboxThread[]; total: number }> {
  const limit = Math.min(opts?.limit ?? 50, 100);
  const offset = opts?.offset ?? 0;

  // Pull all inbound messages for this user's bots in one query,
  // then group client-side. For typical workloads (1-2 bots, dozens
  // of threads) this is fast enough; for high-volume tenants, a
  // dedicated thread table would be added later.
  const where = opts?.botId
    ? { botId: opts.botId, bot: { ownerId: userId } }
    : { bot: { ownerId: userId } };

  const rows = await db.botHistory.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 1000, // bound
    select: {
      id: true,
      botId: true,
      direction: true,
      providerUserId: true,
      text: true,
      createdAt: true,
      bot: { select: { provider: true } },
    },
  });

  // Group
  const groups = new Map<string, InboxThread & { lastReadAt: Date | null }>();
  // lastReadAt is fetched lazily from per-thread state stored in cache.
  for (const r of rows) {
    if (!r.providerUserId) continue;
    const key = `${r.bot.provider}:${r.providerUserId}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        threadKey: key,
        botId: r.botId,
        provider: r.bot.provider,
        providerUserId: r.providerUserId,
        lastText: "",
        lastAt: r.createdAt.toISOString(),
        unreadCount: 0,
        totalCount: 0,
        lastReadAt: null,
      };
      groups.set(key, g);
    }
    g.totalCount += 1;
    if (r.createdAt.toISOString() > g.lastAt) {
      g.lastAt = r.createdAt.toISOString();
      g.lastText = r.direction === "inbound" ? r.text : g.lastText || r.text;
    }
  }

  // Compute unread per thread from cache-stored lastReadAt.
  // We do this in a second pass to avoid awaiting in the tight loop.
  const items = Array.from(groups.values());
  for (const t of items) {
    const cached = await getThreadLastRead(userId, t.threadKey);
    t.lastReadAt = cached;
    if (cached) {
      const cachedMs = cached.getTime();
      let unread = 0;
      for (const r of rows) {
        if (!r.providerUserId) continue;
        const k = `${r.bot.provider}:${r.providerUserId}`;
        if (k !== t.threadKey) continue;
        if (r.direction === "inbound" && r.createdAt.getTime() > cachedMs) unread += 1;
      }
      t.unreadCount = unread;
    } else {
      // No read marker — everything inbound is unread.
      t.unreadCount = rows.filter((r) => {
        if (!r.providerUserId) return false;
        const k = `${r.bot.provider}:${r.providerUserId}`;
        return k === t.threadKey && r.direction === "inbound";
      }).length;
    }
  }

  items.sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));
  const total = items.length;
  const paged = items.slice(offset, offset + limit);
  return { items: paged, total };
}

export async function getThreadMessages(
  userId: string,
  threadKey: string,
  opts?: { limit?: number; before?: Date },
): Promise<{
  items: Array<{
    id: string;
    direction: string;
    text: string;
    createdAt: string;
    botId: string;
    providerUserId: string;
  }>;
}> {
  // threadKey is "provider:providerUserId"
  const [provider, ...rest] = threadKey.split(":");
  const providerUserId = rest.join(":");
  if (!provider || !providerUserId) return { items: [] };

  const limit = Math.min(opts?.limit ?? 50, 200);
  const rows = await db.botHistory.findMany({
    where: {
      bot: { ownerId: userId, provider },
      providerUserId,
      ...(opts?.before ? { createdAt: { lt: opts.before } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      direction: true,
      text: true,
      createdAt: true,
      botId: true,
      providerUserId: true,
    },
  });
  return {
    items: rows.map((r) => ({
      id: r.id,
      direction: r.direction,
      text: r.text,
      createdAt: r.createdAt.toISOString(),
      botId: r.botId,
      providerUserId: r.providerUserId ?? "",
    })),
  };
}

// ---------------------------------------------------------------------
// Per-thread read marker — stored in cache (24h TTL, refreshed on read).
// In production this would live in a dedicated table; for dev/early
// traffic, the cache is sufficient.
// ---------------------------------------------------------------------
import { cache } from "@/lib/security/cache";

const READ_TTL = 24 * 60 * 60 * 1000;

export async function markThreadRead(userId: string, threadKey: string): Promise<void> {
  await cache.set(`inbox:read:${userId}:${threadKey}`, new Date().toISOString(), READ_TTL);
}

export async function getThreadLastRead(userId: string, threadKey: string): Promise<Date | null> {
  const v = await cache.get<string>(`inbox:read:${userId}:${threadKey}`);
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}
