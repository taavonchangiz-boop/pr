// One-shot dev debug script — count destinations. Not part of build/lint.
import { db } from "@/lib/db";
async function main() {
  const count = await db.destination.count();
  console.log("destinations:", count);
  const list = await db.destination.findMany({ select: { id: true, label: true, provider: true, status: true } });
  console.log(JSON.stringify(list, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => process.exit(0));
