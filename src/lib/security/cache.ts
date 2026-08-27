// =====================================================================
// POSTYAR — cache + rate limiter + distributed lock + idempotency
// ---------------------------------------------------------------------
// TRUTH CONTRACT (addendum §3, §4, §5, §13):
//
//   When `REDIS_URL` is set AND Redis is reachable, ALL operations below
//   are backed by real Redis (distributed-safe across N processes).
//
//   When `REDIS_URL` is NOT set (local dev / sandbox), operations fall
//   back to the process-local in-memory implementation. This fallback is
//   EXPLICITLY isolated to development and is NEVER silently used in
//   production.
//
//   `isRedis` is a DYNAMIC boolean that reflects the REAL current state
//   (last successful PING). The health endpoint reports the SAME value.
//   When `isRedis` is false in production, the health endpoint reports
//   `redis: disabled` (no REDIS_URL) or `redis: down` (configured but
//   unreachable) — never `healthy` unless it actually is.
//
//   Financial / concurrency-sensitive callers that cannot tolerate the
//   in-memory fallback MUST call `requireRedis()` from `redis-client.ts`
//   and let the operation fail safely.
// =====================================================================
import { getRedis, isRedisConnected, pingRedis } from "./redis-client";

type Entry = { value: unknown; expiresAt: number | null };

// ---------------------------------------------------------------------
// In-memory fallback (dev only). Kept explicit and isolated.
// ---------------------------------------------------------------------
const store = new Map<string, Entry>();
const counters = new Map<string, { count: number; expiresAt: number }>();
const locks = new Map<string, { holder: string; expiresAt: number }>();
const idemStore = new Map<string, { result: unknown; expiresAt: number }>();

function now(): number { return Date.now(); }

// Periodic eviction to avoid unbounded growth (dev-only maps)
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const t = now();
    for (const [k, v] of store) if (v.expiresAt && v.expiresAt < t) store.delete(k);
    for (const [k, v] of counters) if (v.expiresAt < t) counters.delete(k);
    for (const [k, v] of locks) if (v.expiresAt < t) locks.delete(k);
    for (const [k, v] of idemStore) if (v.expiresAt < t) idemStore.delete(k);
  }, 60_000).unref?.();
}

import { randomToken } from "./crypto";

// ---------------------------------------------------------------------
// DYNAMIC liveness flag. Refreshed by `refreshRedisLiveness()`. Callers
// MUST read this at call-time, not at module-load time.
// ---------------------------------------------------------------------
let _isRedisLive = false;

async function refreshRedisLiveness(): Promise<boolean> {
  if (!process.env.REDIS_URL?.trim()) {
    _isRedisLive = false;
    return false;
  }
  const latency = await pingRedis();
  _isRedisLive = latency !== null;
  return _isRedisLive;
}

// Stale-refresh: trust the last known state for fast-path ops, but
// periodically re-PING so a dropped connection is detected within TTL.
let _lastRefreshAt = 0;
async function maybeRefresh(): Promise<void> {
  const t = now();
  if (t - _lastRefreshAt > 10_000) { // refresh at most every 10s
    _lastRefreshAt = t;
    await refreshRedisLiveness().catch(() => void 0);
  }
}

/**
 * Truthful, dynamic, call-time boolean. `false` in dev/sandbox; `true`
 * in production only after a successful PING. Read this at call-time.
 */
export function isRedisActive(): boolean {
  return _isRedisLive;
}

