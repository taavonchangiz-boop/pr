# BALEPAY-PRO FORENSICS — Reverse-Engineering Report for POSTYAR

> Task ID: 1 · Agent: Forensic Reverse-Engineering Specialist
> Subject: WordPress plugin `balepay-pro/balepay-pro/` (v1.0.0)
> Scope: file-by-file behavioral and security analysis; produce a clean, secure, native-Node reimplementation baseline for POSTYAR
> Output language: English technical terms + Persian where needed

---

## 0. Executive Summary

BalePay Pro (BPP) is a 100 %-open-source re-implementation of an earlier ionCube-encrypted
"BalePay" plugin for WooCommerce. It bridges Iranian messaging-bot payment flows
(Bale Bot, Telegram Bot) with WooCommerce orders and Iranian installment gateways
(SnappPay, DigiPay), plus SMS (Melipayamak) and Bale Safir for outbound notifications.

Architecturally it is a single-file PHP plugin using:
- WP REST API endpoints for inbound webhooks + receipt uploads
- WP AJAX (`admin-ajax.php`) for the admin panel
- WooCommerce `WC_Payment_Gateway` subclasses + Cart/Checkout Blocks registration
- AES-256-GCM encrypted `wp_options` storage for secrets
- Four custom MySQL tables (`bpp_transactions`, `bpp_bot_users`, `bpp_messages`, `bpp_logs`)

The protocol model is **"Bot API + Bot webhook + provider-token wallet invoice"**,
not a hosted-payment-gateway model: there is **no** classic redirect→callback→verify
for the wallet flow — the wallet payment is delivered inline via the bot's
`sendInvoice`, then the bot fires `pre_checkout_query` and `successful_payment`
events back to the same REST webhook. Card-to-card is a *manual* verification flow:
the customer uploads a receipt, an admin clicks an inline keyboard button whose
`callback_data` carries an HMAC signature.

The plugin is *meaningfully* more secure than the upstream encrypted version it
replaces (HMAC-signed callback_data, AES-256-GCM, TLS verify default-on, owner-
scoped order tracking, nonce-protected uploads, hard amount mismatch rejection).
But it still inherits a number of structural weaknesses — mostly around **secret
exposure in URLs**, **float-based money math**, **public-by-URL receipt storage**,
**non-append-only transaction ledger**, **WP-specific trust assumptions**, and
**weak / non-existent idempotency on the wallet webhook**. POSTYAR must NOT
replicate these; instead it must re-implement the valuable protocol pieces with
native Node equivalents and fail-closed webhooks.

This document delivers the canonical model in four parts: VALUE EXTRACTION,
SECURITY REJECTIONS, BALE PAYMENT PROTOCOL, and REIMPLEMENTATION RECOMMENDATIONS.

---

## 1. VALUE EXTRACTION (behaviours worth re-implementing safely in POSTYAR)

These are the genuinely useful behaviours the plugin demonstrates. Each is paired
with the file:line where it lives and a short description of the *shape* to port.

### 1.1 Bale / Telegram Bot API client (transport)
- File: `includes/class-bpp-bot-api.php`
- Base URLs (lines 27–30):
  - Bale:    `https://tapi.bale.ai/bot<TOKEN>/<method>`
  - Telegram: `https://api.telegram.org/bot<TOKEN>/<method>`
- File endpoint: `https://tapi.bale.ai/file/bot<TOKEN>/<file_path>` (line 373)
- Methods used (the *complete* set observed in the plugin):
  `getMe`, `sendMessage`, `editMessageText`, `answerCallbackQuery`,
  `setWebhook` (with `secret_token` body param), `deleteWebhook`,
  `getWebhookInfo`, `sendPhoto`, `getFile`, `sendInvoice`,
  `answerPreCheckoutQuery`.
- The plugin **does NOT call** `getUpdates`, `setMyCommands`, `sendChatAction`,
  `answerShippingQuery`, `sendMediaGroup`, `forwardMessage`, `deleteMessage`,
  `kickChatMember`, etc. — it is a deliberately minimal Bot-API surface.
- Notable feature: a `diagnose()` method (lines 163–209) that runs a step-by-step
  connectivity test (token-format → DNS/TLS → real `getMe` call → fallback
  without TLS) to produce human-readable error messages. This is **the
  centrepiece UX improvement** over the upstream encrypted plugin.

### 1.2 Webhook registration and update routing
- File: `includes/class-bpp-webhook.php`
- Registration URL pattern (lines 177–193):
  - Telegram: secret delivered via `secret_token` body parameter of `setWebhook`
    (Telegram then sends it back as `X-Telegram-Bot-Api-Secret-Token` header).
  - Bale: secret concatenated into the query string of the registered URL
    (`?platform=bale&secret=<SECRET>`) — flagged as insecure (see §2.1).
- Webhook permission callback (lines 70–94) reads the secret from:
  1. `X-Telegram-Bot-Api-Secret-Token`
  2. `X-Bale-Secret`
  3. query-string `secret` (Bale-only fallback, with warning log)
- Update routing (lines 102–140) dispatches:
  - `callback_query` → `process_callback()`
  - `pre_checkout_query` → `BPP_Wallet::handle_pre_checkout()`
  - `message.successful_payment` → `BPP_Wallet::handle_successful_payment()`
  - `message.text` → command router (`/start [BLP-…]`, `/start`, `/help`,
    bare order-id → order tracking)

### 1.3 Wallet invoice → pre-checkout → successful_payment flow (Bale native)
- Files: `includes/class-bpp-wallet.php`, `includes/class-bpp-gateway-card.php` (BPP_Gateway_Wallet)
- Flow:
  1. `BPP_Gateway_Wallet::process_payment()` (gateway-card.php:167) calls
     `BPP_Wallet::send_invoice_for_order()` (wallet.php:51).
  2. `send_invoice_for_order()`:
     - Resolves customer chat_id via `_bpp_bale_chat_id` user-meta.
     - Computes `total_rial = round(order_total * 10)` (IRT→IRR).
     - Builds `payload = "bpp_order_" + order_id`.
     - Calls `Bot_API::sendInvoice(chat_id, title, description, payload,
       provider_token, [{label, amount: total_rial}], currency="IRR")`
       (bot-api.php:392–409).
  3. Bale delivers the invoice UI to the customer inside the bot.
  4. When the customer taps pay, Bale sends a `pre_checkout_query` to the
     webhook.
  5. `BPP_Wallet::handle_pre_checkout()` (wallet.php:120):
     - Parses `invoice_payload` → `order_id`.
     - Validates `wc_get_order(order_id)` exists and `needs_payment()`.
     - Calls `answerPreCheckoutQuery(ok, error_message)`.
  6. On success Bale charges the user's wallet and emits a
     `message.successful_payment` payload to the webhook.
  7. `BPP_Wallet::handle_successful_payment()` (wallet.php:155):
     - Reads `invoice_payload`, `total_amount`,
       `telegram_payment_charge_id`, `provider_payment_charge_id`.
     - **Hard amount check** (line 175): `total_amount !== expected_rial` →
       reject and flag `_bpp_wallet_mismatch`. (This is the security headline
       fix vs. the upstream plugin which only logged mismatches.)
     - On match: marks order paid, `payment_complete(charge_id)`,
       `wc_reduce_stock_levels()`, writes a `bpp_transactions` row
       (`transaction_type=wallet`, `decision=approve`, `status=processing`),
       notifies customer + admins.

### 1.4 Pre-checkout behaviour
- The handler is permissive: any order that exists and `needs_payment()` gets
  `ok=true`. The hard verification happens later in `successful_payment`.
- This matches the Bale/Telegram Bot API contract: pre-checkout is *advisory*
  and the canonical truth comes from `successful_payment`.

### 1.5 Card-to-card manual verification flow with HMAC-signed inline buttons
- Files: `includes/class-bpp-verification.php`, `includes/class-bpp-notifications.php`,
  `includes/class-bpp-receipt.php`, `includes/class-bpp-webhook.php`
- Flow:
  1. Customer places order via `BPP_Gateway_Card` → order created in
     `pending` status (gateway-card.php:92).
  2. `BPP_Notifications::notify_new_order()` sends bank-card list + deadline
     to admin (notifications.php:200).
  3. Customer uploads receipt image via REST `/balepay-pro/v1/upload-receipt`
     (receipt.php:88). Plugin validates nonce, ownership, MIME, size, ext,
     writes to `wp-content/uploads/balepay-pro/receipts/{order_id}/r_*.ext`
     with 24-char random suffix, drops `.htaccess` to deny PHP execution,
     moves order `pending → on-hold`, writes `bpp_transactions`
     (`transaction_type=verify`, `status=on-hold`).
  4. The `pending_to_on-hold` WC hook fires `on_receipt_uploaded()`
     (notifications.php:260) which calls `send_admin_verification()`
     (notifications.php:147). This sends a message to admin chat with an
     `inline_keyboard` of two buttons whose `callback_data` is
     `bpp:<order_id>:<approve|reject>:<expires>:<HMAC>` (lines 178–183).
     HMAC key = `sha256(webhook_secret + "|" + wp_salt('nonce'))`.
  5. Admin taps a button → Bale posts a `callback_query` to the webhook.
  6. `BPP_Webhook::process_callback()` (webhook.php:228):
     - Splits `callback_data` into 5 parts; rejects if not 5 parts or
       prefix ≠ `bpp`.
     - Recomputes `expected = HMAC("cb:<order>:<action>:<expires>:<platform>")`
       and compares with `hash_equals` (line 252) — **constant-time**.
     - Rejects if `expires > 0 && now > expires`.
     - Rejects if `chat_id !== admin_chat_id` for the platform (line 265) —
       **only admin chat can approve/reject**.
     - Routes `undo` → `process_undo()`; `approve|reject` →
       `process_verification()`.
  7. `process_verification()` (verification.php:96):
     - Refuses if order is not `on-hold` (anti-replay for stale buttons,
       line 106).
     - Acquires an atomic WP-option lock `bpp_lock_<id>` with 10-s TTL
       (lines 67–74) — *cheap* race-condition defence.
     - Updates message text via `editMessageText`, sets order to
       `processing` (approve) or `cancelled` (reject), updates
       `bpp_transactions`, sends undo button (60-s TTL) back to admin,
       notifies customer.
  8. Undo path (verification.php:214) reverts to `on-hold` within the 60-s
     window and re-sends the approve/reject buttons.

