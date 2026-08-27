// POSTYAR — /api/inbox
// GET — aggregate the caller's bot history into conversation threads
// grouped by (botId, providerUserId). Each thread shows:
//   threadId — composite string `${botId}:${providerUserId}`
//   botId, botName, provider, providerUserId (raw — needed for replies)
//   maskedSender (maskToken(providerUserId))
//   lastMessage (preview), lastDirection, lastAt (ISO)
//   unread (true if there are any inbound messages after the last outbound)
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, AuthError } from "@/lib/server/auth";
import { maskToken } from "@/lib/persian";

type ThreadAgg = {
  threadId: string;
  botId: string;
  botName: string;
  provider: string;
  providerUserId: string;
  maskedSender: string;
  lastMessage: string;
  lastDirection: "inbound" | "outbound";
  lastAt: string;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
};

function threadKey(botId: string, providerUserId: string) {
  return `${botId}:${providerUserId}`;
}

export async function GET() {
  let user;
  try { user = await requireUser(); } catch (e) {
    return NextResponse.json({ errorFa: (e as AuthError).message }, { status: (e as AuthError).status });
  }

  const bots = await db.bot.findMany({
    where: { ownerId: user.id },
    select: { id: true, name: true, provider: true, status: true },
  });
  if (bots.length === 0) return NextResponse.json({ items: [] });

  const botIds = bots.map((b) => b.id);
  const rows = await db.botHistory.findMany({
    where: { botId: { in: botIds }, providerUserId: { not: null } },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      id: true,
      botId: true,
      direction: true,
      providerUserId: true,
      text: true,
      createdAt: true,
    },
  });

  const byThread = new Map<string, ThreadAgg>();
  for (const r of rows) {
    if (!r.providerUserId) continue;
    const bot = bots.find((b) => b.id === r.botId);
    if (!bot) continue;
    const k = threadKey(r.botId, r.providerUserId);
    const dir: "inbound" | "outbound" = r.direction === "outbound" ? "outbound" : "inbound";
    const text = (r.text ?? "").slice(0, 200);
    const iso = r.createdAt.toISOString();
    const existing = byThread.get(k);
    if (!existing) {
      byThread.set(k, {
        threadId: k,
        botId: r.botId,
        botName: bot.name,
        provider: bot.provider,
        providerUserId: r.providerUserId,
        maskedSender: maskToken(r.providerUserId),
        lastMessage: text,
        lastDirection: dir,
        lastAt: iso,
        lastInboundAt: dir === "inbound" ? iso : null,
        lastOutboundAt: dir === "outbound" ? iso : null,
      });
    } else {
      if (iso > existing.lastAt) {
        existing.lastMessage = text;
        existing.lastDirection = dir;
        existing.lastAt = iso;
      }
      if (dir === "inbound") {
        if (!existing.lastInboundAt || iso > existing.lastInboundAt) existing.lastInboundAt = iso;
      } else {
        if (!existing.lastOutboundAt || iso > existing.lastOutboundAt) existing.lastOutboundAt = iso;
      }
    }
  }

  const items = Array.from(byThread.values())
    .map((t) => {
      const unread =
        !!t.lastInboundAt && (!t.lastOutboundAt || t.lastInboundAt > t.lastOutboundAt);
      const { lastInboundAt: _drop1, lastOutboundAt: _drop2, ...rest } = t;
      void _drop1; void _drop2;
      return { ...rest, unread };
    })
    .sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));

  return NextResponse.json({ items });
}
