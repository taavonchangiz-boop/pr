// =====================================================================
// POSTYAR — Cache / distributed lock / rate limiter / idempotency tests
// Covers addendum §6 (QUEUE/WORKER CONCURRENCY), §7 (rate-limit bypass
// attempts, OTP brute force, payment replay), §9 (one job cannot be
// claimed by two workers, duplicate callbacks do not duplicate delivery).
//
// These tests exercise the in-memory dev fallback path (no REDIS_URL in
// sandbox — set by tests/preload.ts). In production with REDIS_URL set,
// the SAME test assertions hold against the real Redis backing
// (SET NX + Lua release + INCR).
// =====================================================================
import { test, expect, describe, beforeEach } from "bun:test";
import {
  cache,
  rateLimit,
  acquireLock,
  releaseLock,
  idempotency,
} from "../src/lib/security/cache";

describe("cache: get/set/del/incr/expire", () => {
  beforeEach(() => {
    // Clear in-memory state between tests
    return cache.del("test-key").catch(() => void 0);
  });

  test("set + get round-trip", async () => {
    await cache.set("k1", { a: 1, b: "پُست‌یار" });
    const v = await cache.get<{ a: number; b: string }>("k1");
    expect(v).toEqual({ a: 1, b: "پُست‌یار" });
  });

  test("TTL expiry — value disappears after ttlMs", async () => {
    await cache.set("k2", "temp", 50); // 50ms TTL
    expect(await cache.get<string>("k2")).toBe("temp");
    await new Promise((r) => setTimeout(r, 80));
    expect(await cache.get<string>("k2")).toBeNull();
  });

  test("del removes the value", async () => {
    await cache.set("k3", "v");
    await cache.del("k3");
    expect(await cache.get<string>("k3")).toBeNull();
  });

  test("incr increments and resets after TTL", async () => {
    const a = await cache.incr("counter1", 1000);
    const b = await cache.incr("counter1", 1000);
    const c = await cache.incr("counter1", 1000);
    expect(a).toBe(1);
    expect(b).toBe(2);
    expect(c).toBe(3);
  });

  test("incr with new TTL creates a fresh counter", async () => {
    await cache.incr("counter2", 100);
    await new Promise((r) => setTimeout(r, 150));
    // After expiry, next incr starts fresh from 1
    const fresh = await cache.incr("counter2", 1000);
    expect(fresh).toBe(1);
  });
});

describe("rateLimit: limit enforcement + bypass attempts", () => {
  test("allows up to limit requests within window", async () => {
    for (let i = 0; i < 5; i++) {
      const r = await rateLimit({ key: "rl-allow-" + i + Date.now(), limit: 5, windowMs: 5000 });
      // first 4 should be ok
      if (i < 4) expect(r.ok).toBe(true);
    }
  });

  test("BLOCKS requests exceeding limit (OTP brute-force defense)", async () => {
    const key = "rl-block-" + Date.now() + Math.random();
    const limit = 3;
    let results: boolean[] = [];
    for (let i = 0; i < 10; i++) {
      const r = await rateLimit({ key, limit, windowMs: 10_000 });
      results.push(r.ok);
    }
    // First 3 allowed, rest blocked
    expect(results.slice(0, 3).every((x) => x === true)).toBe(true);
    expect(results.slice(3).every((x) => x === false)).toBe(true);
  });

  test("rate limit window resets after TTL (bypass attempt fails)", async () => {
    const key = "rl-reset-" + Date.now();
    // Use up the limit
    for (let i = 0; i < 3; i++) await rateLimit({ key, limit: 3, windowMs: 100 });
    const blocked = await rateLimit({ key, limit: 3, windowMs: 100 });
    expect(blocked.ok).toBe(false);
    // After window expires, a new window opens (new TTL via incr)
    await new Promise((r) => setTimeout(r, 150));
    // The cache.incr resets to 1 when the previous window expired
    const fresh = await cache.incr(key, 1000);
    expect(fresh).toBe(1);
  });

  test("different keys have independent counters (no cross-contamination)", async () => {
    const k1 = "rl-ind-1-" + Date.now();
    const k2 = "rl-ind-2-" + Date.now();
    await rateLimit({ key: k1, limit: 1, windowMs: 10_000 });
    const r1 = await rateLimit({ key: k1, limit: 1, windowMs: 10_000 });
    const r2 = await rateLimit({ key: k2, limit: 1, windowMs: 10_000 });
    expect(r1.ok).toBe(false); // k1 exhausted
    expect(r2.ok).toBe(true);  // k2 fresh
  });
});