### 1.6 User-linking mechanism (signed short-lived code)
- File: `includes/class-bpp-user-link.php`
- Code shape: `BLP-<6 uppercase alnum>.<12 hex HMAC-prefix>.<hex expires>`
  (line 72). The 6-char random + 12-char HMAC prefix + hex TTL.
- HMAC payload: `"link:<user_id>:<rand>:<expires>"` (line 71), key material
  same as for callbacks (`webhook_secret + wp_salt('nonce')`).
- TTL: 600 s (line 41). Max attempts per code: 10 (line 48).
- Delivery: deep link `https://ble.ir/<bot_username>?start=<code>`
  (line 108) for Bale; `https://t.me/<bot_username>?start=<code>` for Telegram.
- On `/start <code>` (webhook.php:331) the bot looks up the WP user via
  `get_users(meta_key='_bpp_link_code', meta_value=code)` (line 144),
  validates the HMAC, checks expiry, checks attempt counter, links chat to
  the WP user (`_bpp_bale_chat_id` / `_bpp_telegram_chat_id` user-meta +
  `bpp_bot_users.wp_user_id`), deletes the consumed code, increments
  attempt counter on failure.

### 1.7 Wallet ledger / transactions table
- File: `includes/class-bpp-activator.php:53–75` (schema),
  `class-bpp-wallet.php:225–249`, `class-bpp-receipt.php:177–202`,
  `class-bpp-verification.php:276–292`, `class-bpp-report.php`.
- Schema: `bpp_transactions(id, order_id, user_id, platform,
  transaction_type[verify|wallet], status[pending|on-hold|processing|
  completed|cancelled|failed|refunded], decision[|approve|reject|undo],
  amount, admin_chat_id, user_chat_id, receipt_url, receipt_note,
  tracking_code, undo_message_id, undo_expires, created_at, updated_at)`.
- Used as a "current state" table (UPDATE in place; DELETE+INSERT on
  re-upload). The plugin treats this as a state mirror of the WC order,
  **not** an append-only ledger. (See security §2.5 for rejection.)

### 1.8 Receipt upload mechanism
- File: `includes/class-bpp-receipt.php`
- Endpoint: `POST /wp-json/balepay-pro/v1/upload-receipt`
- Permission: `is_user_logged_in()` + `wp_verify_nonce(X-WP-Nonce, 'wp_rest')`
  (lines 74–80).
- Ownership: `order.user_id === current_user_id` OR
  `current_user_can('manage_woocommerce')` (line 98).
- Validation: `$_FILES['receipt']`, size ≤ 5 MiB (line 42), ext ∈
  {jpg,jpeg,png,webp} (line 35), real-MIME check via `finfo_open()` (line 118).
- Storage: `wp-content/uploads/balepay-pro/receipts/{order_id}/r_<time>_<24
  random>.<ext>`. `.htaccess` dropped with `Options -Indexes` and
  `<FilesMatch "\.(php|phtml|phar)$">Require all denied</FilesMatch>` plus
  `index.php // Silence is golden.` (lines 209–234).
- Returned: full public URL (line 136) — see §2.4 for rejection.

### 1.9 OTP flow
- **Not present.** The plugin does not implement any OTP, 2FA, or
  SMS-OTP flow. SMS module (class-bpp-sms.php) is one-way notification only.
- If POSTYAR needs OTP, it must be designed fresh (see §4.10).

### 1.10 Notification routing (multi-channel fan-out)
- File: `includes/class-bpp-notifications.php`
- `send_to_admins()` (line 65): for each platform `bale|telegram`, if the
  per-platform admin-notify flag is on and admin_chat_id is set, send via
  `Bot_API::send_message`. Then fall back to Safir (`safir.bale.ai/api/v3/
  send_message`) with `api-access-key` header, then to SMS
  (`api.payamak-panel.com/post/Send.asmx/SendSimpleSMS2`) — see §2.1 for the
  SMS-in-URL problem.
- `notify_customer()` (line 107): same shape but resolves chat_id from
  the WP user's `_bpp_<platform>_chat_id` meta; falls back to phone via
  Safir/SMS if no bot link exists.
- `send_admin_verification()` (line 147): the inline-keyboard constructor
  described in §1.5.

### 1.11 Admin actions & panel
- Files: `includes/class-bpp-admin.php`, `includes/class-bpp-ajax.php`,
  `templates/admin-panel/main.php`, `assets/js/admin.js`
- Capability: `manage_bpp` (added to `administrator` and `shop_manager`
  roles by `class-bpp-activator.php:159`).
- All AJAX actions go through `BPP_Ajax::guard()` (ajax.php:62) =
  `current_user_can('manage_bpp')` + `check_ajax_referer('bpp_admin',
  'nonce')`.
- Actions: `bpp_save_settings`, `bpp_test_connection`,
  `bpp_register_webhook`, `bpp_webhook_status`, `bpp_dashboard_stats`,
  `bpp_get_transactions`, `bpp_get_users`, `bpp_send_manual_message`,
  `bpp_send_bulk_message` (≤100 recipients), `bpp_set_admin`,
  `bpp_block_user`, `bpp_get_logs`, `bpp_clear_logs`,
  `bpp_send_test_report`, `bpp_health_check`.

### 1.12 Bale bot commands & menus & inline buttons
- The plugin **does not register** `setMyCommands` — commands are matched
  textually in `process_message()` (webhook.php:288): `/start`, `/help`,
  `/start BLP-…`, and a bare-order-id parser that accepts Persian and
  Arabic digits (webhook.php:367–378).
- Inline buttons are constructed inline as `{"inline_keyboard": [[…
  {"text": "✅ تأیید", "callback_data": "bpp:…:approve:…:sig"}]]}` JSON,
  passed through `wp_json_encode` into the `reply_markup` field of
  `sendMessage` / `editMessageText` (bot-api.php:243, 265, 355).

### 1.13 SnappPay gateway abstraction (installments)
- File: `includes/class-bpp-snapppay.php`
- OAuth2 password grant: `POST /api/online/v1/oauth/token` with Basic auth
  (`client_id:client_secret`), `grant_type=password`, `scope=online-merchant`,
  `username`, `password`. Bearer cached in WP transient
  `bpp_snapppay_bearer_token` (lines 59–86).
- Endpoints (relative to base URL `https://api.snapppay.ir/`):
  - `POST /api/online/payment/v1/token` — create payment token; body
    `{amount, paymentMethodTypeDto: "INSTALLMENT", returnURL, transactionId,
    discountAmount: 0, mobile?, cartList:[{cartId, productList}]}`.
  - `GET /api/online/offer/v1/eligible?amount=…` — eligibility check.
  - `POST /api/online/payment/v1/verify` — `{paymentToken}`.
  - `POST /api/online/payment/v1/settle` — `{paymentToken}`.
  - `POST /api/online/payment/v1/cancel` — `{paymentToken}`.
- Gateway callback URL: `WC()->api_request_url('bpp_snapppay')` +
  `?wc_order=<id>&gateway=snapppay`. The callback reads `state`,
  `paymentToken` from `$_POST`, then calls `verify`+`settle` server-side.
- **No callback signature verification** — see §2.8.

### 1.14 DigiPay gateway abstraction (installments)
- File: `includes/class-bpp-digipay.php`
- OAuth2 password/refresh grant: `POST /oauth/token` with Basic auth
  (`client_id:client_secret`), `grant_type=password` (first run) or
  `grant_type=refresh_token` (subsequent). Tokens persisted in
  `wp_options.bpp_digipay_tokens` (unencrypted!) — see §2.11.
- Endpoints (base: `https://api.mydigipay.com/digipay/api/` live,
  `https://uat.mydigipay.info/digipay/api/` sandbox):
  - `POST /tickets/business?type=11` — create ticket; body
    `{amount, cellNumber?, providerId: order_id, callbackUrl,
    basketDetailsDto:{basketId: order_id, items:[{sellerId, supplierId,
    productCode, productType, count, categoryId}]}}`. Type `11` = 4-installment.
  - `POST /purchases/verify?type=0` — `{trackingCode, providerId: order_id}`.
    Retries on status `9011` with `sleep(2)` (lines 221–242).
  - `POST /refunds?type=0` — `{amount, providerId, saleTrackingCode}`.
- Gateway callback: same pattern as SnappPay. Reads `result`, `amount`,
  `trackingCode`, `type` from `$_POST`. **Does** verify amount equality
  server-side (line 407). No signature on callback — see §2.8.

### 1.15 Safir (Bale phone-based messaging) abstraction
- File: `includes/class-bpp-safir.php`
- Endpoint: `POST https://safir.bale.ai/api/v3/send_message`
- Headers: `api-access-key: <access_key>`, `Content-Type: application/json`
- Body: `{bot_id, phone_number (98…), text (≤1000), request_id (random 32)}`
- Pure one-way push; no webhook. Used as fallback channel when no bot chat
  is linked.

### 1.16 SMS (Melipayamak) abstraction
- File: `includes/class-bpp-sms.php`
- Endpoint: `GET https://api.payamak-panel.com/post/Send.asmx/SendSimpleSMS2
  ?username=…&password=…&from=…&to=…&text=…&isflash=…`
- Response body: literal `1` / `true` = success.
- **Secrets in URL query string** — see §2.1.

### 1.17 Woocommerce-ish content transformation (template variables)
- File: `includes/class-bpp-helpers.php:487–525`
- `render_message(template, order, extra)` substitutes:
  `{order_id} {total} {customer} {phone} {date} {time} {items} {cards}
  {deadline} {order_url} {note}` plus caller-supplied extras.
- Persian-digit conversion (`fa_num`, line 373), Persian money formatter
  (`fa_money`, line 385), Gregorian→Jalali converter (lines 395–440) —
  a self-contained algorithm without depending on a calendar extension.
- `format_card()` (line 533) formats 16-digit card as `1234-5678-9012-3456`.

### 1.18 Health & diagnostic surface
- `BPP_Ajax::bpp_health_check` (ajax.php:413) returns php_version,
  wp_version, woocommerce version, openssl availability, curl, ioncube
  (with deliberate "نصب نیست (مطلوب)" = "not installed (mandatory)"),
  zlib, ssl, REST URL, server SSL, webhook URL.
- `BPP_Bot_API::diagnose()` (bot-api.php:163) — staged connectivity test.

