# POSTYAR — Test Plan (Next Tier: DB-Backed Tests)

This document specifies the DB-backed automated tests that are NOT yet in
the executable suite (`tests/*.test.ts`) but are required by addendum
§6–§12 for full coverage. The current executable suite (101 tests across
4 files) covers the pure-function + cache tier. This document is the
contract for the next tier.

## Setup procedure for DB-backed tests

```bash
# 1. Create a throwaway test database (SQLite for sandbox parity)
cp prisma/schema.prisma prisma/schema.test.prisma
# Edit schema.test.prisma: change datasource to sqlite-test, url to file:./db/test.db
# 2. Push the test schema
bunx prisma db push --schema prisma/schema.test.prisma --skip-generate
# 3. Run with the test DATABASE_URL
DATABASE_URL="file:./db/test.db" bun test tests/db-*.test.ts
```

Each test file must use a transaction that rolls back, OR truncate all
tables in `beforeEach`, to keep tests isolated.

---

## §6 Required areas — DB-backed test cases

### AUTHENTICATION + OTP
- [ ] `requestOtp` creates an Otp row with expiresAt = now + 2min
- [ ] `requestOtp` rejects within 60s resend cooldown
- [ ] `requestOtp` rate-limits to 5/hour per mobile
- [ ] `verifyOtp` succeeds with correct code
- [ ] `verifyOtp` rejects wrong code, increments attempts
- [ ] `verifyOtp` locks after 5 wrong attempts (OTP_MAX_ATTEMPTS)
- [ ] `verifyOtp` rejects expired OTP (expiresAt < now)
- [ ] `verifyOtp` rejects already-used OTP (usedAt != null)
- [ ] `verifyOtp` IP rate-limits to 30/15min per IP
- [ ] OTP replay (same code twice) rejected on second use

### AUTHORIZATION
- [ ] `requireUser()` throws 401 when no session cookie
- [ ] `requireUser()` throws 401 when session expired
- [ ] `requireUser()` throws 403 when user suspended
- [ ] `requireRole(["admin"])` throws 403 for role=user
- [ ] `requireRole(["admin","support"])` allows role=support
- [ ] Session cookie with wrong `tokenHash` rejected (rotated session)
- [ ] Password change revokes all other sessions

### CONTENT OWNERSHIP (IDOR/BOLA defense)
- [ ] GET `/api/content/[id]` by non-owner → 403
- [ ] PATCH `/api/content/[id]` by non-owner → 403
- [ ] DELETE `/api/content/[id]` by non-owner → 403
- [ ] GET by owner → 200
- [ ] Admin GET any content → 200

### PUBLISHING STATE MACHINE + IDEMPOTENCY
- [ ] `schedulePublishJob` with duplicate `idempotencyKey` returns existing job (created:false)
- [ ] `runWorkerOnce` does NOT claim a job locked by another holder
- [ ] `runWorkerOnce` rejects cancelled jobs (status != queued)
- [ ] Failed job retries up to maxAttempts then status=failed (no infinite loop)
- [ ] Exponential backoff: runAt = now + min(2^attempts * 30s, 30min)
- [ ] Duplicate webhook callback does not duplicate delivery (idempotency key)

### PAYMENT — CARD-TO-CARD
- [ ] `POST /api/orders` (card-to-card) creates Order + CardTransferReceipt
- [ ] Admin approve sets Order.status=paid, posts WalletTxn + LedgerEntry once
- [ ] Approve twice (idempotency) does NOT create second credit (`updateMany WHERE status != approved`)
- [ ] Amount tampering: receipt.amount != order.amountRials → rejected
- [ ] Non-owner accessing `/api/orders/[id]` → 403

