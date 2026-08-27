# پُست‌یار (POSTYAR)

> پلتفرم یکپارچهٔ ایرانی برای مدیریت محتوا، زمان‌بندی انتشار، بات‌ساز تلگرام/باله/روبیکا، پرداخت (کارت‌به‌کارت، درگاه بانکی، کیف پول بله)، کیف پول و دفتر مالی، ارجاع، تخفیف، اشتراک، تبلیغات، هوش مصنوعی، قیمت طلا و همگام‌سازی ووکامرس — همه با واجههٔ کاربری فارسی، راست‌چین و تاریخ شمسی.
>
> **Stack**: Next.js 16 (App Router, `output: "standalone"`) · TypeScript 5 strict · Prisma (SQLite در dev / MariaDB 10 در prod) · Tailwind CSS 4 + shadcn/ui · Zustand · TanStack Query · `z-ai-web-dev-sdk` (تنها در backend) · `bcryptjs` · `crypto-js` · `jsonwebtoken`.
>
> **Persistent design constraints**: Persian + RTL + Jalali در همه‌جا · بدون Google Fonts (فونت Vazirmatn به‌صورت local در `public/fonts/`) · بدون رنگ آبی/بنفش (indigo/blue) · بدون عدد اعشاری برای پول (همه integer Rial minor units) · بدون راز در URL (الگوریتم `HMAC("bot-webhook-sig", botId)` فقط شناسهٔ ربات را اصالت‌سنجی می‌کند، نه توکن).

[English technical summary continues below Persian block.]

---

## فهرست