### 1.19 Webhook health self-heal
- `BPP_Main::webhook_health()` (main.php:268) is a `twicedaily` cron that
  calls `getWebhookInfo` for each platform and re-registers the webhook
  if missing or logs the last error.

### 1.20 Daily maintenance
- `BPP_Main::daily_maintenance()` (main.php:200):
  - `expire_stale_orders()`: cancels `pending`/`on-hold` card orders older
    than `payment_deadline_hours` (default 2 h).
  - `remind_pending()`: nudges customers with `pending` card orders older
    than `remind_pending_hours` (default 12 h), once.

### 1.21 Scheduled reports
- `BPP_Report::schedule()` (report.php:45) clears `bpp_report_cron` and
  re-schedules daily or weekly at `report_time` (default 08:00).
- `build_report()` (report.php:98) runs HPOS-aware SQL: if
  `wc_orders` table exists, JOIN `bpp_transactions` against it;
  otherwise JOIN against `wp_posts`+`wp_postmeta` for `_order_total`.
- Returns Persian-localised text with emoji bullets.

---

## 2. SECURITY REJECTIONS (explicit list of insecure patterns NOT to transfer)

Every entry below is a *concrete file:line* in the BPP source. POSTYAR must
not carry any of these forward; the corresponding clean patterns are in §4.

### 2.1 Long-lived secrets in URLs / query strings
- `includes/class-bpp-webhook.php:182` —
  `$url .= '&secret=' . rawurlencode( $secret );`
  The 48-char `webhook_secret` is appended to the registered Bale webhook
  URL. It will appear in Bale server logs, in any intermediate proxy/CDN
  access log, in `getWebhookInfo` responses, and in WP option backups.
- `includes/class-bpp-webhook.php:178` —
  `$url = $this->get_webhook_url() . '?platform=' . $platform;`
  Combined with the secret above, the entire authentication material for
  the webhook is in the URL.
- `includes/class-bpp-bot-api.php:97` —
  `$url = $this->base_urls[ $platform ] . $token . '/' . $method;`
  The bot token (the *full* authentication credential) is in the URL path
  of every Bot API call. This is the Telegram/Bale convention, but it
  means tokens are exposed in any proxy/CDN/WAF access log between
  POSTYAR and `tapi.bale.ai`.
- `includes/class-bpp-bot-api.php:373–377` —
  `'url' => $base . $token . '/' . $resp['result']['file_path'],`
  The file-download URL embeds the bot token in the URL and is then
  stored in `bpp_messages.file_url` (bot-users.php:262) — i.e., the token
  is persisted in a DB column.
- `includes/class-bpp-sms.php:72` —
  `$url = $this->api_url . '?' . http_build_query( $params );`
  Melipayamak username **and password** are sent as URL query params on
  a `GET` request — the password lands in every hop's access log.

### 2.2 Disabling TLS verification in production
- `includes/class-bpp-bot-api.php:102` —
  `'sslverify' => $this->tls_verify(),`
  `tls_verify()` reads the admin-toggleable `tls_verify` setting. If an
  admin unchecks the box (UI at `templates/admin-panel/main.php:94`),
  **all** Bot API calls become vulnerable to MITM.
- `includes/class-bpp-bot-api.php:189–192` — `diagnose()` *temporarily*
  sets `tls_verify='no'` to test connectivity, then restores it. There is
  a race window where another concurrent request sees `tls_verify='no'`
  and runs without TLS verification.
- `includes/class-bpp-snapppay.php:74, 113`, `class-bpp-digipay.php:81,
  123`, `class-bpp-safir.php:73`, `class-bpp-sms.php:76` — every external
  HTTP call uses the same admin-toggleable `tls_verify` setting. One admin
  uncheck disables TLS verification across the whole plugin.

### 2.3 Float-based money math
- `includes/class-bpp-helpers.php:355–365` —
  `$amount = (float) $amount; … (int) round( $amount );`
  and for IRT→IRR: `(int) round( $amount * 10 );`. Float arithmetic on
  monetary values is forbidden in payment systems.
- `includes/class-bpp-wallet.php:68` —
  `$total_rial = (int) round( (float) $order->get_total() * 10 );`
- `includes/class-bpp-wallet.php:172` — same pattern in the successful-
  payment amount check.
- `includes/class-bpp-wallet.php:241` — same pattern in
  `save_transaction()`.
- `includes/class-bpp-receipt.php:193` — same pattern in
  `save_transaction()`.
- `includes/class-bpp-snapppay.php:142` and
  `includes/class-bpp-digipay.php:160` — both delegate to
  `amount_to_irr()`, inheriting the float bug.

### 2.4 Public storage of payment receipts without authorization
- `includes/class-bpp-receipt.php:128–136` — receipts stored under
  `wp-content/uploads/balepay-pro/receipts/{order_id}/r_<…>.<ext>` and the
  *full public URL* is returned in the REST response (`'url' => $target_url`,
  line 136) and stored in `_bpp_receipt_url` order meta (line 142). The
  URL is then surfaced in the customer thank-you page (`templates/
  receipt-upload-form.php:25–30`) and in admin notification messages
  (`notifications.php:157`). Anyone who learns the URL can fetch the
  receipt — there is **no signed-URL / expiring-token gate** on the file.
  The 24-char random filename provides obscurity only; once the URL is
  delivered to the customer's browser, in admin notifications, in
  referrer headers, in proxy logs, etc., it is effectively public.
- `includes/class-bpp-receipt.php:209–234` — the `.htaccess` only blocks
  PHP execution and directory listing; it does **not** block direct image
  fetches. The directory is web-readable by design.

### 2.5 Deletion/reinsertion that destroys financial history
- `includes/class-bpp-wallet.php:231` —
  `$wpdb->delete( $table, array( 'order_id' => $order_id,
  'transaction_type' => 'wallet' ), … );`
  immediately before `insert` (line 232). The previous wallet transaction
  row is destroyed.
- `includes/class-bpp-receipt.php:183` —
  `$wpdb->delete( $table, array( 'order_id' => $order_id,
  'transaction_type' => 'verify' ), … );`
  immediately before `insert` (line 184). The previous verify row (and
  its `decision` history) is destroyed on every re-upload.
- `includes/class-bpp-verification.php:280` — `update()` in place on
  `bpp_transactions` for the same `order_id + transaction_type=verify`.
  There is no append-only ledger; the table is a single-row-per-order
  state mirror. Audit trail of past decisions is lost.

### 2.6 WordPress-specific trust assumptions (nonce-only, capability-only)
- `includes/class-bpp-ajax.php:62–67` —
  `current_user_can('manage_bpp')` + `check_ajax_referer('bpp_admin',
  'nonce')`. WP nonces are *not one-time* — they are HMAC tokens bound to
  `session/AUTH_COOKIE` and the `wp_salt('nonce')` value, valid for
  ~12–24 h. They are replayable within that window.
- `includes/class-bpp-receipt.php:74–80` — upload endpoint uses
  `is_user_logged_in()` + `wp_verify_nonce(X-WP-Nonce, 'wp_rest')` only.
  Same nonce-validity-window replay problem.
- `includes/class-bpp-receipt.php:98` — authorization check uses
  `current_user_can('manage_woocommerce')`. A privilege-escalation in any
  WC plugin (or in WP core itself) grants receipt upload rights.
- `includes/class-bpp-admin.php:73` — panel entry only checks
  `current_user_can('manage_bpp')`.
- `includes/class-bpp-webhook.php:70–94` — webhook auth relies on a
  shared static secret (`bpp_settings.webhook_secret`). No per-request
  nonce, no replay protection, no `update_id` deduplication.
- `includes/class-bpp-helpers.php:616–632` — HMAC key material is
  `webhook_secret + '|' + wp_salt('nonce')`. If `wp_salt('nonce')` is
  compromised (e.g., via a leak of `wp-config.php` salts, or via XSS that
  can read `$wpdb->options`), the HMAC for inline buttons is forgeable.
- `includes/class-bpp-verification.php:67–74` — the atomic lock is built
  on `add_option($key, time(), '', 'no')`. `add_option` returns false if
  the option exists. This is *not* a real distributed lock — it doesn't
  work across multiple web nodes against a single MySQL with table-level
  caching, and the TTL (10 s) is short enough that long-running approve
  flows can be silently stolen by a concurrent request after 10 s.

### 2.7 WooCommerce-specific assumptions
- `includes/class-bpp-gateway-card.php:15`, `class-bpp-snapppay.php:238`,
  `class-bpp-digipay.php:285` — all gateways extend `WC_Payment_Gateway`.
- `includes/class-bpp-blocks/class-bpp-blocks.php:15` — extends
  `Automattic\WooCommerce\Blocks\Payments\Integrations\AbstractPaymentMethodType`.
- `includes/class-bpp-main.php:67–74` — `before_woocommerce_init` declares
  HPOS / cart_checkout_blocks compatibility.
- `includes/class-bpp-main.php:101` — `add_filter(
  'woocommerce_payment_gateways', …)`.
- `includes/class-bpp-main.php:125–128` — `woocommerce_after_my_account`,
  `woocommerce_thankyou_bpp_card`, `woocommerce_view_order`,
  `woocommerce_thankyou_order_received_text`.
- `includes/class-bpp-helpers.php:341–346` — `is_card_order()` uses
  `$order->get_payment_method()`.
- `includes/class-bpp-wallet.php:53–57` — `wc_get_order()`,
  `$order->get_total()`, `$order->payment_complete()`,
  `wc_reduce_stock_levels()`.
- `includes/class-bpp-notifications.php:249–253` — WC hooks
  `woocommerce_order_status_pending_to_on-hold`,
  `woocommerce_low_stock`, `woocommerce_no_stock`.
- `includes/class-bpp-report.php:104–126` — HPOS-aware SQL joining
  `wp_wc_orders` or `wp_posts`+`wp_postmeta`.
- `balepay-pro.php:68–93` — HPOS, cart_checkout_blocks, payment-method
  type registration.

### 2.8 Weak webhook validation (no signature, no idempotency, no amount verification on inbound)
- `includes/class-bpp-webhook.php:70–94` — webhook authentication is a
  *static shared secret* in a header. There is no HMAC over the body, no
  timestamp freshness check, no `update_id` deduplication. A replay of a
  captured webhook body will be re-processed.
- `includes/class-bpp-wallet.php:155–216` — `handle_successful_payment()`
  **does** verify `total_amount` against `expected_rial` (line 175) —
  good. But the *entire* successful_payment payload is trusted as-is;
  there is no server-to-server verification call to Bale (no such API
  exists, see §3.7), so the security rests entirely on the webhook
  secret. If the secret leaks (see §2.1 for the URL leak), an attacker
  can forge `successful_payment` events and credit orders.
