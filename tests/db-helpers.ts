// =====================================================================
// POSTYAR — DB-backed test helpers (shared across tests/db-*.test.ts)
// ---------------------------------------------------------------------
// Provides resetDb() + seedUser() + seedOrder() against the test SQLite
// DB (db/test.db — see tests/preload.ts). All tables are truncated in
// beforeEach so tests are isolated. NO @ts-ignore, NO `any`.
// =====================================================================
import { db } from "../src/lib/db";
import { randomToken } from "../src/lib/security/crypto";
import type { User, Order } from "@prisma/client";

/**
 * Truncate every table in the test DB. Foreign keys are disabled for the
 * connection so deletion order does not matter. Runs synchronously on the
 * single-writer connection (connection_limit=1 in preload.ts).
 */
export async function resetDb(): Promise<void> {
  await db.$executeRawUnsafe("PRAGMA foreign_keys=OFF");
  const tables = (await db.$queryRawUnsafe<{ name: string }[]>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma_%'`,
  )) as { name: string }[];
  for (const t of tables) {
    // table names come from sqlite_master; safe to interpolate (no user input)
    await db.$executeRawUnsafe(`DELETE FROM "${t.name}"`);
  }
  // Re-enable FK for the lib code path (matches production behavior)
  await db.$executeRawUnsafe("PRAGMA foreign_keys=ON");
}

/**
 * Insert a user with a unique email + mobile + referralCode. Role/status
 * default to "user"/"active" unless overridden.
 */
export async function seedUser(opts: Partial<Pick<User, "role" | "status" | "email" | "mobile" | "firstName" | "lastName">> = {}): Promise<User> {
  const suffix = randomToken(6).toLowerCase();
  return db.user.create({
    data: {
      email: opts.email ?? `user-${suffix}@test.postyar.local`,
      mobile: opts.mobile ?? `0912${suffix.slice(0, 7).padEnd(7, "0")}`,
      passwordHash: "$2a$12$dummyhashfor-tests-only-not-real",
      firstName: opts.firstName ?? "نام",
      lastName: opts.lastName ?? "نام‌خانوادگی",
      activityType: "personal",
      businessName: "",
      role: opts.role ?? "user",
      status: opts.status ?? "active",
      referralCode: `T${suffix.toUpperCase()}`,
    },
  });
}

/**
 * Insert an order (kind=wallet_credit by default) owned by `userId`.
 */
export async function seedOrder(userId: string, amountRials: number, opts: Partial<Order> = {}): Promise<Order> {
  return db.order.create({
    data: {
      userId,
      kind: opts.kind ?? "wallet_credit",
      amountRials,
      descriptionFa: opts.descriptionFa ?? "سفارش تستی",
      status: opts.status ?? "pending",
      provider: opts.provider ?? null,
      providerRef: opts.providerRef ?? null,
      idempotencyKey: `order-${randomToken(8)}`,
      metadata: "{}",
    },
  });
}

/**
 * Insert a Bot owned by `userId`. Used by bot-linking tests.
 */
export async function seedBot(userId: string, provider: "telegram" | "bale" | "rubika" = "telegram"): Promise<{ id: string; ownerId: string; provider: string }> {
  const b = await db.bot.create({
    data: {
      ownerId: userId,
      provider,
      name: "بات تستی",
      botTokenEnc: "dummy-ciphertext-not-real",
      status: "active",
      config: "{}",
    },
    select: { id: true, ownerId: true, provider: true },
  });
  return b;
}

/**
 * Wait for `ms` milliseconds (used in expiry tests).
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
