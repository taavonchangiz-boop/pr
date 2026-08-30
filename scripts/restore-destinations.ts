// One-shot dev DB restore: re-activate the soft-deleted destination used
// during the broadcast empty-state smoke test. Not part of build/lint.
import { db } from "@/lib/db";

async function main() {
  const r = await db.destination.updateMany({
    where: { status: "deleted" },
    data: { status: "active" },
  });
  console.log("restored destinations:", r.count);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => process.exit(0));