- `includes/class-bpp-wallet.php:120–145` — `handle_pre_checkout()` has
  no replay protection beyond `needs_payment()`. A replayed pre-checkout
  just re-approves; not catastrophic but sloppy.
- `includes/class-bpp-snapppay.php:338–386` — the gateway callback
  accepts `state`, `paymentToken`, `wc_order` from `$_POST`/`$_GET` with
  **no signature verification**. An attacker who knows `wc_order` can
  POST `state=OK&paymentToken=<any-token>` to the callback URL. The
  server-side `verify()` then calls SnappPay's verify with the
  attacker-supplied `paymentToken` — if it happens to be a valid paid
  token for a *different* order, the attacker can mis-credit the order.
  No amount check on the SnappPay callback.
- `includes/class-bpp-digipay.php:383–413` — the DigiPay callback reads
  `result`, `amount`, `trackingCode`, `type` from `$_POST`. **Does**
  check `amount === expected` (line 408) — better than SnappPay — but
  still no signature. An attacker can POST `result=SUCCESS&amount=<right
  amount>&trackingCode=<any-paid-tracking-code>`; the server-side verify
  call uses the attacker-supplied `trackingCode`.

### 2.9 Weak callback validation
- `includes/class-bpp-webhook.php:259–262` — `expires` check is OK, but
  the default `expires` is `time() + 3600` for verification buttons
  (`notifications.php:161`) — i.e., buttons are valid for 1 hour. If a
  admin's chat is compromised or the admin message is forwarded, the
  button is replayable for an hour.
- `includes/class-bpp-webhook.php:251` — `expected =
  $this->helpers->sign( "cb:{$order_id}:{$action}:{$expires}:{$platform}" )`
  — the signature scheme is *self-invented* (not a Bale-native scheme).
  It is cryptographically sound (HMAC-SHA256 with constant-time compare
  via `hash_equals`), but the *trust model* is fragile: anyone who
  compromises `webhook_secret` (URL-leaked per §2.1) and
  `wp_salt('nonce')` can mint arbitrary admin-action buttons.
- `includes/class-bpp-verification.php:106–112` — only `has_status
  ('on-hold')` is checked for anti-replay. If a callback is replayed
  *while* the order is on-hold (e.g., the admin pressed Reject, then
  the attacker replays the older Approve callback within 60 s before
  undo expires), the atomic lock is the only defence — and its TTL is
  10 s (line 48).

### 2.10 Global-state abuse
- `balepay-pro.php:30–34` — `$GLOBALS['bpp_tables']` global array.
- `includes/class-bpp-main.php:67–71` — writes the global in the
  constructor.
- `includes/class-bpp-helpers.php:553`, `class-bpp-bot-users.php:39`,
  `class-bpp-wallet.php:227`, `class-bpp-verification.php:278`,
  `class-bpp-receipt.php:179`, `class-bpp-ajax.php:272`,
  `class-bpp-report.php:100, 161, 170` — all read
  `$GLOBALS['bpp_tables']['…']` directly inside business logic. No DI.
- `balepay-pro.php:61–63` — `function bpp() { return BPP_Main::instance(); }`
  is a global singleton accessor used pervasively: e.g.,
  `class-bpp-webhook.php:121, 123, 135, 296, 298, 310, 332`,
  `class-bpp-wallet.php:201, 208, 211`,
  `class-bpp-verification.php:152, 256`,
  `class-bpp-snapppay.php:28, 47, 64, 113, 142, 383`,
  `class-bpp-digipay.php:67, 105, 415, 434, 458`,
  `class-bpp-receipt.php:159, 160`,
  `class-bpp-ajax.php:221, 239, 253, 263, 291, 309, 313, 341, 346, 362,
  376, 393, 402, 403, 419, 426`.

### 2.11 Plaintext OTP storage / logging
- The plugin does **not** implement OTP. (§1.9.) So there is no plaintext
  OTP *storage* to reject. However, the following related issues exist:
  - `includes/class-bpp-digipay.php:42–46, 133–137` — DigiPay
    `access_token` and `refresh_token` are stored in plaintext in
    `wp_options.bpp_digipay_tokens` (autoload=false but unencrypted),
    unlike all other credentials which use `BPP_Helpers::set_secret()`.
    These tokens grant installment-payment creation authority and should
    be encrypted at rest.
  - `includes/class-bpp-bot-users.php:262` and
    `class-bpp-webhook.php:323–325` — `bpp_messages.file_url` stores the
    bot-token-bearing file URL in the DB (see §2.1).
  - `includes/class-bpp-helpers.php:551–572` — the log table stores any
    string passed to `log()`. While the plugin is careful with most
    calls, the SMS username is implicitly logged via the URL on failures
    (`class-bpp-sms.php:79–85`).

### 2.12 Other weaknesses discovered
- `includes/class-bpp-user-link.php:67–72` — link-code entropy is only
  6 alphanumeric chars (36^6 ≈ 2.2 · 10^9). Combined with the 600-s TTL
  and the 10-attempt cap, brute force is bounded but the search space
  is small; an attacker who can enumerate `/start BLP-XXXXXX.{…}` at
  ~3.7 k req/s (well within Bale's rate limits if delivered via webhook)
  could enumerate the entire space inside 7 days.
- `includes/class-bpp-user-link.php:179` — `update_user_meta($user->ID,
  $meta_key, (string)$chat_id)` silently overwrites the previous chat
  binding. If user A's chat is bound and then attacker generates a fresh
  code for user A (by phishing the user into clicking a malicious deep
  link) the old binding is replaced, no warning, no revocation event.
- `includes/class-bpp-snapppay.php:332` —
  `echo '<script>window.location.href=' . wp_json_encode( $resp['
  response']['paymentPageUrl'] ) . ';</script>';`
  `wp_json_encode` does produce JSON-safe JS string literals, but the
  value comes from SnappPay's API. If SnappPay (or a MITM with TLS
  verification off) injects a string containing `</script>`, the page
  context breaks out. Low severity but worth noting.
- `includes/class-bpp-bot-api.php:177` — `openssl_encrypt` uses
  `openssl_encrypt($plain, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv,
  $tag, '', 16)` with empty AAD. There is no key-rotation strategy; if
  the encryption key changes (site migration, salt rotation), all
  encrypted secrets become undecryptable with no fallback.
- `includes/class-bpp-helpers.php:155–160` — encryption key fallback
  is `wp_salt('auth')`. If `BPP_ENCRYPTION_KEY` is not defined in
  `wp-config.php`, all "encrypted" credentials are decryptable by
  anyone with a DB dump + the auth salt.
- `includes/class-bpp-bot-api.php:420–428` — `answer_pre_checkout()`
  sends `ok` as the **string** `'true'` / `'false'` rather than a JSON
  boolean. WP HTTP API serializes the body as form-urlencoded, so the
  receiving Bale API sees `ok=true`. This is non-standard and brittle;
  a future Bale API version enforcing JSON booleans would break this.
- `includes/class-bpp-bot-api.php:73` — token-format regex
  `^[0-9]{6,12}:[A-Za-z0-9_\-]{30,50}$`. Telegram tokens are
  `[0-9]{6,12}:[A-Za-z0-9_-]{35}` typically. The `{30,50}` is
  permissive. Not a vulnerability, just a permissive validator.
- `includes/class-bpp-webhook.php:147–156` — `detect_platform()` picks
  the platform by *which token is set*. If both bale and telegram
  tokens are set (the supported multi-bot configuration), the platform
  is guessed as `bale` — meaning a Telegram-originated webhook update
  would be processed under the wrong platform. The platform hint comes
  from the `?platform=` query param in the registered URL, which the
  attacker could spoof if the webhook secret leaks (see §2.1).
- `includes/class-bpp-snapppay.php:329` — `paymentToken` is stored in
  order meta `_bpp_spp_token`. The callback at line 358 falls back to
  reading `paymentToken` from `$_POST` if the meta is empty — meaning
  the meta is **authoritative** only if non-empty; otherwise the
  attacker controls the value.
- `includes/class-bpp-verification.php:179–180` — the undo callback_data
  is `bpp:<order>:undo:<expires>:<sig>` and the expiry is 60 s. The
  `expires` field is signed but, because the HMAC key is URL-leakable
  (§2.1), an attacker who captures the secret can mint undo buttons
  past the 60-s window by signing a new `expires` far in the future.
- `includes/class-bpp-report.php:138–140` — `gmdate( 'Y-m-d H:i:s',
  time() - $period * DAY_IN_SECONDS )` for "users registered since" —
  this query uses `wp_users.user_registered` which is in *site local
  time*, not GMT; the comparison mixes GMT and local time. Data-correctness
  bug, not security.
- `includes/blocks/class-bpp-blocks.php` — the checkout-block JS file
  (`assets/js/blocks/balepay-pro-blocks.js`) is tiny and does not perform
  any client-side validation; it relies entirely on the server. OK.

---

## 3. BALE PAYMENT PROTOCOL (canonical, observed)

This section documents the *real* Bale Bot/Bale Payment API as actually
exercised by the plugin. Where the plugin invents protocol steps that the
Bale API does not provide, they are flagged at the end.

### 3.1 Bale Bot API base URL and endpoints
- Bot API base: `https://tapi.bale.ai/bot<TOKEN>/<method>`
  (file: `class-bpp-bot-api.php:27–30`)
- File API base: `https://tapi.bale.ai/file/bot<TOKEN>/<file_path>`
  (file: `class-bpp-bot-api.php:373`)
- Methods actually invoked by BPP (the full surface observed):
  | Method | Used in | Purpose |
  |---|---|---|
  | `getMe` | bot-api.php:184, 329; user-link.php:103 | identity probe + deep-link username |
  | `sendMessage` | bot-api.php:234; notifications.php:75, 123, 187, … | all text notifications + inline-keyboard delivery |
  | `editMessageText` | bot-api.php:258; verification.php:123, 232 | mutate admin message after approve/reject/undo |
  | `answerCallbackQuery` | bot-api.php:278; webhook.php:255, 260, 268; verification.php multiple | acknowledge inline button tap |
  | `setWebhook` | bot-api.php:293; webhook.php:186 | register webhook |
  | `deleteWebhook` | bot-api.php:309 | teardown webhook (not called in production flow) |
  | `getWebhookInfo` | bot-api.php:319; webhook.php:202; main.php:273 | health probe |
  | `sendPhoto` | bot-api.php:343 | (declared; only used if extension added later) |
  | `getFile` | bot-api.php:367; webhook.php:322 | resolve photo file_id → URL |
  | `sendInvoice` | bot-api.php:392; wallet.php:73 | deliver wallet invoice to chat |
  | `answerPreCheckoutQuery` | bot-api.php:420; wallet.php:142 | approve/reject pre-checkout |

