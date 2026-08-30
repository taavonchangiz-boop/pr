// One-shot dev DB backfill — promote the earliest-created admin to be the
// super-admin if no super-admin exists yet. Idempotent. Not part of the
// build/lint pipeline.
import { db } from "@/lib/db";

async function main() {
  const existing = await db.user.findFirst({
    where: { isSuperAdmin: true },
    select: { id: true, email: true },
  });
  if (existing) {
    console.log("super-admin already exists:", existing.email);
    return;
  }
  const earliestAdmin = await db.user.findFirst({
    where: { role: "admin" },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, createdAt: true },
  });
  if (!earliestAdmin) {
    console.log("no admins found — nothing to backfill.");
    return;
  }
  await db.user.update({
    where: { id: earliestAdmin.id },
    data: { isSuperAdmin: true },
  });
  console.log("promoted:", earliestAdmin.email);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => process.exit(0));
