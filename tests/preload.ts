// Test preload — sets deterministic dev env vars BEFORE any test module
// imports the crypto module (which captures POSTYAR_MASTER_KEY at load
// time). Run automatically by `bun test` via bunfig.toml.
(process.env as Record<string, string | undefined>).NODE_ENV = "test";
process.env.POSTYAR_MASTER_KEY = "a".repeat(64); // 64 hex chars = 32 bytes
process.env.POSTYAR_JWT_SECRET = "j".repeat(48); // >= 32 chars
// Ensure no REDIS_URL in test env so the in-memory fallback path is used
// (the production Redis-backed path is exercised in production via REDIS_URL).
delete process.env.REDIS_URL;