- Methods BPP does NOT call but which the Bale/Telegram Bot API exposes:
  `getUpdates`, `setMyCommands`, `deleteMyCommands`, `getMyCommands`,
  `sendChatAction`, `sendDocument`, `sendMediaGroup`, `forwardMessage`,
  `copyMessage`, `deleteMessage`, `restrictChatMember`, `kickChatMember`,
  `createInvoiceLink` ( Telegram-only; Bale does not expose a hosted-
  payment-link endpoint apart from `sendInvoice`), `answerShippingQuery`,
  `getUserProfilePhotos`, `exportChatInviteLink`, etc.

### 3.2 Bale Payment API base URL and endpoints
- There is **no separate** "Bale Payment API" base URL observed in the
  plugin. The Bale payment flow is fully encapsulated inside the Bot API
  via `sendInvoice` + `answerPreCheckoutQuery` + `successful_payment`
  events, exactly mirroring the Telegram Bot API payments flow
  (https://core.telegram.org/bots/payments). The "provider_token" passed
  to `sendInvoice` is the Bale-issued payment-provider token (analogous
  to Telegram's `provider_token` from `@BotFather` → "Payments" section).
- No additional endpoints are documented or used for `verify`,
  `capture`, `refund`, etc. — **Bale does not appear to expose a
  server-side verify endpoint**, unlike SnappPay/DigiPay.

### 3.3 Invoice creation request/response fields (Bale)
Request (file: `class-bpp-bot-api.php:392–409`):
```jsonc
POST https://tapi.bale.ai/bot<TOKEN>/sendInvoice
Content-Type: application/json  (or form-urlencoded via wp_remote_post)
Accept: application/json
User-Agent: BalePayPro/1.0.0

{
  "chat_id":         <int chat_id of the customer>,
  "title":           "<string, ≤32 chars>",
  "description":     "<string, ≤255 chars>",
  "payload":         "<string, free-form; BPP uses 'bpp_order_<order_id>'>",
  "provider_token":  "<Bale-issued provider_token, e.g. 123456789:TEST:XXX>",
  "prices":          "[{\"label\":\"<title>\",\"amount\":<int IRR minor units>}]",
  "currency":         "IRR"
}
```
Notes:
- `prices` is JSON-encoded **as a string**, not as a JSON array — the
  Bale API (like Telegram's) accepts `prices` either as a JSON-encoded
  string or as a multipart field; BPP uses the string form via
  `wp_json_encode`.
- `amount` is in **integer minor units of the currency**. For `IRR`, the
  minor unit IS the rial (IRR has no subunit), so amount = total rials
  (e.g. 1,000,000,000 IRR = 100,000,000 rial). BPP computes this as
  `round(order_total_in_toman * 10)`.
- No `need_name`, `need_phone_number`, `need_email`, `need_shipping_address`,
  `is_flexible`, `photo_url`, `start_parameter`, `provider_data` fields
  are sent.

Response shape (typical Bot API envelope):
```jsonc
{
  "ok": true,
  "result": {
    "message_id":  <int>,
    "chat":  { "id": <int>, … },
    "invoice": { … },
    "successful_payment": null  // only present on success
  }
}
```
BPP treats only `ok` as success and ignores the `result` body — i.e., it
does not persist the `message_id` of the invoice message it sent. This is
a missed opportunity (one could later `editMessageReplyMarkup` to expire
the invoice).

### 3.4 Pre-checkout payload shape and response requirements
Inbound pre-checkout (delivered to `POST /webhook?platform=bale&secret=…`):
```jsonc
{
  "update_id": <int>,
  "pre_checkout_query": {
    "id": "<query_id string>",
    "from": { "id": <int>, "is_bot": false, "first_name": "…", "username": "…" },
    "currency": "IRR",
    "total_amount": <int rial>,
    "invoice_payload": "<the payload string passed to sendInvoice>",
    "shipping_option": null
  }
}
```
Response requirement (file: `class-bpp-bot-api.php:420–428`):
```
POST /bot<TOKEN>/answerPreCheckoutQuery
{
  "pre_checkout_query_id": "<query_id>",
  "ok": "true" | "false",                // ← BPP sends STRING, not bool
  "error_message": "<optional, only if ok=false>"
}
```
Notes:
- BPP sends `ok` as the literal strings `"true"`/`"false"` (file:
  `class-bpp-bot-api.php:423`). Telegram/Bale expect a JSON boolean.
  wp_remote_post serialises the body as form-urlencoded; Bale's parser
  happens to coerce string-"true" to boolean true. This is brittle and
  should be sent as a JSON boolean in POSTYAR.
- BPP's only validation in pre-checkout is "does the order exist and
  `needs_payment()`?" (file: `class-bpp-wallet.php:131–139`). It does
  NOT verify `total_amount` against the order total at pre-checkout
  time — it relies on the `successful_payment` event for the hard check.
- If BPP fails to respond to `answerPreCheckoutQuery` within ~10 s,
  Bale fails the payment. BPP's response is synchronous, so this is OK
  under normal load, but a slow DB could time out the pre-checkout.

### 3.5 Successful_payment event payload shape
Inbound successful_payment (file: `class-bpp-wallet.php:155–216`):
```jsonc
{
  "update_id": <int>,
  "message": {
    "message_id": <int>,
    "from": { "id": <int>, … },
    "chat": { "id": <int>, … },
    "date": <unix>,
    "successful_payment": {
      "invoice_payload":          "<the payload string>",
      "currency":                  "IRR",
      "total_amount":              <int rial>,
      "telegram_payment_charge_id":  "<charge id (Bale/Telegram)>",
      "provider_payment_charge_id":  "<provider-side charge id>",
      "shipping_option_id": null,
      "order_info": null
    }
  }
}
```
Trustworthy vs. forgeable fields (assuming the webhook secret holds):
- `update_id` — sequence number issued by Bale; **trustworthy**, but BPP
  does not use it (no dedup, see §2.8).
- `invoice_payload` — echoed back from the `sendInvoice` call.
  **Trustworthy** insofar as Bale does not allow clients to alter it.
- `currency`, `total_amount` — **trustworthy**; set by Bale from the
  `sendInvoice` prices. (BPP verifies `total_amount` against the order
  total at line 175 — good.)
- `telegram_payment_charge_id` — issued by Bale. **Trustworthy** in the
  sense that Bale generates it; but the field name is
  `telegram_payment_charge_id` even on the Bale platform, suggesting
  Bale copied the Telegram schema verbatim. Treat as authoritative for
  idempotency.
- `provider_payment_charge_id` — issued by the *payment provider* (Bale
  Wallet). **Trustworthy** if you trust the provider; use as a
  secondary idempotency key.
- `from.id`, `chat.id` — issued by Bale. **Trustworthy** in transit.
  BPP does NOT verify that `from.id` matches the order's customer chat
  — i.e., if user A's chat_id was linked to the order, but user B pays
  the invoice (because user A forwarded the invoice message to B), the
  payment still credits user A's order. This is by design (forwardable
  invoices are a feature) but is a behavioural gotcha.

### 3.6 Server-side verification steps BPP actually performs
On `successful_payment` (file: `class-bpp-wallet.php:155–216`):
1. Parse `invoice_payload` → extract `order_id` from `bpp_order_<id>`.
2. `wc_get_order(order_id)` → exists?
3. Compute `expected_rial = round(order_total * 10)` (float — §2.3).
4. **Hard amount check**: `total_amount !== expected_rial` → reject +
   flag `_bpp_wallet_mismatch` + return false (line 175).
5. Persist meta: `_bpp_wallet_paid=1`, `_bpp_wallet_charge_id`,
   `_bpp_wallet_provider_charge`, `_transaction_id`.
6. `order->update_status(status_after_approve, note)` (default
   `processing`).
7. `order->payment_complete(charge_id)`.
8. `wc_reduce_stock_levels(order_id)` if available.
9. `save_transaction()` — **DELETE+INSERT** (§2.5) on
   `bpp_transactions` with `transaction_type=wallet`,
   `status=processing`, `decision=approve`, `amount=expected_rial`,
   `tracking_code=charge_id`, `receipt_note='کیف پول بله — پیگیری: ' +
   provider_chg`.
10. Notify customer + admins.

### 3.7 Server-side verification steps BPP **skips**
- ❌ No `update_id` deduplication (replay of `successful_payment` would
  re-credit the order — *partially* mitigated by `needs_payment()` at
  the pre-checkout stage, but the *successful_payment* path does not
  check `needs_payment()`).
- ❌ No server-to-server verify call to Bale (no such API exists in the
  observed protocol).
- ❌ No HMAC signature verification on the webhook body. Only the static
  `secret_token` header is checked.
- ❌ No timestamp freshness on the webhook body (no `date` field
  validation).
- ❌ No verification that `from.id` corresponds to the order's customer.
- ❌ No persistence of `update_id` anywhere.

### 3.8 Idempotency fields
- The plugin uses `provider_payment_charge_id` and
  `telegram_payment_charge_id` as the canonical charge IDs (stored in
  order meta `_bpp_wallet_charge_id` and `_bpp_wallet_provider_charge`,
  and in `bpp_transactions.tracking_code`). However, these are **not
  used as idempotency keys** — there is no `UNIQUE` constraint on
  `bpp_transactions.tracking_code` and no pre-insert check for duplicate
  charge IDs.
- For card-to-card, no idempotency at all: each `process_verification`
  call rewrites the same `bpp_transactions` row.
- For SnappPay/DigiPay, the `paymentToken`/`trackingCode` is similarly
  not deduplicated.

### 3.9 HMAC / signature scheme
- **Bale-native**: None observed. The only Bale-supplied security
  primitive is the `secret_token` registered via `setWebhook` and echoed
  back as `X-Telegram-Bot-Api-Secret-Token` (Telegram-native; Bale
  accepts the same field). BPP assumes Bale also sends `X-Bale-Secret`
  (file: `class-bpp-webhook.php:81–83`) but provides no evidence that
  Bale actually sends this header. **In practice BPP relies on the
  query-string `secret` for Bale** (file: `class-bpp-webhook.php:85–91`),
  which is the URL-leak vulnerability in §2.1.
- **Plugin-invented**: HMAC-SHA256 over `cb:<order>:<action>:<expires>:
  <platform>` (for inline buttons) and over `link:<user>:<rand>:<expires>`
  (for user-link codes). Key = `sha256(webhook_secret + "|" +
  wp_salt('nonce'))`. This is *not* part of the Bale protocol — it is
  purely a BPP-internal anti-forgery scheme for inline-button payloads.

### 3.10 Invented protocol steps (flags)
- ⚠️ BPP *assumes* Bale sends `X-Bale-Secret` as a webhook header
  (webhook.php:81). No public Bale documentation confirms this; the
  fallback to query-string `secret` suggests the plugin author was not
  certain either. **POSTYAR must NOT assume this header exists**; treat
  Bale webhooks as header-less and require a per-request HMAC that
  POSTYAR verifies (see §4.3).
- ⚠️ BPP *assumes* Bale accepts `secret_token` in `setWebhook` and
  echoes it back (bot-api.php:295–299). This is true for Telegram; for
  Bale it may be silently ignored. POSTYAR should verify this empirically
  with a live Bale bot before relying on it.
- ⚠️ BPP sends `ok` as a string in `answerPreCheckoutQuery`
  (bot-api.php:423). The Bale API spec (mirroring Telegram's) requires a
  boolean. This works today but is non-canonical.
- ⚠️ BPP's `bp_order_<id>` payload format is a free-form string. The
  Bale spec recommends payloads ≤ 128 bytes. BPP is compliant but the
  scheme embeds the order_id unencrypted; if the webhook secret leaks,
  an attacker can mint `successful_payment` events for arbitrary orders
  (no signature on the payload itself).
- ⚠️ BPP *does not* call any "verify", "capture", or "refund" endpoint
  for the Bale wallet flow. There is no documented API for these — once
  a `successful_payment` is received, the money is in the merchant's
  wallet. POSTYAR must treat this as **no-server-side-verify** and
  compensate with strict webhook authentication + idempotency.

---

## 4. REIMPLEMENTATION RECOMMENDATIONS for POSTYAR

This section maps each valuable behaviour from §1 into a clean, secure,
native-Node equivalent. The numbered items match §1's numbers.

### 4.1 Bale / Telegram Bot API client (Node)
- Implement a single `BotApiClient` class per platform, using
  `undici` (Node ≥ 18 has it built-in; otherwise `got` or `node-fetch`
  v3). Avoid `axios` for size.
- Base URLs:
  - Bale: `https://tapi.bale.ai/bot<token>/<method>`
  - Telegram: `https://api.telegram.org/bot<token>/<method>`
- Transport hardening:
  - **Always** verify TLS (`rejectUnauthorized: true`, no `NODE_TLS_REJECT_UNAUTHORIZED=0`).
    Do NOT expose an admin toggle for TLS verification. If a customer's
    host has a stale CA bundle, fix the CA bundle, do not weaken TLS.
  - Token in URL path is unavoidable (it is the Bot API contract);
    mitigate by:
    - pinning the bot token in a Node-side secrets manager (SOPS,
      AWS SSM, Doppler, HashiCorp Vault) and reading at boot only;
    - never logging outbound URLs (use a redacting logger that masks
      the `bot<token>/` segment);
    - using `undici`'s `Agent` with `connect: { timeout: 10000 }` and
      `keepAlive: true` for connection reuse.
- Implement `getMe`, `sendMessage`, `editMessageText`,
  `answerCallbackQuery`, `setWebhook`, `deleteWebhook`, `getWebhookInfo`,
  `sendPhoto`, `getFile`, `sendInvoice`, `answerPreCheckoutQuery` —
  the same surface as BPP.
- **Do not** implement `getUpdates` (long-poll); use webhooks only.
- Diagnostic: implement a `diagnose()` method that runs:
  1. token-format check (`/^\d{6,12}:[A-Za-z0-9_-]{30,50}$/`)
  2. DNS resolution of `tapi.bale.ai`
  3. TLS handshake probe (a raw `tls.connect()` to port 443 with a
     5-s timeout) — capture the exact OpenSSL error string.
  4. `getMe` call with full TLS verification.
  5. If step 4 fails with a TLS error, retry with `ca: <Mozilla CA
     bundle>` to detect stale-host CA bundles — **never** retry with
     `rejectUnauthorized: false`.
- For `getFile` URLs, do **not** persist the token-bearing URL in the
  DB. Instead, immediately download the file bytes via `fetch(url)`
  in the webhook handler and store them in private object storage; the
  DB stores only an internal object-key (no token, no public URL).

### 4.2 Webhook registration and update routing (Node)
- Single inbound endpoint: `POST /api/webhooks/bale` and
  `POST /api/webhooks/telegram` (one per platform — the platform is
  encoded in the URL path, NOT in a query param).
- Webhook registration payload to Bale:
  ```jsonc
  { "url": "https://postyar.example.com/api/webhooks/bale",
    "secret_token": "<random 32-byte base64url>" }
  ```
  The `secret_token` is stored server-side and compared with
  `crypto.timingSafeEqual` against the inbound
  `X-Telegram-Bot-Api-Secret-Token` header. **Never** accept the secret
  from a query param.
- If Bale does not echo `secret_token` back as a header (verify
  empirically), fall back to a per-request HMAC scheme: have POSTYAR
  register the webhook with no secret, then verify each inbound request
  by recomputing `HMAC-SHA256(webhook_secret, body)` and comparing
  against an `X-Postyar-Signature` header that POSTYAR injects via a
  reverse proxy in front of the webhook. **This requires Bale to
  tolerate a stateless webhook with no secret_token support** — if Bale
  does not natively sign requests, the only safe option is to require
  that the webhook URL is reachable only via an authenticated reverse
  proxy (e.g., Cloudflare Access, mTLS, or a Cloudflare Worker that
  injects the HMAC).
- Update routing: dispatch `callback_query`, `pre_checkout_query`,
  `message.successful_payment`, `message.text` to handlers.
- Persist `update_id` with `UNIQUE(update_id, platform)` in a
  `bot_updates_seen` table; insert-or-ignore on each webhook; if the
  row already existed, return 200 OK and skip processing (idempotent).

### 4.3 Wallet invoice → pre-checkout → successful_payment flow (Node)
- Money math: use **integer minor units only**. Store all amounts as
  `bigint` in IRR (1 IRT = 10 IRR). Conversion IRT→IRR is
  `tomanInt.times(10)`. No `Number` arithmetic on money. Use the
  `bigint-money` or `dinero.js` v2 library or roll your own with
  `BigInt`.
- Invoice creation:
  ```ts
  const amountIrr = order.totalToman * 10n;     // bigint
  const payload = `postyar:${order.id}:${nonce}`;
  await bale.sendInvoice({
    chat_id: order.customerBaleChatId,
    title: `Order #${order.id}`,
    description: order.items.map(i => `${i.name} × ${i.qty}`).join(', '),
    payload,
    provider_token: secrets.baleProviderToken,
    prices: [{ label: `Order #${order.id}`, amount: Number(amountIrr) }],
    currency: 'IRR',
  });
  ```
  The payload should include a per-attempt nonce so a replayed
  `successful_payment` for a stale invoice attempt is detectable.
- Pre-checkout handler:
  - Parse `invoice_payload` → `order_id`, `nonce`.
  - Verify `order.status === 'pending'` AND
    `order.invoice_nonce === nonce` (anti-replay).
  - Verify `total_amount` against `order.totalIrr` at pre-checkout
    time too (BPP skips this; POSTYAR should not).
  - Respond with `ok: true` (boolean, not string).
- Successful_payment handler:
  - Parse `invoice_payload` → `order_id`, `nonce`.
  - Verify `order.status === 'pending'`.
  - **Hard amount check** (`total_amount === order.totalIrr`).
  - **Idempotency**: insert into `wallet_charges(charge_id UNIQUE,
    order_id, amount, provider_charge, created_at)`. If insert fails
    on UNIQUE, log "duplicate charge ignored" and return 200 OK.
  - Atomically transition `order.status` from `pending` → `paid` using
    a DB transaction with row-level lock (`SELECT … FOR UPDATE`).
  - Decrement stock inside the same transaction.
  - Notify customer + admins (asynchronously, after commit).
- No `verify` call exists for the Bale wallet; the `successful_payment`
  event IS the verification.

### 4.4 Pre-checkout behaviour (Node)
- Implement exactly as in §4.3: validate order exists, is unpaid, the
  payload matches a known invoice nonce, and the amount matches.
- Respond with a boolean `ok`.
- Respond within 8 s; use a fast DB lookup path.

### 4.5 Card-to-card manual verification (Node)
- Replace WC order status with a POSTYAR-native `orders` table.
- Receipt upload endpoint: `POST /api/orders/:id/receipt` (multipart).
- Inline-button callback_data scheme:
  ```
  bpp:<orderId>:<action>:<expires>:<sig>
  ```
  where `<sig>` is the first 16 hex chars of
  `HMAC-SHA256(hmacKey, "cb:<orderId>:<action>:<expires>:<platform>")`.
  The `hmacKey` should be **distinct** from the webhook secret (use
  HKDF to derive `callbackKey = HKDF(webhookSecret, "bpp-callback-v1")`
  and `linkKey = HKDF(webhookSecret, "bpp-link-v1")`). Do not reuse
  WP salts.
- Default `expires`: 5 min for verification buttons (shorter than
  BPP's 1 hour) — reduces replay window.
- Atomic lock: use a Redis `SET NX PX 10000` with a per-order key
  `bpp:lock:<orderId>`; release on completion; TTL = 10 s. This is a
  *real* distributed lock, unlike the WP-option lock.
- Decision transition: same DB transaction + row-level lock as wallet.
- Append-only ledger: insert a new row in `order_events(orderId,
  type, decision, adminId, createdAt)` for every approve/reject/undo;
  never UPDATE or DELETE.
- Undo: TTL 60 s, same as BPP; on undo, transition back to
  `pending_verification` and insert a new `order_events` row.

### 4.6 User-linking mechanism (Node)
- Code shape: `BLP-<base32(randBytes(9))>.<base64url(HMAC(linkKey,
  "link:<userId>:<rand>:<expires>")[0:16])>.<base36(expires)>`.
  Use **18 chars** of randomness (not 6) — `9 bytes` = 72 bits of
  entropy, ~4.7 · 10^21 possibilities, brute-force-infeasible.
- TTL: 600 s (same as BPP).
- Max attempts: 5 per code (lower than BPP's 10). After 5 failures,
  invalidate the code and require regeneration.
- Single-use: delete the code on first successful link (same as BPP).
- Single-active-chat-per-user-per-platform: when a new chat is bound,
  emit a `user_chat_revoked` event for the previous chat (BPP silently
  overwrites — see §2.12).
- Delivery: same deep-link scheme (`https://ble.ir/<bot>?start=<code>` /
  `https://t.me/<bot>?start=<code>`).

