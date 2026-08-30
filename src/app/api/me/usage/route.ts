// POSTYAR — GET /api/me/usage
// Plan usage snapshot for the signed-in user: the active plan's quotas vs.
// consumed amounts + remaining days. Powers the dashboard "consumption
// counter" widget (remaining days / posts / AI / channels).
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, AuthError, safeJsonParse } from "@/lib/server/auth";

export async function GET() {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    return NextResponse.json({ errorFa: (e as AuthError).message }, { status: (e as AuthError).status });
  }

  try {
    const now = Date.now();
    const [sub, destinationsCount] = await Promise.all([
      db.subscription.findFirst({
        where: { userId: user.id, status: "active" },
        include: { plan: true },
        orderBy: { createdAt: "desc" },
      }),
      db.destination.count({ where: { ownerId: user.id, status: { not: "deleted" } } }),
    ]);

    if (!sub || !sub.plan) {
      return NextResponse.json({
        hasActivePlan: false,
        planName: null,
        remainingDays: 0,
        publishUsed: 0,
        publishQuota: 0,
        aiUsed: 0,
        aiQuota: 0,
        channelsUsed: destinationsCount,
        channelsQuota: 0,
        endsAt: null,
      });
    }

    const used = safeJsonParse<{ publishUsed?: number; aiUsed?: number }>(sub.usedQuota, { publishUsed: 0 });
    const quota = safeJsonParse<{ publishPerMonth?: number; aiPerMonth?: number; channels?: number }>(sub.plan.quota ?? null, {});

    const remainingDays = Math.max(0, Math.ceil((sub.endsAt.getTime() - now) / (24 * 60 * 60 * 1000)));

    return NextResponse.json({
      hasActivePlan: true,
      planName: sub.plan.nameFa,
      intervalMonths: sub.plan.intervalMonths,
      remainingDays,
      publishUsed: used.publishUsed ?? 0,
      publishQuota: quota.publishPerMonth ?? 0,
      aiUsed: used.aiUsed ?? 0,
      aiQuota: quota.aiPerMonth ?? 0,
      channelsUsed: destinationsCount,
      channelsQuota: quota.channels ?? 0,
      endsAt: sub.endsAt.toISOString(),
    });
  } catch (e) {
    return NextResponse.json({ errorFa: "خطا در خواندن مصرف پلن.", detail: String(e) }, { status: 500 });
  }
}