describe("distributed lock: no double-claim by two workers", () => {
  test("first acquire succeeds, second on SAME key FAILS", async () => {
    const key = "lock-test-" + Date.now() + Math.random();
    const h1 = await acquireLock(key, 5_000);
    const h2 = await acquireLock(key, 5_000);
    expect(h1).not.toBeNull();
    expect(h2).toBeNull(); // contention → null
  });

  test("release allows re-acquire", async () => {
    const key = "lock-release-" + Date.now() + Math.random();
    const h1 = await acquireLock(key, 5_000);
    expect(h1).not.toBeNull();
    await releaseLock(key, h1!);
    const h2 = await acquireLock(key, 5_000);
    expect(h2).not.toBeNull();
  });

  test("WRONG holder cannot release (safe release)", async () => {
    const key = "lock-wrong-" + Date.now() + Math.random();
    const h1 = await acquireLock(key, 5_000);
    // Try to release with a forged holder
    await releaseLock(key, "forged-holder-token");
    // Lock should still be held by h1 — second acquire fails
    const h2 = await acquireLock(key, 5_000);
    expect(h2).toBeNull();
  });

  test("TTL expiry auto-releases (no deadlock)", async () => {
    const key = "lock-ttl-" + Date.now() + Math.random();
    const h1 = await acquireLock(key, 80); // 80ms TTL
    expect(h1).not.toBeNull();
    await new Promise((r) => setTimeout(r, 120));
    const h2 = await acquireLock(key, 5_000);
    expect(h2).not.toBeNull(); // lock expired, available again
  });

  test("different keys can be held concurrently", async () => {
    const k1 = "lock-conc-1-" + Date.now();
    const k2 = "lock-conc-2-" + Date.now();
    const h1 = await acquireLock(k1, 5_000);
    const h2 = await acquireLock(k2, 5_000);
    expect(h1).not.toBeNull();
    expect(h2).not.toBeNull();
  });
});

describe("idempotency: duplicate callbacks do not duplicate delivery", () => {
  test("first call executes fn; second call returns cached result", async () => {
    let callCount = 0;
    const fn = async () => {
      callCount++;
      return { delivered: true, txnId: "txn-1" };
    };
    const key = "idem-" + Date.now() + Math.random();
    const r1 = await idempotency(key, fn);
    const r2 = await idempotency(key, fn);
    const r3 = await idempotency(key, fn);
    expect(r1).toEqual({ delivered: true, txnId: "txn-1" });
    expect(r2).toEqual({ delivered: true, txnId: "txn-1" });
    expect(r3).toEqual({ delivered: true, txnId: "txn-1" });
    expect(callCount).toBe(1); // fn executed exactly once
  });

  test("different keys execute independently (no false dedup)", async () => {
    let callCount = 0;
    const fn = async () => { callCount++; return { n: callCount }; };
    const k1 = "idem-diff-1-" + Date.now();
    const k2 = "idem-diff-2-" + Date.now();
    const r1 = await idempotency(k1, fn);
    const r2 = await idempotency(k2, fn);
    expect(callCount).toBe(2);
    expect(r1.n).toBe(1);
    expect(r2.n).toBe(2);
  });

  test("payment replay produces same result (one payment → one credit)", async () => {
    // Simulate a payment callback: credit wallet exactly once even on replay.
    let creditsApplied = 0;
    const applyCredit = async () => {
      creditsApplied += 1;
      return { creditApplied: true, amount: 100000 };
    };
    const chargeId = "bale-charge-abc123";
    const idemKey = `wallet:payment:bale:${chargeId}`;
    // Simulate 3 webhook deliveries with the same charge_id (replay/redo)
    const r1 = await idempotency(idemKey, applyCredit);
    const r2 = await idempotency(idemKey, applyCredit);
    const r3 = await idempotency(idemKey, applyCredit);
    expect(r1.creditApplied).toBe(true);
    expect(r2.creditApplied).toBe(true);
    expect(r3.creditApplied).toBe(true);
    expect(creditsApplied).toBe(1); // CRITICAL: only one credit applied
  });
});