### 4.7 Wallet ledger / transactions table (Node, append-only)
- Schema (PostgreSQL, append-only):
  ```sql
  CREATE TABLE order_events (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES orders(id),
    event_type TEXT NOT NULL CHECK (event_type IN
      ('created','receipt_uploaded','pre_checkout','wallet_paid',
       'admin_approved','admin_rejected','admin_undo','expired',
       'refunded','failed')),
    amount_irr BIGINT NOT NULL,                 -- integer minor units
    currency TEXT NOT NULL DEFAULT 'IRR',
    charge_id TEXT,                             -- telegram_payment_charge_id
    provider_charge_id TEXT,                    -- provider_payment_charge_id
    admin_chat_id TEXT,
    customer_chat_id TEXT,
    receipt_object_key TEXT,                    -- S3-style key, not URL
    note TEXT,
    hmac_payload TEXT,                          -- the signed payload
    hmac_sig TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE UNIQUE INDEX order_events_charge_id_unique
    ON order_events(charge_id) WHERE charge_id IS NOT NULL;
  CREATE INDEX order_events_order_id_created_at
    ON order_events(order_id, created_at);
  ```
- **Never** UPDATE or DELETE rows in `order_events`. Current state is
  derived as `SELECT … ORDER BY created_at DESC LIMIT 1`.
