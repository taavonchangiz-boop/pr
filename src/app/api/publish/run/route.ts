// POSTYAR — POST /api/publish/run
// Protected by cron secret header `x-postyar-cron-secret`. Runs the
// worker once and returns the summary. Passenger cron-compatible: just
// an HTTP endpoint, no special scheduling daemon required.
import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/server/cron-secret";
import { runWorkerOnce } from "@/lib/queue/worker";

export async function POST(req: Request) {
  const authed = await requireCronSecret(req);
  if (!authed.ok) {
    return NextResponse.json({ errorFa: authed.errorFa }, { status: 401 });
  }
  const batch = Number(new URL(req.url).searchParams.get("batch")) || 5;
  const summary = await runWorkerOnce(batch);
  return NextResponse.json({ ok: true, summary });
}

export async function GET(req: Request) {
  // GET-friendly variant for cron services that don't allow POST.
  return POST(req);
}
