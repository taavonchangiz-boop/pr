// One-shot dev debug script — read-only. Lists all admin users and shows
// their `isSuperAdmin` flag. Not part of the build/lint pipeline.
import { db } from "@/lib/db";

async function main() {
  const admins = await db.user.findMany({
    where: { role: "admin" },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, role: true, isSuperAdmin: true, createdAt: true },
  });
  console.log(JSON.stringify(admins, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => process.exit(0));