- A separate `orders` table holds the *current* status (`pending`,
  `on-hold`/`pending_verification`, `processing`/`paid`, `cancelled`,
  `refunded`, `failed`), updated atomically inside the same
  transaction that inserts the `order_events` row.

### 4.8 Receipt upload mechanism (Node, private storage)
- Endpoint: `POST /api/orders/:id/receipt` (multipart, JWT-authenticated).
- Validation:
  - Content-Type must be `image/jpeg`, `image/png`, or `image/webp`
    (server-side magic-byte check using `file-type` npm package, not
    trusting the client `Content-Type`).
  - Max size: 5 MiB enforced via a streaming parser that aborts on
    overflow (e.g., `@fastify/multipart` with `limits.fileSize: 5 *
    1024 * 1024`).
  - Re-encode the image via `sharp` to strip any embedded payloads
    (EXIF, ICC, IPTC) — defends against polyglot image/PHP files.
- Storage: write to **private** object storage (S3 / MinIO / R2 with
  `public: false`). Generate a 32-byte random object key. The DB stores
  only the object key, never a public URL.
- Access gate: a `GET /api/orders/:id/receipt` endpoint that verifies
  the caller is the order owner or an admin, then issues a short-lived
  (≤ 5 min) signed URL via S3 `getSignedUrl('getObject', …)` —
  no long-lived public URLs.
- No `.htaccess` reliance — Node does not run Apache; the storage is
  private by default.

### 4.9 OTP flow (Node, fresh design — BPP does not provide one)
- If POSTYAR needs SMS-OTP for customer verification at order time:
  - Generate a 6-digit code via `crypto.randomInt(0, 1_000_000)`,
    zero-padded to 6 digits.
  - **Hash** before storing: store only
    `bcrypt(otp + otpSalt + userId + expiresBucket)` in a
    `otp_attempts(user_id, hash, expires_at, attempts)` table.
    Never store plaintext OTP in DB or logs.
  - TTL: 120 s. Max attempts: 3. After 3 failures, invalidate.
  - Rate-limit the *send* endpoint: 1 OTP per 30 s per user, 5 per
    hour per IP.
  - Delivery: via Safir (`safir.bale.ai/api/v3/send_message`) — same
    payload as BPP — or via SMS (Melipayamak) but **POST** the
    credentials in the request body, not the URL (see §4.16).
  - On verify: `bcrypt.compare(userInput + otpSalt + userId + expires,
    storedHash)`; on success, delete the row.

### 4.10 Notification routing (Node, multi-channel)
- Single `Notifier` service with pluggable channels:
  - `BaleBotChannel` (uses the BotApiClient from §4.1)
  - `TelegramBotChannel` (same client, different base URL)
  - `SafirChannel` (one-way push)
  - `SmsChannel` (Melipayamak, but POST body, not URL — §4.16)
- Per-event routing config: store a JSON rule in DB
  `notification_rules(event_type, channel, enabled, min_severity)`.
- Queue via a job runner (BullMQ) so a slow channel doesn't block the
  request.

### 4.11 Admin actions & panel (Node, JWT-based)
- Replace WP nonce + capability with:
  - Short-lived JWT (15-min access + 7-day refresh) signed with
    ES256 (`crypto.jwt.sign` using `keypair`).
  - Per-action authorization checks (`can:approve_order`,
    `can:reject_order`, `can:undo`, `can:send_bulk`,
    `can:manage_users`, `can:view_logs`).
  - CSRF: since JWT is in `Authorization: Bearer`, CSRF is not
    applicable (no cookies). Add `SameSite=Strict` if cookies are used.
- Audit log: append every admin action to an `audit_log(adminId,
  action, targetId, ip, userAgent, createdAt)` table — BPP has no
  audit log.

### 4.12 Bale bot commands & menus & inline buttons (Node)
- Register commands via `setMyCommands` (BPP doesn't, but POSTYAR
  should — gives users a command picker):
  ```jsonc
  POST /bot<token>/setMyCommands
  { "commands": [
    { "command": "start", "description": "شروع" },
    { "command": "help", "description": "راهنما" },
    { "command": "track", "description": "رهگیری سفارش" },
    { "command": "link", "description": "اتصال حساب" }
  ]}
  ```
- Inline keyboards: same JSON shape as BPP
  (`{"inline_keyboard": [[{"text": …, "callback_data": …}]]}`) but
  with the hardened `callback_data` scheme from §4.5.
- Webhook handler parses `message.text` for `/start <code>`, `/help`,
  bare order-id (with Persian/Arabic digit normalisation, same as BPP).

### 4.13 SnappPay gateway abstraction (Node, with callback hardening)
- OAuth2 password grant → access_token. Cache in DB with
  `expires_at` column. Refresh proactively 5 min before expiry.
- Endpoints: same as BPP §1.13.
- **Callback hardening**:
  - Generate a per-order, random, signed callback URL:
    `https://postyar.example.com/api/gateways/snapppay/callback
    ?order=<id>&nonce=<random>&sig=<HMAC>`.
    The `sig` = `HMAC-SHA256(callbackKey, "spp:cb:<order>:<nonce>")`.
    SnappPay will append its own `paymentToken`, `state` etc. to this
    URL on redirect.
  - On callback, verify `sig` first; reject if invalid.
  - Server-side `verify(paymentToken)` → check `verify.response.amount
    === order.totalIrr` AND `verify.response.orderId === order.id`
    (SnappPay echoes the order_id from the `transactionId` you sent
    in `get_payment_token`).
  - Only then call `settle(paymentToken)`.
  - Idempotency: `INSERT INTO snapppay_charges(payment_token UNIQUE,
    order_id, amount_irr, status, created_at)`. ON CONFLICT DO
    NOTHING + return success.
- Refund: implement `process_refund` if needed.

### 4.14 DigiPay gateway abstraction (Node, with callback hardening)
- OAuth2 password/refresh grant. Cache tokens in DB with
  `expires_at`. **Encrypt** the access_token and refresh_token at
  rest using AES-256-GCM (BPP stores them plaintext — §2.11).
- Endpoints: same as BPP §1.14.
- Callback hardening: same signed-callback-URL scheme as §4.13.
- Server-side verify: same idempotency pattern.

### 4.15 Safir abstraction (Node)
- Endpoint: `POST https://safir.bale.ai/api/v3/send_message`
  (unchanged from BPP §1.15).
- Headers: `api-access-key` (from secrets manager), `Content-Type:
  application/json`.
- Body: same as BPP but use `crypto.randomBytes(16).toString('hex')`
  for `request_id`.
- Rate-limit the Safir channel to 10 req/s to avoid being throttled.

### 4.16 SMS abstraction (Node, credentials in body)
- Endpoint: `POST https://api.payamak-panel.com/post/Send.asmx/
  SendSimpleSMS2`
- Body (form-urlencoded, NOT URL query):
  ```
  username=<…>&password=<…>&from=<…>&to=<…>&text=<…>&isflash=false
  ```
- Use `undici.request` with `body: new URLSearchParams({...})`.
- Store `username`, `password`, `from` in the secrets manager.
- Response: literal `1` / `true` → success.

### 4.17 Woocommerce-ish content transformation (Node)
- Implement a `MessageRenderer` with the same template variables as
  BPP §1.17: `{order_id} {total} {customer} {phone} {date} {time}
  {items} {cards} {deadline} {order_url} {note}`.
- Persian-digit conversion: a 10-element lookup table.
- Persian money formatter: `Intl.NumberFormat('fa-IR')` for thousands
  separators, then digit substitution.