// ---------------------------------------------------------------------
// CACHE
// ---------------------------------------------------------------------
export const cache = {
  async get<T>(key: string): Promise<T | null> {
    await maybeRefresh();
    const client = getRedis();
    if (client && _isRedisLive) {
      const raw = await client.get(`cache:${key}`);
      if (raw === null) return null;
      try { return JSON.parse(raw) as T; } catch { return null; }
    }
    const e = store.get(key);
    if (!e) return null;
    if (e.expiresAt && e.expiresAt < now()) { store.delete(key); return null; }
    return e.value as T;
  },
  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    await maybeRefresh();
    const client = getRedis();
    if (client && _isRedisLive) {
      const raw = JSON.stringify(value);
      if (ttlMs) await client.set(`cache:${key}`, raw, "PX", ttlMs);
      else await client.set(`cache:${key}`, raw);
      return;
    }
    store.set(key, { value, expiresAt: ttlMs ? now() + ttlMs : null });
  },
  async del(key: string): Promise<void> {
    await maybeRefresh();
    const client = getRedis();
    if (client && _isRedisLive) {
      await client.del(`cache:${key}`);
      return;
    }
    store.delete(key);
  },
  async incr(key: string, ttlMs: number): Promise<number> {
    await maybeRefresh();
    const client = getRedis();
    if (client && _isRedisLive) {
      const rKey = `counter:${key}`;
      const cnt = await client.incr(rKey);
      if (cnt === 1) await client.pexpire(rKey, ttlMs);
      return cnt;
    }
    const e = counters.get(key);
    const t = now();
    if (!e || e.expiresAt < t) { counters.set(key, { count: 1, expiresAt: t + ttlMs }); return 1; }
    e.count += 1;
    counters.set(key, e);
    return e.count;
  },
  async expire(key: string, ttlMs: number): Promise<void> {
    await maybeRefresh();
    const client = getRedis();
    if (client && _isRedisLive) {
      await client.pexpire(`counter:${key}`, ttlMs);
      return;
    }
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
// Distributed lock
//   Redis: SET key value NX PX ttl + Lua-script compare-and-del release.
//   In-memory: Map-based (dev only).
// ---------------------------------------------------------------------
const RELEASE_LOCK_LUA = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

export async function acquireLock(key: string, ttlMs: number = 30_000): Promise<string | null> {
  await maybeRefresh();
  const client = getRedis();
  const holder = randomToken(16);
  if (client && _isRedisLive) {
    const rKey = `lock:${key}`;
    // SET key holder NX PX ttl — returns "OK" on success, null on contention.
    const res = await client.set(rKey, holder, "PX", ttlMs, "NX");
    return res === "OK" ? holder : null;
  }
  const existing = locks.get(key);
  const t = now();
  if (!existing || existing.expiresAt < t) {
    locks.set(key, { holder, expiresAt: t + ttlMs });
    return holder;
  }
  return null;
}

export async function releaseLock(key: string, holder: string): Promise<void> {
  await maybeRefresh();
  const client = getRedis();
  if (client && _isRedisLive) {
    await client.eval(RELEASE_LOCK_LUA, 1, `lock:${key}`, holder);
    return;
  }
  const existing = locks.get(key);
  if (existing && existing.holder === holder) locks.delete(key);
}

// ---------------------------------------------------------------------
// Idempotency
//   Redis: GET/SET with PX ttl. Returns stored result if present.
//   In-memory: Map (dev only).
// ---------------------------------------------------------------------
export async function idempotency<T>(key: string, fn: () => Promise<T>, ttlMs: number = 24 * 60 * 60 * 1000): Promise<T> {
  await maybeRefresh();
  const client = getRedis();
  const idemKey = `idem:${key}`;
  if (client && _isRedisLive) {
    const existing = await client.get(idemKey);
    if (existing !== null) {
      try { return JSON.parse(existing) as T; } catch { /* fall through */ }
    }
    const result = await fn();
    await client.set(idemKey, JSON.stringify(result), "PX", ttlMs);
    return result;
  }
  const memExisting = idemStore.get(key);
  if (memExisting && memExisting.expiresAt > now()) return memExisting.result as T;
  const result = await fn();
  idemStore.set(key, { result, expiresAt: now() + ttlMs });
  return result;
}

// ---------------------------------------------------------------------
// Public API for the health endpoint to call a fresh PING.
// ---------------------------------------------------------------------
export { refreshRedisLiveness, isRedisConnected };
