// POSTYAR — POST /api/publish/schedule
// Body: { contentId, destinationIds: string[], scheduledAtJalali: "now" | { jy, jm, jd, hour, minute } }
// Validates ownership + state machine. Converts Jalali → UTC ISO. Creates
// one PublishJob per destination with a deterministic idempotency key
// `contentId:destinationId:iso` so duplicate submissions collapse.
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, clientIp, audit, AuthError, safeJsonParse } from "@/lib/server/auth";
import { rateLimit } from "@/lib/security/cache";
import { jalaliToUtcIso } from "@/lib/persian";
import { assertTransition, isContentStatus } from "@/lib/publishing/state";
import { schedulePublishJob } from "@/lib/queue/scheduler";

const JalaliSchema = z.object({
  jy: z.number().int().min(1300).max(1500),
  jm: z.number().int().min(1).max(12),
  jd: z.number().int().min(1).max(31),
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
});

const Schema = z.object({
  contentId: z.string().min(1),
  destinationIds: z.array(z.string().min(1)).min(1, "حداقل یک مقصد الزامی است.").max(20),
  scheduledAtJalali: z.union([z.literal("now"), JalaliSchema]),
});

export async function POST(req: Request) {
  let user;
  try { user = await requireUser(); } catch (e) {
    return NextResponse.json({ errorFa: (e as AuthError).message }, { status: (e as AuthError).status });
  }
  const ip = clientIp(req);

  const rl = await rateLimit({ key: `pub:schedule:${user.id}`, limit: 30, windowMs: 60 * 1000 });
  if (!rl.ok) {
    return NextResponse.json({ errorFa: "تعداد درخواست بیش از حد مجاز است." }, { status: 429 });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ errorFa: "بدنه درخواست نامعتبر است." }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { errorFa: parsed.error.issues[0]?.message ?? "ورودی نامعتبر است." },
      { status: 400 },
    );
  }
  const { contentId, destinationIds, scheduledAtJalali } = parsed.data;

  // Verify content ownership
  const content = await db.content.findUnique({ where: { id: contentId } });
  if (!content || content.ownerId !== user.id) {
    return NextResponse.json({ errorFa: "محتوا یافت نشد." }, { status: 404 });
  }
  if (!isContentStatus(content.status)) {
    return NextResponse.json({ errorFa: "وضعیت محتوا نامعتبر است." }, { status: 400 });
  }

  // Compute runAtIso (UTC) — "now" yields the current ISO timestamp.
  const runAtIso =
    scheduledAtJalali === "now"
      ? new Date().toISOString()
      : jalaliToUtcIso(
          scheduledAtJalali.jy,
          scheduledAtJalali.jm,
          scheduledAtJalali.jd,
          scheduledAtJalali.hour,
          scheduledAtJalali.minute,
        );

  // Validate state machine: draft → queued/allowed transition
  try {
    assertTransition(content.status, scheduledAtJalali === "now" ? "queued" : "scheduled");
  } catch {
    return NextResponse.json(
      { errorFa: `انتقال وضعیت از «${content.status}» مجاز نیست.` },
      { status: 400 },
    );
  }

  // De-duplicate destination IDs
  const uniqueDestIds = Array.from(new Set(destinationIds));
  // Verify all destinations belong to the user
  const owned = await db.destination.findMany({
    where: { id: { in: uniqueDestIds }, ownerId: user.id, status: { not: "deleted" } },
    select: { id: true },
  });
  if (owned.length !== uniqueDestIds.length) {
    return NextResponse.json(
      { errorFa: "یک یا چند مقصد یافت نشد یا متعلق به شما نیست." },
      { status: 404 },
    );
  }

  // Create one PublishJob per destination with a deterministic idempotency key
  const results: Array<{ destinationId: string; created: boolean; jobId: string }> = [];
  for (const dstId of uniqueDestIds) {
    const idempotencyKey = `${contentId}:${dstId}:${runAtIso}`;
    const r = await schedulePublishJob({
      contentId,
      destinationId: dstId,
      runAtIso,
      idempotencyKey,
    });
    results.push({ destinationId: dstId, created: r.created, jobId: r.jobId });
  }

  // Transition content status: now → queued, scheduled time → scheduled
  const next = scheduledAtJalali === "now" ? "queued" : "scheduled";
  await db.content.update({
    where: { id: contentId },
    data: {
      status: next,
      scheduledAt: scheduledAtJalali === "now" ? null : new Date(runAtIso),
      destinationIds: JSON.stringify(uniqueDestIds),
    },
  });

  // Increment plan usage (publishUsed) on the user's active subscription so the
  // dashboard usage counter reflects real publishes. Best-effort: never blocks.
  try {
    const sub = await db.subscription.findFirst({
      where: { userId: user.id, status: "active" },
      orderBy: { createdAt: "desc" },
    });
    if (sub) {
      const used = safeJsonParse<{ publishUsed?: number; aiUsed?: number }>(sub.usedQuota, { publishUsed: 0 });
      used.publishUsed = (used.publishUsed ?? 0) + uniqueDestIds.length;
      await db.subscription.update({
        where: { id: sub.id },
        data: { usedQuota: JSON.stringify(used) },
      });
    }
  } catch { /* usage tracking is best-effort */ }

  await audit({
    userId: user.id,
    actor: "user",
    action: "publish_schedule",
    targetType: "content",
    targetId: contentId,
    ip,
    meta: {
      destinationCount: uniqueDestIds.length,
      scheduledAtIso: runAtIso,
      mode: scheduledAtJalali === "now" ? "now" : "scheduled",
    },
  });

  // If scheduling for "now", opportunistically run the worker so the user
  // sees immediate delivery without waiting for the next cron tick.
  if (scheduledAtJalali === "now") {
    try {
      const { runWorkerOnce } = await import("@/lib/queue/worker");
      // Fire-and-forget — we don't block the response.
      void runWorkerOnce(5);
    } catch { /* ignore — cron will pick it up */ }
  }

  return NextResponse.json({ ok: true, jobs: results, scheduledAtIso: runAtIso }, { status: 201 });
}