- Gregorian→Jalali: use the `jalaali-js` npm package or port BPP's
  algorithm verbatim (it's correct, just port the math).
- Card formatting: 16-digit → `1234-5678-9012-3456`.

### 4.18 Health & diagnostic surface (Node)
- `GET /api/admin/health` returns:
  ```jsonc
  {
    "node": "<version>",
    "postgres": "<version>",
    "redis": "<version>",
    "openssl": "<version>",
    "bot_bale": { "connected": true, "username": "…", "webhook":
      "https://…", "last_error": null, "pending_updates": 0 },
    "bot_telegram": { … },
    "gateways": {
      "snapppay": { "configured": true, "last_oauth_at": "…" },
      "digipay": { "configured": true, "last_oauth_at": "…" }
    },
    "channels": {
      "safir": { "configured": true },
      "sms": { "configured": true }
    }
  }
  ```
- Diagnostic: `POST /api/admin/diagnose` runs `BotApiClient.diagnose()`
  from §4.1 and returns the step-by-step result.

### 4.19 Webhook health self-heal (Node)
- Cron job (every 6 h) calls `getWebhookInfo` per platform; if
  `url` is empty or `pending_update_count > 100` or
  `last_error_message` is non-empty, re-register the webhook and
  log to `audit_log`.

### 4.20 Daily maintenance (Node)
- Cron job (daily at 03:00 site-local):
  - Expire `pending` orders older than `payment_deadline_hours` (default
    2 h) → `cancelled` with an `order_events` row.
  - Send reminders for `pending` orders older than
    `remind_pending_hours` (default 12 h) → fire-and-forget via the
    Notifier.

### 4.21 Scheduled reports (Node)
- Cron job (daily at 08:00 or weekly depending on config):
  - Aggregate from `order_events` (append-only) for the period.
  - Format Persian text.
  - Push via `Notifier` to admin chats.

### 4.22 Secrets management (Node, unified)
- All credentials (bot tokens, provider tokens, gateway OAuth
  secrets, Safir access key, SMS credentials, HMAC keys) live in a
  secrets manager (SOPS-encrypted YAML at boot, or Vault at runtime).
- At boot, POSTYAR reads them into a `secrets` object held in
  memory only. They never appear in:
  - URLs
  - DB columns
  - log lines (logger has a redactor that masks anything matching the
    secret values)
  - error responses
- Encryption at rest (for the rare cases where a secret must be
  persisted, e.g., the DigiPay refresh_token):
  - AES-256-GCM with a key from `process.env.POSTYAR_KEK` (a 32-byte
    base64url value, rotated quarterly).
  - Schema: `ciphertext TEXT, iv TEXT, tag TEXT` columns; never store
    the key alongside.

### 4.23 Fail-closed webhook posture (Node, summary)
The single most important POSTYAR rule for inbound webhooks:
- **No secret in URL**. The webhook URL contains only the platform name:
  `/api/webhooks/bale`, `/api/webhooks/telegram`.
- **No secret in query string**.
- **Secret in header** (`X-Telegram-Bot-Api-Secret-Token` for Telegram;
  for Bale, verify empirically — if absent, require mTLS or HMAC injected
  by the reverse proxy).
- **Constant-time compare** (`crypto.timingSafeEqual`) on the header
  value.
- **Body HMAC**: if the platform supports body HMAC (Telegram does not,
  but a reverse proxy can inject it), verify it. Otherwise the secret
  header is the only defence — treat it as such and rotate quarterly.
- **`update_id` dedup**: every inbound update is inserted into
  `bot_updates_seen(update_id, platform) UNIQUE`; duplicates return
  200 OK and skip processing.
- **No `tls_verify=false` toggle**: TLS verification is always on. No
  admin setting to disable it. If a host has a CA problem, fix the CA.
- **Replay protection**: signed `expires` field on every
  `callback_data`; default 5-min TTL for action buttons.
- **Hard amount verification**: every `successful_payment` and every
  gateway callback verifies the amount server-side against the order
  total.
- **Idempotency keys**: every payment-source charge ID has a `UNIQUE`
  constraint; duplicate inserts fail silently and safely.
- **Atomic state transitions**: every order-status transition is a
  DB transaction with `SELECT … FOR UPDATE` on the order row, plus an
  append-only `order_events` insert.

---

## 5. APPENDIX A — File-by-File Quick Reference

| File | Purpose | Key Behaviour |
|---|---|---|
| `balepay-pro.php` | Plugin bootstrap | Constants, class autoloader, HPOS/block compat declarations, settings link |
| `uninstall.php` | Uninstall | Delegates to `BPP_Activator::uninstall()` |
| `includes/class-bpp-activator.php` | Install/migrate/uninstall | Creates 4 tables, seeds `webhook_secret`, adds `manage_bpp` cap, schedules crons |
| `includes/class-bpp-helpers.php` | Utilities | AES-256-GCM encrypt/decrypt, HMAC sign, settings CRUD, Jalali date, mobile normalisation, message rendering, logging |
| `includes/class-bpp-bot-api.php` | Bot API client | All Bot API methods, `diagnose()` step-by-step connectivity test |
| `includes/class-bpp-bot-users.php` | Bot-user table CRUD | save_user, link_to_wp_user, save_message, set_blocked, set_admin |
| `includes/class-bpp-webhook.php` | Inbound webhook | Routes callback_query/pre_checkout/message, signature check, admin-only approve/reject |
| `includes/class-bpp-verification.php` | Approve/reject/undo | Atomic lock, status guard, undo within 60 s |
| `includes/class-bpp-wallet.php` | Bale wallet flow | sendInvoice, pre_checkout handler, successful_payment handler with hard amount check |
| `includes/class-bpp-receipt.php` | Receipt upload | REST endpoint, MIME/size/ext validation, .htaccess drop, public URL return |
| `includes/class-bpp-notifications.php` | Multi-channel notifier | send_to_admins, notify_customer, send_admin_verification (inline keyboard) |
| `includes/class-bpp-report.php` | Periodic reports | Cron-scheduled, HPOS-aware SQL aggregation |
| `includes/class-bpp-sms.php` | Melipayamak SMS | GET request with creds in URL (§2.1) |
| `includes/class-bpp-safir.php` | Bale Safir push | POST with api-access-key header |
| `includes/class-bpp-user-link.php` | User linking | HMAC-signed short-lived code, brute-force cap, deep link |
| `includes/class-bpp-snapppay.php` | SnappPay gateway | OAuth2 password, token/settle/verify/cancel/eligible |
| `includes/class-bpp-digipay.php` | DigiPay gateway | OAuth2 password+refresh, tickets/business, purchases/verify, refunds |
| `includes/class-bpp-gateway-card.php` | Card + Wallet WC gateways | WC_Payment_Gateway subclasses |
| `includes/class-bpp-ajax.php` | Admin AJAX | All admin actions with nonce guard |
| `includes/class-bpp-admin.php` | Admin panel | Menu, assets, render |
| `includes/class-bpp-main.php` | Singleton | Wiring of all classes, crons, frontend hooks |
| `includes/blocks/class-bpp-blocks.php` | WC Checkout Blocks | 4 AbstractPaymentMethodType subclasses |
| `templates/receipt-upload-form.php` | Frontend form | Multipart upload form |
| `templates/user-link-button.php` | Frontend link | Deep-link buttons + code display |
| `templates/admin-panel/main.php` | Admin panel UI | Tabbed UI: dashboard, bots, payment, wallet, snapppay, digipay, channels, messages, report, users, logs |
| `assets/js/front.js` | Frontend JS | Receipt upload via fetch + nonce |
| `assets/js/admin.js` | Admin JS | AJAX wiring for all admin actions |
| `assets/js/blocks/balepay-pro-blocks.js` | Checkout blocks JS | Minimal registration of 4 payment methods |
| `assets/css/admin.css` | Admin CSS | Tab/card/stat/table styling |
| `assets/css/front.css` | Frontend CSS | Receipt form styling |

## 6. APPENDIX B — Status Transition Map

```
                 ┌──────────────────┐
                 │     created      │   (order placed via bpp_card gateway)
                 └────────┬─────────┘
                          │ (receipt uploaded)
                          ▼
                 ┌──────────────────┐
                 │     pending      │   ←───── (undo within 60s)
                 └────────┬─────────┘              │
                          │ (admin approve)        │
                          ▼                        │
                 ┌──────────────────┐        ┌──────┴──────┐
                 │   on-hold        │◄───────│  processing │ (approve)
                 │  (pending        │        │  (paid)     │
                 │   verification) │        └──────┬──────┘
                 └────────┬─────────┘               │
                          │ (admin reject)          │ (fulfil)
                          ▼                         ▼
                 ┌──────────────────┐        ┌──────────────┐
                 │    cancelled     │        │   completed  │
                 └──────────────────┘        └──────────────┘
                          ▲                         ▲
                          │ (auto-expire cron)      │
                          │                         │ (refund)
                 ┌──── ───┴──── ─────────────┐      │
                 │   failed / expired         │      │
                 └────────────────────────────┘     ▼
                                              ┌──────────────┐
                                              │   refunded   │
                                              └──────────────┘

  Wallet flow:    created → pending → [pre_checkout → successful_payment] → processing → completed
                                ↓ (amount mismatch)
                            failed (with _bpp_wallet_mismatch meta)
```

## 7. APPENDIX C — POSTYAR Migration Checklist (high-level)

- [ ] Implement `BotApiClient` (§4.1) — Bale + Telegram, TLS hard-locked on.
- [ ] Implement webhook ingress with `update_id` dedup (§4.2).
- [ ] Implement wallet flow with BigInt money + idempotent `wallet_charges` (§4.3).
- [ ] Implement card-to-card flow with Redis lock + append-only `order_events` (§4.5).
- [ ] Implement user-linking with 18-char randomness + HKDF-derived link key (§4.6).
- [ ] Implement receipt upload with private S3 + signed-URL gate (§4.8).
- [ ] Implement Notifier with BullMQ + per-event routing (§4.10).
- [ ] Implement admin API with JWT + per-action authorization + audit log (§4.11).
- [ ] Implement SnappPay gateway with signed callback URL + idempotent `snapppay_charges` (§4.13).
- [ ] Implement DigiPay gateway with encrypted token storage + signed callback URL (§4.14).
- [ ] Implement Safir channel (§4.15).
- [ ] Implement SMS channel with credentials in body (§4.16).
- [ ] Implement MessageRenderer with Jalali + Persian digits (§4.17).
- [ ] Implement health + diagnose endpoints (§4.18).
- [ ] Implement webhook-health self-heal cron (§4.19).
- [ ] Implement daily maintenance cron (§4.20).
- [ ] Implement scheduled reports cron (§4.21).
- [ ] Implement secrets manager (§4.22).
- [ ] Implement fail-closed webhook posture (§4.23).
- [ ] Audit: never store secrets in URLs, in DB columns, in log lines.
- [ ] Audit: never use `Number` for money; only `bigint`.
- [ ] Audit: never UPDATE or DELETE rows in `order_events`.
- [ ] Audit: never disable TLS verification.

---

*End of forensic report. Referenced by POSTYAR implementation tasks 2+.*
