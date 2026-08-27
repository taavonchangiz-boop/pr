// =====================================================================
// POSTYAR — Publish scheduler
// ---------------------------------------------------------------------
// schedulePublishJob:
//   - If idempotencyKey already exists → return the existing job (no dup).
//   - Otherwise insert a new PublishJob in `queued` state with runAt.
//
// runAt defaults to "now" so the worker can pick it up on the next tick.
// We DO NOT push the content status here — the caller is responsible
// for transitioning Content.status via the state machine.
// =====================================================================
import { db } from "@/lib/db";

export interface ScheduleInput {
  contentId: string;
  destinationId: string;
  runAtIso: string;
  idempotencyKey: string;
  maxAttempts?: number;
}

export interface ScheduleResult {
  created: boolean;
  jobId: string;
  status: string;
}

export async function schedulePublishJob(input: ScheduleInput): Promise<ScheduleResult> {
  const idempotencyKey = input.idempotencyKey.slice(0, 200);
  // Idempotency: if the same key already exists, return the existing job.
  const existing = await db.publishJob.findUnique({
    where: { idempotencyKey },
    select: { id: true, status: true },
  });
  if (existing) {
    return { created: false, jobId: existing.id, status: existing.status };
  }
  const created = await db.publishJob.create({
    data: {
      contentId: input.contentId,
      destinationId: input.destinationId,
      runAt: new Date(input.runAtIso),
      status: "queued",
      maxAttempts: input.maxAttempts ?? 3,
      idempotencyKey,
      attempts: 0,
      lockedAt: null,
      lockedBy: null,
    },
  });
  return { created: true, jobId: created.id, status: created.status };
}

/** Cancel a queued/scheduled job. No-op if already terminal. */
export async function cancelJob(jobId: string): Promise<void> {
  await db.publishJob.updateMany({
    where: { id: jobId, status: { in: ["queued"] } },
    data: { status: "cancelled" },
  });
}
