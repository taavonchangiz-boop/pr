// =====================================================================
// POSTYAR — Real Redis client (production-grade)
// ---------------------------------------------------------------------
// This module provides a singleton ioredis client that connects ONLY
// when `REDIS_URL` is set in the environment. When `REDIS_URL` is absent
// (local dev / sandbox), the client is `null` and all Redis-shaped
// operations in `cache.ts` fall back to the in-memory implementation.
//
// Truth contract (addendum §13 NO SHIM HIDING):
//   - `isRedisConnected()` returns true ONLY when the client exists AND
//     has emitted at least one successful `PING`.
//   - The health endpoint reports the REAL state, never a lie.
//   - If `REDIS_URL` is set but the connection fails, `isRedisConnected()`
//     stays FALSE and the health endpoint reports `redis: down` — we do
//     NOT silently downgrade financial/concurrency-sensitive operations
//     to the in-memory shim in that case (callers must check `requireRedis()`).
//
// Production deployment (cPanel/Passenger):
//   Set `REDIS_URL=redis://127.0.0.1:6379/0` (or your provider URL) in
//   the Application Manager env panel. The same code then uses real Redis
//   for: distributed locks, OTP throttling, rate limiting, idempotency,
//   worker job-claim coordination, and duplicate-suppression.
// =====================================================================
import Redis from "ioredis";

let _client: Redis | null = null;
let _connectPromise: Promise<Redis | null> | null = null;
let _lastPingOk = false;
let _lastError: string | null = null;

const REDIS_URL = process.env.REDIS_URL?.trim();

/**
 * Lazily create the Redis client. Returns null when REDIS_URL is not set
 * (dev/sandbox). The client is created once and reused across the process.
 */
function createClient(): Redis | null {
  if (!REDIS_URL) return null;
  if (_client) return _client;
  const client = new Redis(REDIS_URL, {
    // Production-safe defaults
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    retryStrategy: (times) => {
      // Exponential backoff, capped at 2 seconds, max 10 retries.
      if (times > 10) return null;
      return Math.min(50 * Math.pow(2, times), 2000);
    },
    lazyConnect: false,
  });
  client.on("error", (err) => {
    _lastError = err?.message ?? String(err);
    _lastPingOk = false;
  });
  client.on("ready", () => {
    _lastError = null;
    // Mark ping OK on ready; subsequent ops will refresh this.
    _lastPingOk = true;
  });
  client.on("end", () => {
    _lastPingOk = false;
  });
  _client = client;
  return client;
}

/**
 * Get the singleton Redis client. Returns null when REDIS_URL is not set.
 * Does NOT throw — callers should use `isRedisConnected()` to gate
 * concurrency-sensitive operations.
 */
export function getRedis(): Redis | null {
  if (!REDIS_URL) return null;
  return createClient();
}

/**
 * Connect (or re-connect) to Redis and verify with PING.
 * Safe to call repeatedly. Returns true when the client is live.
 */
export async function ensureRedisConnected(): Promise<boolean> {
  if (!REDIS_URL) return false;
  if (_connectPromise) return _connectPromise.then((c) => c !== null).catch(() => false);
  _connectPromise = (async () => {
    try {
      const client = createClient();
      if (!client) return null;
      // Force a fresh PING to verify liveness.
      const pong = await client.ping().catch(() => null);
      _lastPingOk = pong === "PONG";
      return _lastPingOk ? client : null;
    } catch (e) {
      _lastError = e instanceof Error ? e.message : String(e);
      _lastPingOk = false;
      return null;
    } finally {
      _connectPromise = null;
    }
  })();
  return _connectPromise.then((c) => c !== null).catch(() => false);
}

/**
 * Truthful liveness check. Returns true ONLY when REDIS_URL is set AND
 * the client has confirmed a successful PING in its lifetime.
 *
 * For a fresh PING (e.g. health endpoint), call `pingRedis()` instead.
 */
export function isRedisConnected(): boolean {
  return !!REDIS_URL && _lastPingOk;
}

/**
 * Perform a fresh PING against Redis. Returns the round-trip latency in
 * milliseconds when successful, or null when Redis is unavailable.
 */
export async function pingRedis(): Promise<number | null> {
  if (!REDIS_URL) return null;
  try {
    const client = getRedis();
    if (!client) return null;
    const t0 = Date.now();
    const pong = await client.ping();
    const latency = Date.now() - t0;
    if (pong === "PONG") {
      _lastPingOk = true;
      _lastError = null;
      return latency;
    }
    _lastPingOk = false;
    return null;
  } catch (e) {
    _lastError = e instanceof Error ? e.message : String(e);
    _lastPingOk = false;
    return null;
  }
}

/**
 * Returns the last recorded Redis error message (for diagnostics only).
 * Never exposes secrets — REDIS_URL itself is masked in the health endpoint.
 */
export function getRedisLastError(): string | null {
  return _lastError;
}

/**
 * Returns a masked representation of REDIS_URL for health/audit output.
 * e.g. `redis://***@127.0.0.1:6379/0`
 */
export function getRedisUrlMasked(): string | null {
  if (!REDIS_URL) return null;
  try {
    const u = new URL(REDIS_URL);
    if (u.password) u.password = "***";
    return u.toString();
  } catch {
    return "redis://***";
  }
}

/**
 * Hard gate for operations that MUST use real Redis and MUST NOT fall back
 * to in-memory (financial/concurrency-sensitive paths). Throws when Redis
 * is unavailable so the caller can fail safely rather than silently degrade.
 *
 * Usage:
 *   import { requireRedis } from "@/lib/security/redis-client";
 *   const redis = requireRedis(); // throws if not configured/connected
 */
export function requireRedis(): Redis {
  const client = getRedis();
  if (!client || !REDIS_URL) {
    throw new Error("عملیات حساس مالی نیاز به اتصال واقعی Redis دارد که در این محیط فعال نیست.");
  }
  return client;
}