1. [خلاصهٔ سریع](#quick-start)
2. [پیش‌نیازها](#prereqs)
3. [نصب و راه‌اندازی development](#dev-install)
4. [Build برای production](#prod-build)
5. [متغیرهای محیطی](#env-vars)
6. [معماری کلی](#architecture)
7. [نقشهٔ ماژول‌ها](#module-map)
8. [اسناد تکمیلی](#docs)

---

<a id="quick-start"></a>
## ۱. خلاصهٔ سریع

```bash
# 1. نصب وابستگی‌ها
bun install --frozen-lockfile

# 2. ساخت فایل .env از روی .env.example و پُر کردن مقادیر
cp .env.example .env
# - POSTYAR_MASTER_KEY: openssl rand -hex 32  (۶۴ هگز)
# - POSTYAR_JWT_SECRET: openssl rand -hex 32  (۳۲+ نویسه)
# - POSTYAR_CRON_SECRET: رشتهٔ تصادفی قوی
# - DATABASE_URL: file:./db/custom.db (SQLite dev)

# 3. اعمال schema روی SQLite dev (تنها در dev)
bun run db:push    # ← اسکریپت package.json: prisma db push --accept-data-loss
                  #   (در production از bunx prisma migrate deploy استفاده کنید)

# 4. تولید Prisma Client
bunx prisma generate

# 5. اجرای dev server (پورت ۳۰۰۰)
bun run dev
# به‌صورت خودکار dev.log نوشته می‌شود.
```

برای مشاهدهٔ اپ، روی دکمهٔ **Open in New Tab** در پنل پیش‌نمایش سمت راست کلیک کنید.

---

<a id="prereqs"></a>
## ۲. پیش‌نیازها

- **Node.js 22.23.2+** (پیشنهادی) یا Bun 1.1+.
- **Bun** (پیشنهادی برای نصب سریع‌تر و اسکریپت‌های `package.json`).
- **MariaDB 10** برای production (در dev از SQLite استفاده می‌شود).
- **Redis 6+** اختیاری (در صورت نبود، shim درون‌برنامه‌ای فعال می‌شود — برای production با چند Worker، Redis واقعی الزامی است).

---

<a id="dev-install"></a>
## ۳. نصب و راه‌اندازی development

```bash
git clone <repo-url> postyar
cd postyar
bun install --frozen-lockfile
cp .env.example .env
# فایل .env را ویرایش کنید (حداقل: POSTYAR_MASTER_KEY، POSTYAR_JWT_SECRET، POSTYAR_CRON_SECRET)
bun run db:push       # اعمال schema روی SQLite dev
bunx prisma generate  # تولید Prisma Client
bun run dev           # http://localhost:3000
```

---

<a id="prod-build"></a>
## ۴. Build برای production

اسکریپت `build` در `package.json`:

```bash
"build": "next build && cp -r .next/static .next/standalone/.next/ && cp -r public .next/standalone/"
```

این دستور:

1. `next build` را با `output: "standalone"` (در `next.config.ts`) اجرا می‌کند — خروجی در `.next/standalone/`.
2. فایل‌های استاتیک را در `.next/standalone/.next/` کپی می‌کند.
3. پوشهٔ `public/` (شامل `fonts/`، `icons/`، `manifest/`، `assets/ads/`، `robots.txt`) را در `.next/standalone/` کپی می‌کند تا مسیرهای `/fonts/Vazirmatn-Regular.woff2` و `/manifest/manifest.webmanifest` و `/robots.txt` از standalone server سرو شوند.

Startup command در cPanel / Passenger:

```bash
node .next/standalone/server.js
```

برای جزئیات کامل cPanel → `docs/DEPLOYMENT-CPANEL.md`.

---

<a id="env-vars"></a>
## ۵. متغیرهای محیطی

حداقل‌های الزامی (تمام مقادیر در `.env.example`):

| متغیر | توضیح |
|-------|-------|
| `POSTYAR_MASTER_KEY` | ۶۴ هگز (۳۲ بایت) — کلید AES-256-GCM برای رمزنگاری توکن‌ها. با `openssl rand -hex 32` بسازید. |
| `POSTYAR_JWT_SECRET` | ۳۲+ نویسه — کلید امضای JWT HS256. |
| `POSTYAR_CRON_SECRET` | رشتهٔ قوی — هدر `x-postyar-cron-secret` برای `/api/publish/run`، `/api/bots/incoming/rubika`، `/api/bots/[id]/poll`. |
| `DATABASE_URL` | SQLite در dev: `file:./db/custom.db` / MariaDB در prod: `mysql://USER:PASSWORD@127.0.0.1:3306/USER_postyar`. |
| `POSTYAR_PUBLIC_URL` | `https://postyar.example` — برای ثبت وب‌هوک ربات‌ها. |
| `POSTYAR_PUBLIC_BASE_URL` | همان مقدار بالا — برای ساخت URL کالبک بانک و URL رسانهٔ قابل‌دسترس-از-پروایدر. |
| `NODE_ENV` | `production` یا `development`. |

متغیرهای اختیاری: `POSTYAR_REDIS_URL`، `POSTYAR_AI_*` (OpenAI/Gemini/Grok/DeepSeek/Anthropic/OpenRouter/Mistral/Together/Ollama)، `POSTYAR_SMS_*` (Kavenegar/SMS.ir/Farapayamak)، `POSTYAR_SMTP_*`، `POSTYAR_BANK_*` (direct/intermediary)، `POSTYAR_GOLD_PROVIDER_URL`، `POSTYAR_REFERRAL_PERCENT`، `POSTYAR_REFERRAL_CAP_RIALS`، `POSTYAR_MAX_VIDEO_MB`.

---

<a id="architecture"></a>
## ۶. معماری کلی

نُه لایهٔ منطقی:

### ۶.۱ — Presentation (`src/components/`)
- **Layout**: `src/app/layout.tsx` (RTL، Vazirmatn، PWA manifest، theme provider، Toaster).
- **App shell**: `src/components/postyar/postyar-app.tsx` (hash-router + dashboard view switcher).
- **Landing**: `src/components/postyar/landing/landing.tsx`.
- **Auth**: `src/components/postyar/auth/auth.tsx`.
- **Dashboard views** (`src/components/postyar/dashboard/`): `dashboard.tsx`, `profile.tsx`.
- **Domain views** (`src/components/postyar/`): `wallet/`, `payment/`, `referral/`, `destinations/`, `content/`, `bot/`, `ai/`, `gold/`, `woo/`, `tickets/`, `advertising/`, `notifications/`.
- **Admin views** (`src/components/postyar/admin/`): `users.tsx`, `plans.tsx`, `orders.tsx`, `discounts.tsx`, `bank-cards.tsx`, `subscriptions.tsx`, `bots.tsx`, `audit.tsx`, `health.tsx`, `gate.tsx`, `gold.tsx`, `woo.tsx`, `ads.tsx`, `tickets.tsx`, `settings.tsx`, `broadcast.tsx`.
- **UI primitives** (`src/components/ui/`): shadcn/ui کامل با Lucide icons.

### ۶.۲ — API (`src/app/api/`)
- **Public**: `/api/plans`، `/api/health`، `/api/route.ts`.
- **Auth**: `/api/auth/{register, login, otp-request, otp-verify, complete-mobile-register, me, me/password, me/profile, me/notify-prefs, signout, dev/otp-test}`.
- **User resources**: `/api/{content, destinations, bots, orders, wallet, ledger, referral, subscriptions, discounts, ads, gold, gold/bot, woo/stores, tickets, notifications, media-upload, media/[id], ai/*, inbox, auto-responder, publish/schedule}`.
- **Payments**: `/api/payments/{bank, bank/callback, bale, card, card/receipt}`.
- **Bot webhooks**: `/api/bots/incoming/{telegram, bale, rubika}`، `/api/bots/[id]/{activate, deactivate, broadcast, poll, history, link-code, link-codes, workflows, workflows/[workflowId]}`.
- **Cron**: `/api/publish/run` (هر ۱ دقیقه)، `/api/bots/incoming/rubika` (هر ۵ دقیقه برای نظرسنجی روبیکا).
- **Admin**: `/api/admin/{users, users/[id], plans, plans/[id], orders/[id]/approve, orders/[id]/reject, wallet/adjust, discounts, discounts/[id], bank-cards, bank-cards/[id], subscriptions, ads, ads/[id]/approve, ads/[id]/reject, bots, tickets, audit, woo, gold, notifications/broadcast, settings, health}`.

### ۶.۳ — Domain logic (`src/lib/`)
- **Auth & sessions**: `src/lib/server/auth.ts` (JWT، Session، OTP flow، `requireUser`، `requireRole`، `audit`).
- **Crypto**: `src/lib/security/crypto.ts` (AES-256-GCM، HMAC-SHA256، constant-time compare، `randomToken`، `randomNumericCode`، bcrypt، JWT).
- **Cache / Rate limit / Lock**: `src/lib/security/cache.ts` (in-memory shim با `isRedis = false` — نقطهٔ سوییچ به Redis).
- **Cron secret**: `src/lib/server/cron-secret.ts`.
- **Payments engine**: `src/lib/payments/{engine.ts, plans.ts, card.ts, bank.ts, bale.ts, wallet.ts, referral.ts, discount.ts, advertising.ts, bank-cards.ts}`.
- **Publishing state machine**: `src/lib/publishing/state.ts`.
- **Queue & worker**: `src/lib/queue/{scheduler.ts, worker.ts}`.
- **Bots**: `src/lib/bots/{link.ts, workflow.ts, register-webhook.ts}`.
- **Destinations & buttons**: `src/lib/destinations/helpers.ts`، `src/lib/types/glass-button.ts`.
- **AI**: `src/lib/ai/{smart-text.ts, smart-caption.ts, smart-reply.ts, dispatch.ts, inbox.ts, auto-responder.ts}`.
- **Providers**: `src/lib/providers/{index.ts, telegram/, bale/, rubika/, email/, sms/, woo/, gold/, ai/, util.ts}`.
- **Tickets**: `src/lib/tickets/index.ts`.
- **Notifications**: `src/lib/notifications/index.ts`.
- **Persian utilities**: `src/lib/persian/index.ts` (Jalali، `formatRials`، `maskMobile`، `maskToken`، `normalizeMobile`، `toPersianDigits`، `fromPersianDigits`).
- **Storage**: `src/lib/storage/index.ts` (private file storage خارج از web root، magic-byte MIME detection، sharp image pipeline، video pipeline با rejection of executables).

### ۶.۴ — Persistence (`prisma/`, `db/`)
- **Schema**: `prisma/schema.prisma` — ۲۳ model: User, Profile, Session, Otp, Content, Media, Destination, GlassButton, PublishJob, Plan, Subscription, Order, CardTransferReceipt, BankGatewayRef, BalePaymentRef, WalletTxn, LedgerEntry, BankCard, Discount, DiscountPlan, DiscountUsage, ReferralReward, AdCampaign, AiJob, GoldPrice, GoldBot, WooCommerceStore, Ticket, TicketReply, Notification, Bot, BotWorkflow, BotLinkCode, BotHistory, AutoResponder, AuditLog, SystemSetting, HealthCheck.
- **DB client**: `src/lib/db.ts` که Prisma Client را export می‌کند.
- **DB file (dev)**: `db/custom.db` (SQLite) — در `.gitignore`.

### ۶.۵ — Integrations
- **Telegram Bot API**: `https://api.telegram.org/bot<TOKEN>/<method>` — در `src/lib/providers/telegram/`.
- **Bale Bot API**: `https://tapi.bale.ai/bot<TOKEN>/<method>` — در `src/lib/providers/bale/`.
- **Rubika Bot API**: `https://api.rubika.com/v1` — در `src/lib/providers/rubika/` (long-poll، بدون وب‌هوک خروجی).
- **WooCommerce REST API**: در `src/lib/providers/woo/` (با consumer key/secret رمزنگاری‌شده).
- **SMS providers**: Kavenegar، SMS.ir، Farapayamak — در `src/lib/providers/sms/`.
- **Email (SMTP)**: در `src/lib/providers/email/{index.ts, sendmail.ts}`.
- **AI providers**: OpenAI، Gemini، Grok، DeepSeek، Anthropic، OpenRouter، Mistral، Together، Ollama، postyar-zai (in-house via `z-ai-web-dev-sdk`) — در `src/lib/providers/ai/`.
- **Bank gateways**: direct + intermediary — در `src/lib/payments/bank.ts` (با HMAC state token، verify سمت-سرور، hard amount check).
- **Gold price provider**: در `src/lib/providers/gold/index.ts`.

### ۶.۶ — Background / Worker
- **Worker**: `src/lib/queue/worker.ts` — `runWorkerOnce(batch)` به‌صورت idempotent با `acquireLock` (در dev: in-memory lock؛ در prod: باید به Redis سوییچ شود).
- **Scheduler**: `src/lib/queue/scheduler.ts` — `schedulePublishJob({ contentId, destinationId, runAtIso, idempotencyKey })` با UNIQUE idempotencyKey.
- **Cron tick**: `/api/publish/run` (هر ۱ دقیقه) — توسط cron در cPanel فعال می‌شود (HTTP endpoint، نه daemon).
- **Rubika poll**: `/api/bots/incoming/rubika` (هر ۵ دقیقه) — long-poll `getUpdates`.
- **Gold eval**: تابع `evalGoldBots()` در `src/lib/providers/gold/bot.ts` وجود دارد ولی هنوز به API route متصل نیست (تنها Low-severity gap — ببینید `docs/SECURITY-AUDIT.md` §17).

### ۶.۷ — Security
- **Crypto primitives**: `src/lib/security/crypto.ts` — AES-256-GCM با IV ۱۲ بایت + AuthTag ۱۶ بایت، HKDF-style key derivation، `crypto.timingSafeEqual` برای constant-time compare.
- **JWT**: HS256 با ۷ روز TTL، HttpOnly + SameSite=Lax + Secure در production.
- **Password**: bcrypt cost ۱۲.
- **OTP**: ۶ رقم با `randomNumericCode` (rejection sampling، `crypto.randomBytes`)؛ TTL ۲ دقیقه؛ ۵ تلاش حداکثر؛ rate limit per-mobile ۵/ساعت.
- **CSP + HSTS + X-Frame + Permissions-Policy + Referrer-Policy**: در `src/middleware.ts`.
- **Audit log**: هر عمل حساس به `AuditLog` ردیف اضافه می‌شود (login_failed، order_approve، wallet_adjust، bot_webhook_signature_mismatch،...).
- **No `rejectUnauthorized: false`**، **no `Math.random` در security code**، **no `eval(`**، **no `: any`** (به‌جز ۲ مورد cosmetic در landing.tsx — ببینید `docs/SECURITY-AUDIT.md` §16.2)، **no `ts-ignore`**.

برای گزارش کامل → `docs/SECURITY-AUDIT.md`.

### ۶.۸ — Config / Observability
- **SystemSettings**: مدل `SystemSetting` با allowlist (`site.nameFa`, `ai.defaultProvider`, `maintenance.messageFa`, ...).
- **Health check**: `/api/health` (عمومی، بدون auth) و `/api/admin/health` (admin-only، چک‌های مفصل).
- **Logs**: `dev.log` در dev و `passenger.log` در prod.
- **Audit**: `/api/admin/audit` با فیلتر بر اساس `action`، `actor`، `targetType`.

---

<a id="module-map"></a>
## ۷. نقشهٔ ماژول‌ها (لینک به فایل‌های کلیدی)

### Authentication & Sessions
- `src/lib/server/auth.ts` — JWT signing/verifying، Session lifecycle، OTP flow، `requireUser`، `requireRole`، `audit`، `clientIp`.
- `src/lib/security/crypto.ts` — AES-256-GCM، HMAC-SHA256، constant-time compare، bcrypt، JWT.
- `src/app/api/auth/login/route.ts` — email + password login.
- `src/app/api/auth/otp-request/route.ts` — OTP request (mobile).
- `src/app/api/auth/otp-verify/route.ts` — OTP verify.
- `src/app/api/auth/me/password/route.ts` — change password.

### Plans & Subscriptions
- `src/lib/payments/plans.ts` — `listPublicPlans`، `createOrderForSubscription`، `createWalletCreditOrder`، `activateSubscription` (atomic + idempotent + referral reward)، `getQuotaState`، `requireQuota`.
- `prisma/schema.prisma` — `Plan`، `Subscription`، `Order`، `WalletTxn`، `LedgerEntry`، `ReferralReward`.
- `src/app/api/plans/route.ts` — public list.
- `src/app/api/subscriptions/route.ts` — my subscription + quota.

### Payments (card / bank / bale)
- `src/lib/payments/card.ts` — card-to-card: receipt upload + admin approve/reject.
- `src/lib/payments/bank.ts` — bank gateway: state token HMAC، server-to-server verify، hard amount check.
- `src/lib/payments/bale.ts` — Bale wallet invoice: 32-byte per-order secret (AES-encrypted)، pre-checkout + successful_payment با hard amount check، charge_id + update_id idempotency.
- `src/lib/payments/bank-cards.ts` — admin bank-card management (masked).
- `src/app/api/payments/{bank, bank/callback, bale, card, card/receipt}/route.ts` — endpoints.
- `src/app/api/admin/orders/[id]/{approve, reject}/route.ts` — admin card flow.

### Wallet / Ledger / Referral / Discount
- `src/lib/payments/wallet.ts` — derived balance (no mutable column)، append-only `WalletTxn`، `adminAdjustWallet`، `refund` (both idempotent).
- `src/lib/payments/referral.ts` — `ReferralReward.referredId @unique`، self-referral guard.
- `src/lib/payments/discount.ts` — `validateAndApply` (preview) و `recordUsage` (atomic with `DiscountUsage @unique [discountId, userId]`).
- `src/app/api/{wallet, ledger, referral, discounts}/route.ts` — endpoints.

### Content / Publishing / Worker
- `src/lib/publishing/state.ts` — state machine: draft → scheduled/queued → processing → delivered/failed/cancelled.
- `src/lib/queue/scheduler.ts` — `schedulePublishJob` با `PublishJob.idempotencyKey @unique`.
- `src/lib/queue/worker.ts` — `runWorkerOnce(batch)` با `acquireLock`، exponential backoff، hard-failure detection.
- `src/app/api/content/route.ts` — list/create content.
- `src/app/api/content/[id]/route.ts` — get/update/delete.
- `src/app/api/publish/schedule/route.ts` — schedule with Jalali date → UTC ISO conversion.
- `src/app/api/publish/run/route.ts` — cron-protected worker tick.

### Destinations & Glass Buttons
- `src/lib/destinations/helpers.ts` — `toDestinationView`، `assertOwnership`، `getDestinationToken`.
- `src/lib/types/glass-button.ts` — type.
- `src/app/api/destinations/route.ts` — create/list.
- `src/app/api/destinations/[id]/route.ts` — get/update/delete.
- `src/app/api/destinations/[id]/buttons/route.ts` — destination-scoped buttons.
- `src/app/api/destinations/[id]/buttons/[buttonId]/route.ts` — button CRUD.

### Bots (Telegram / Bale / Rubika)
- `src/lib/bots/register-webhook.ts` — per-bot `webhookSecret` (AES-encrypted)، `setWebhook` با `secret_token` (Telegram) و body HMAC (Bale).
- `src/lib/bots/link.ts` — link-code consumption (POSTYAR-XXXXXX → user-bind).
- `src/lib/bots/workflow.ts` — workflow engine.
- `src/app/api/bots/route.ts` — create/list.
- `src/app/api/bots/[id]/route.ts` — get/update/delete.
- `src/app/api/bots/[id]/{activate, deactivate, broadcast, poll, history, link-code, link-codes, workflows}/route.ts`.
- `src/app/api/bots/incoming/{telegram, bale, rubika}/route.ts` — webhook handlers.

### AI
- `src/lib/ai/smart-text.ts` — generate/rewrite/shorten/expand/tone.
- `src/lib/ai/smart-caption.ts` — caption generator.
- `src/lib/ai/smart-reply.ts` — smart reply.
- `src/lib/ai/dispatch.ts` — provider dispatcher.
- `src/lib/ai/inbox.ts` — inbox routing.
- `src/lib/ai/auto-responder.ts` — auto-responder engine.
- `src/lib/providers/ai/index.ts` — provider client.
- `src/app/api/ai/{generate-text, generate-caption, smart-reply}/route.ts`.
- `src/app/api/{inbox, inbox/[threadId], auto-responder}/route.ts`.

### Gold
- `src/lib/providers/gold/index.ts` — `getGoldPrice`، `getAllGoldPrices`، `instrumentFa`.
- `src/lib/providers/gold/bot.ts` — `evalGoldBots` (تابع وجود دارد، اما API route برای آن تعریف نشده — ببینید `docs/SECURITY-AUDIT.md` §17).
- `src/app/api/gold/route.ts` — get prices.
- `src/app/api/gold/bot/route.ts` — gold bot CRUD (user-scoped).

### WooCommerce
- `src/lib/providers/woo/index.ts` — store CRUD، `testConnection`، `syncProducts` (emits Content drafts).
- `src/app/api/woo/stores/route.ts` — list/create.
- `src/app/api/woo/stores/[id]/sync/route.ts` — sync trigger.

### Tickets
- `src/lib/tickets/index.ts` — create/list/reply/close/assign.
- `src/app/api/tickets/route.ts` — user create/list.
- `src/app/api/tickets/[id]/route.ts` — get/reply.
- `src/app/api/admin/tickets/route.ts` — admin list + assign.

### Notifications
- `src/lib/notifications/index.ts` — list/markRead/markAllRead/adminBroadcast.
- `src/app/api/notifications/route.ts` — list + mark.
- `src/app/api/notifications/unread-count/route.ts`.
- `src/app/api/admin/notifications/broadcast/route.ts` — admin broadcast.

### Admin panel
- `src/components/postyar/admin/{users, plans, orders, discounts, bank-cards, subscriptions, bots, audit, health, gate, gold, woo, ads, tickets, settings, broadcast}.tsx`.
- `src/app/api/admin/*` — تمام endpoints با `requireRole(["admin"])` یا `requireRole(["admin", "support"])`.

### Storage
- `src/lib/storage/index.ts` — private file storage خارج از web root، randomized UUID filenames، sharp re-encode به WebP، magic-byte MIME detection، executable rejection (MZ/ELF/Mach-O).
- `src/app/api/media-upload/route.ts` — multipart upload.
- `src/app/api/media/[id]/route.ts` — auth-gated download (ownership or admin).

### Middleware
- `src/middleware.ts` — security headers (CSP، HSTS، X-Frame، Permissions-Policy، Referrer-Policy) on every non-asset route.

---

<a id="docs"></a>
## ۸. اسناد تکمیلی

| سند | توضیح |
|-----|-------|
| [`docs/DEPLOYMENT-CPANEL.md`](docs/DEPLOYMENT-CPANEL.md) | راهنمای استقرار روی cPanel / LiteSpeed / Passenger / Node.js 22 / MariaDB 10 / Redis / AutoSSL — شامل file placement، MariaDB، Redis، Application Manager، `app.js` entry stub، env vars، build با cPanel Terminal، startup command، cronها، permissions، HTTPS، health check، backup، migration، webhook URLs. |
| [`docs/SECURITY-AUDIT.md`](docs/SECURITY-AUDIT.md) | گزارش ممیزی امنیتی دشمنانه — هر دسته از spec §79 + §113 با file:line، شدت، وضعیت (FIXED/PARTIAL/OPEN) و توصیهٔ رفع. |
| [`docs/BACKUP.md`](docs/BACKUP.md) | راهنمای پشتیبان‌گیری و بازگردانی: MariaDB، storage، `.env`، سناریوهای DR، RTO، retention policy. |
| [`docs/BALEPAY-FORENSICS.md`](docs/BALEPAY-FORENSICS.md) | گزارش مهندسی معکوسِ WordPress plugin `balepay-pro` و الگوهای امنیتی که POSTYAR نباید تکرار کند — مبنای hardening در `src/lib/payments/bale.ts`. |
| [`docs/postman-collection.json`](docs/postman-collection.json) | مجموعهٔ Postman با تمام endpoints اصلی (auth، plans، destinations، content، bots، payments، wallet، AI، gold، woo، tickets، admin، cron-protected) و متغیرهای `{{baseUrl}}` و `{{cronSecret}}`. |
| [`.github/workflows/ci.yml`](.github/workflows/ci.yml) | GitHub Actions CI: install، typecheck، lint، build (next build standalone)، db-validate (prisma validate + migrate status)، smoke test، security-scan (greps for forbidden patterns). |
| [`.env.example`](.env.example) | تمام متغیرهای محیطی با توضیح و placeholder. |

---

## License

Proprietary — پُست‌یار. تمام حقوق محفوظ است.

---

## Contact

برای گزارش آسیب‌پذیری امنیتی: به `docs/SECURITY-AUDIT.md` §0 مراجعه کنید — آن سند نقشهٔ کامل کنترل‌های امنیتی است. برای پشتیبانی کاربر: از داخل اپ تیکت جدید ایجاد کنید (`POST /api/tickets`).
