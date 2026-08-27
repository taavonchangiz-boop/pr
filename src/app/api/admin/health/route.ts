// POSTYAR — /api/admin/health (GET)
// Pings db, queue, storage, AI provider config presence, gold provider
// presence, sms/email presence, redis-shim marker.
import { NextResponse } from "next/server";
import { requireRole, AuthError } from "@/lib/server/auth";
import { db } from "@/lib/db";
import { isRedis } from "@/lib/security/cache";
import { listProviderStatus } from "@/lib/providers/ai";
import { maskToken } from "@/lib/persian";
import { formatJalaliDateTime } from "@/lib/persian";
import path from "node:path";
import fs from "node:fs";

type Status = "ok" | "warn" | "down";
interface Check { component: string; status: Status; message?: string; }

export async function GET() {
  let user;
  try { user = await requireRole(["admin"]); } catch (e) {
    return NextResponse.json({ errorFa: (e as AuthError).message }, { status: (e as AuthError).status });
  }
  void user;
  const checks: Check[] = [];

  // DB
  try {
    await db.$queryRaw`SELECT 1`;
    checks.push({ component: "db", status: "ok" });
  } catch (e) {
    checks.push({ component: "db", status: "down", message: e instanceof Error ? e.message : "خطای پایگاه داده" });
  }

  // Queue (in-memory shim)
  try {
    const { acquireLock, releaseLock } = await import("@/lib/security/cache");
    const holder = await acquireLock("health:probe", 5_000);
    if (holder) {
      await releaseLock("health:probe", holder);
      checks.push({ component: "queue", status: "ok", message: isRedis ? "redis" : "memory-shim" });
    } else {
      checks.push({ component: "queue", status: "warn", message: "lock held" });
    }
  } catch (e) {
    checks.push({ component: "queue", status: "down", message: e instanceof Error ? e.message : "queue error" });
  }

  // Storage
  try {
    const storageDir = path.resolve(process.cwd(), "storage");
    if (fs.existsSync(storageDir)) {
      checks.push({ component: "storage", status: "ok", message: storageDir });
    } else {
      checks.push({ component: "storage", status: "warn", message: "storage dir missing" });
    }
  } catch (e) {
    checks.push({ component: "storage", status: "down", message: e instanceof Error ? e.message : "storage error" });
  }

  // AI providers
  try {
    const list = await listProviderStatus();
    const configuredCount = list.filter((p) => p.available).length;
    checks.push({
      component: "ai",
      status: configuredCount > 0 ? "ok" : "warn",
      message: `${configuredCount} از ${list.length} ارائه‌دهنده فعال (postyar-zai همیشه فعال است)`,
    });
  } catch (e) {
    checks.push({ component: "ai", status: "down", message: e instanceof Error ? e.message : "ai error" });
  }

  // Gold provider
  const goldUrl = process.env.POSTYAR_GOLD_PROVIDER_URL ?? "";
  checks.push({
    component: "gold",
    status: goldUrl ? "ok" : "warn",
    message: goldUrl ? maskToken(goldUrl) : "غیرفعال",
  });

  // SMS provider
  const smsProvider = process.env.POSTYAR_SMS_PROVIDER ?? "";
  checks.push({
    component: "sms",
    status: smsProvider ? "ok" : "warn",
    message: smsProvider || "غیرفعال",
  });

  // Email
  const smtpHost = process.env.POSTYAR_SMTP_HOST ?? "";
  checks.push({
    component: "email",
    status: smtpHost ? "ok" : "warn",
    message: smtpHost || "غیرفعال (dev preview)",
  });

  // Redis shim marker
  checks.push({
    component: "redis-shim",
    status: isRedis ? "ok" : "warn",
    message: isRedis ? "redis active" : "memory shim active (single-process)",
  });

  const overall: Status = checks.some((c) => c.status === "down") ? "down"
    : checks.some((c) => c.status === "warn") ? "warn" : "ok";

  // Persist a row
  try {
    await db.healthCheck.create({
      data: {
        component: "overall",
        status: overall,
        message: checks.map((c) => `${c.component}=${c.status}`).join(","),
        checkedAt: new Date(),
      },
    });
  } catch {
    // best-effort
  }

  return NextResponse.json({
    overall,
    checkedAtFa: formatJalaliDateTime(new Date(), { withTime: true }),
    checks,
  });
}
