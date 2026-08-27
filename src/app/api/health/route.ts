// POSTYAR — GET /api/health
// Returns { app, db, queue, worker, time }. DB ping via db.user.count().
// Queue depth + worker heartbeat derived from PublishJob counts.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { workerQueueDepth } from "@/lib/queue/worker";
import { STORAGE_ROOT } from "@/lib/storage";
import fs from "node:fs/promises";

export async function GET() {
  const checks: Record<string, "ok" | "warn" | "down"> = {};
  let dbOk: "ok" | "down" = "down";
  try {
    await db.user.count();
    dbOk = "ok";
  } catch {
    dbOk = "down";
  }
  checks.db = dbOk;

  let storageOk: "ok" | "warn" | "down" = "down";
  try {
    await fs.access(STORAGE_ROOT);
    storageOk = "ok";
  } catch {
    storageOk = "down";
  }
  checks.storage = storageOk;

  let queueStatus: "ok" | "warn" | "down" = "down";
  try {
    const q = await workerQueueDepth();
    queueStatus = q.processing > 5 ? "warn" : "ok";
  } catch {
    queueStatus = "down";
  }
  checks.queue = queueStatus;
  checks.worker = queueStatus; // same backing store
  checks.app = "ok";

  return NextResponse.json({
    app: "ok",
    db: dbOk,
    storage: storageOk,
    queue: queueStatus,
    worker: queueStatus,
    time: new Date().toISOString(),
    checks,
  });
}