### PAYMENT — BALE (addendum §10)
- [ ] Valid `successful_payment` callback → Order.paid, WalletTxn credit, Subscription active
- [ ] Invalid order (orderId doesn't exist) → rejected, no state change
- [ ] Amount tampering (callback total != order.amountRials) → rejected
- [ ] Forged signature → rejected
- [ ] Replayed `update_id` → idempotent (no second credit)
- [ ] Duplicate `charge_id` → idempotent (UNIQUE constraint)
- [ ] Concurrent callbacks (two parallel requests) → exactly one credit
- [ ] Failed transaction: status stays pending, no WalletTxn posted
- [ ] Ledger entry has matching orderId + amountRials (auditable)

### PAYMENT — BANK GATEWAY
- [ ] `bankCreatePayment` returns HMAC state token with 10-min TTL
- [ ] Bank callback with wrong HMAC state → rejected
- [ ] Bank callback with expired state (>10min) → rejected
- [ ] Server-to-server verify: hard amount check
- [ ] Idempotent finalize (no double-credit on callback retry)

### WALLET + LEDGER (addendum §8)
- [ ] One payment cannot create two credits (idempotency at cache + DB layer)
- [ ] One callback cannot finalize twice
- [ ] Concurrent wallet mutation: 10 parallel `adminAdjustWallet` calls → balance = sum of all
- [ ] Amount tampering rejected
- [ ] Order ownership enforced (non-owner cannot query order)
- [ ] Ledger remains auditable (every WalletTxn has a matching LedgerEntry)
- [ ] Exact monetary arithmetic: amountRials stored as integer (Prisma BigInt/Int), no float
- [ ] `getBalance` derived from `WalletTxn` SUM (no mutable balance column)

### REFERRAL (addendum §8)
- [ ] One referral cannot create duplicate rewards (`ReferralReward.referredId @unique`)
- [ ] Self-referral rejected (referrerId == referredId)
- [ ] Referral percent applied correctly
- [ ] Referral cap enforced (POSTYAR_REFERRAL_CAP_RIALS)
- [ ] Reward posted to WalletTxn exactly once

### DISCOUNT
- [ ] `recordUsage` atomic (`DiscountUsage @@unique([discountId, userId])`)
- [ ] Expired discount rejected (expiresAt < now)
- [ ] Exhausted discount (maxUses reached) rejected
- [ ] Non-applicable plan rejected

### MEDIA UPLOAD (addendum §26)
- [ ] Valid image → validate → optimize → convert WebP → save only WebP (original deleted)
- [ ] Malicious file (PE/ELF/Mach-O magic bytes) rejected
- [ ] Oversized upload (> limit) rejected
- [ ] Invalid MIME rejected
- [ ] Path traversal attempt (../ in filename) rejected
- [ ] Video size + MIME validation
- [ ] Server enforces same limit as client

### BOT BUILDER (addendum §11)
- [ ] Bot creation: POST /api/bots creates Bot with AES-encrypted token
- [ ] Ownership: non-owner GET/PATCH/DELETE → 403
- [ ] Provider selection: telegram/bale/rubika enforced
- [ ] Credential validation: invalid token format rejected
- [ ] Linking: POST /api/bots/[id]/link-code issues single-use 10-min code
- [ ] Expired link code (>10min) rejected
- [ ] Reused link code (consumedByProviderUserId set) rejected
- [ ] Unauthorized bot action (non-owner) → 403
- [ ] Unauthorized workflow modification (non-owner) → 403
- [ ] Workflow execution: step-by-step engine runs conditions + actions
- [ ] Conditional branching: true branch taken, false branch skipped
- [ ] Payment action fires order creation
- [ ] Wallet action fires credit/debit
- [ ] Support action fires ticket creation
- [ ] AI action fires AI job
- [ ] Gold action fires price lookup
- [ ] Broadcast authorization: only bot owner can broadcast

### WEBHOOK SECURITY (addendum §7)
- [ ] Telegram webhook with wrong `X-Telegram-Bot-Api-Secret-Token` → 403
- [ ] Telegram webhook with valid secret → 200, processes update
- [ ] Bale webhook with forged `X-Bale-Webhook-Signature` → 403
- [ ] Bale webhook with valid HMAC → 200
- [ ] Webhook replay (same update_id) → idempotent (no duplicate processing)
- [ ] Webhook forgery (different bot's secret) → 403

### AI PROVIDER VALIDATION
- [ ] postyar-zai always available (built-in)
- [ ] Gemini provider requires API key (rejects without)
- [ ] Ollama provider requires URL (rejects without)
- [ ] Invalid provider name rejected

### QUOTA ENFORCEMENT
- [ ] Free plan: max N content/month — N+1th rejected
- [ ] Pro plan: higher limit enforced
- [ ] Suspended user: all writes rejected
- [ ] Expired subscription: writes rejected, reads allowed

### ADMIN ACCESS (addendum §7)
- [ ] Non-admin GET /api/admin/users → 403
- [ ] Non-admin PATCH /api/admin/users/[id] → 403
- [ ] Admin GET /api/admin/users → 200
- [ ] Admin can suspend/unsuspend user
- [ ] Admin can adjust wallet (with audit log)
- [ ] Mass assignment: PATCH /api/admin/users/[id] with `role=admin` by non-superadmin → rejected
- [ ] Privilege escalation: user cannot self-promote to admin

---

## Security test cases (addendum §7) — DB-backed

- [ ] Unauthorized access (no cookie) → 401 on all /api/* (except health, plans, auth/*)
- [ ] IDOR: non-owner accessing /api/content/[id] → 403
- [ ] BOLA: non-owner accessing /api/destinations/[id]/buttons/[buttonId] → 403
- [ ] Privilege escalation: role=user calling /api/admin/* → 403
- [ ] Mass assignment: PATCH profile with `role` field → role unchanged
- [ ] Suspended user: all mutations → 403
- [ ] Expired session: `tokenHash` mismatch → 401
- [ ] Invalid CSRF: (N/A — cookie-based, but state-token HMAC validated)
- [ ] Malicious input: XSS payload in content → sanitized on render
- [ ] Path traversal: `../../../etc/passwd` in filename → rejected
- [ ] Malicious file upload: `.exe` with image MIME → magic-byte rejected
- [ ] Oversized upload: 100MB image → rejected
- [ ] Invalid MIME: `Content-Type: image/png` with PDF body → rejected
- [ ] SSRF: webhook URL pointing to 169.254.169.254 → rejected (if any outbound)
- [ ] Rate-limit bypass: header rotation → same IP key, still limited
- [ ] OTP brute force: 6th attempt → locked
- [ ] OTP replay: same code twice → second rejected
- [ ] OTP reuse: used OTP → rejected
- [ ] Webhook forgery: wrong secret → 403
- [ ] Webhook replay: same update_id → idempotent
- [ ] Payment replay: same charge_id → idempotent (no second credit)

---

## Implementation priority order

1. **Highest value, lowest setup:** Bale payment callback tests (§10) —
   these are the financial integrity core.
2. **OTP verify endpoint tests** (§6) — the brute-force/replay/reuse defense.
3. **Wallet concurrent mutation** (§8) — proves the derived-balance invariant.
4. **Bot linking + workflow** (§11) — the bot-builder core.
5. **Admin access control** (§7) — privilege escalation defense.
6. **Media upload** (§26) — magic-byte + path-traversal defense.
7. **Content ownership** (§7 IDOR/BOLA) — per-resource authorization.

Each file should follow the pattern of the existing 4 test files: ESM
imports, `describe`/`test`/`expect` from `bun:test`, env via
`tests/preload.ts`, no `@ts-expect-error`, no `: any`, no float arithmetic
on money.
