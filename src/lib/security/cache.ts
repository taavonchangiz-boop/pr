// =====================================================================
// POSTYAR in-memory cache + rate limiter + lock + queue (Redis-shaped)
// ---------------------------------------------------------------------
// In production (cPanel/Passenger), the same interface is backed by
// the real Redis. See src/lib/queue/redis-shim.ts for the swap path.
// In-memory implementations are process-local; for multi-worker
// correctness in production, switch to Redis (one-line swap).
// =====================================================================
type Entry = { value: unknown; expiresAt: number | null };

const store = new Map<string, Entry>();
const counters = new Map<string, { count: number; expiresAt: number }>();
const locks = new Map<string, { holder: string; expiresAt: number }>();

function now(): number { return Date.now(); }

// Periodic eviction to avoid unbounded growth
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const t = now();
    for (const [k, v] of store) if (v.expiresAt && v.expiresAt < t) store.delete(k);
    for (const [k, v] of counters) if (v.expiresAt < t) counters.delete(k);
    for (const [k, v] of locks) if (v.expiresAt < t) locks.delete(k);
  }, 60_000).unref?.();
}

export const cache = {
  async get<T>(key: string): Promise<T | null> {
    const e = store.get(key);
    if (!e) return null;
    if (e.expiresAt && e.expiresAt < now()) { store.delete(key); return null; }
    return e.value as T;
  },
  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    store.set(key, { value, expiresAt: ttlMs ? now() + ttlMs : null });
  },
  async del(key: string): Promise<void> { store.delete(key); },
  async incr(key: string, ttlMs: number): Promise<number> {
    const e = counters.get(key);
    const t = now();
    if (!e || e.expiresAt < t) { counters.set(key, { count: 1, expiresAt: t + ttlMs }); return 1; }
    e.count += 1;
    counters.set(key, e);
    return e.count;
  },
  async expire(key: string, ttlMs: number): Promise<void> {
    const e = counters.get(key);
    if (e) { e.expiresAt = now() + ttlMs; counters.set(key, e); }
  },
};

// ---------------------------------------------------------------------
// Sliding + fixed rate limit
// ---------------------------------------------------------------------
export async function rateLimit(opts: {
  key: string;
  limit: number;
  windowMs: number;
}): Promise<{ ok: boolean; count: number; resetMs: number }> {
  const count = await cache.incr(opts.key, opts.windowMs);
  const resetMs = opts.windowMs;
  return { ok: count <= opts.limit, count, resetMs };
}

// ---------------------------------------------------------------------
// Distributed lock (single-process for dev; Redis lock in prod)
// ---------------------------------------------------------------------
export async function acquireLock(key: string, ttlMs: number = 30_000): Promise<string | null> {
  const holder = randomToken(16);
  const existing = locks.get(key);
  const t = now();
  if (!existing || existing.expiresAt < t) {
    locks.set(key, { holder, expiresAt: t + ttlMs });
    return holder;
  }
  return null;
}

export async function releaseLock(key: string, holder: string): Promise<void> {
  const existing = locks.get(key);
  if (existing && existing.holder === holder) locks.delete(key);
}

import { randomToken } from "./crypto";

// ---------------------------------------------------------------------
// Idempotency helper: if the key exists, return stored result; otherwise
// store the result for TTL.
// ---------------------------------------------------------------------
const idemStore = new Map<string, { result: unknown; expiresAt: number }>();

export async function idempotency<T>(key: string, fn: () => Promise<T>, ttlMs: number = 24 * 60 * 60 * 1000): Promise<T> {
  const existing = idemStore.get(key);
  if (existing && existing.expiresAt > now()) return existing.result as T;
  const result = await fn();
  idemStore.set(key, { result, expiresAt: now() + ttlMs });
  return result;
}

// ---------------------------------------------------------------------
// Redis-shaped shim marker. In production, swap implementations here.
// ---------------------------------------------------------------------
export const isRedis = false;
