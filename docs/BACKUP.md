# POSTYAR — راهنمای پشتیبان‌گیری و بازگردانی

> **مخاطب**: مدیر سامانه که می‌خواهد از کل دیتابیس، رسانه‌ها و تنظیمات پُست‌یار نسخهٔ پشتیبان تهیه کند و سپس آن را روی یک محیط staging بازگردانی کند.
>
> **Host**: cPanel / LiteSpeed / Passenger / Node.js 22 / MariaDB 10 / Redis (اختیاری).
>
> **شناسه کار**: این سند با `prisma/schema.prisma` (MariaDB در تولید)، `src/lib/storage/index.ts` (`STORAGE_ROOT = storage/`) و `src/app/api/admin/health/route.ts` هم‌خوان است.

---

## ۱. نمای کلی

دو پیکرهٔ داده‌ای برای پشتیبان‌گیری وجود دارد:

| پیکره | محل | ابزار | رشتهٔ بازگشت |
|------|-----|------|--------------|
| **دیتابیس** (MariaDB) | `ACCOUNT_postyar` روی سرور MariaDB | cPanel → Backups → Download a MySQL Database Backup | فایل `.sql` یا `.gz` |
| **رسانه + رسید + آواتار** | `/home/ACCOUNT/postyar-private/storage/` | cPanel → Backups → Download a Home Directory Backup (یا فایل‌منیجر) | فایل `.tar.gz` یا زیپ |
| **تنظیمات محیطی** | `/home/ACCOUNT/postyar-private/.env` | همان پشتیبان Home Directory شامل می‌شود | — |

> **هشدار**: `.env` شامل `POSTYAR_MASTER_KEY` است که با آن تمام توکن‌های ربات‌ها و WooCommerce و secretهای webhook رمزگشایی می‌شوند. **بدون `.env`، تمام رمزنگاری‌شده‌ها غیرقابل بازیابی می‌شوند.** همیشه از `.env` جداگانه و در یک مخزن امن (مثلاً 1Password / Bitwarden) پشتیبان بگیرید.

---

## ۲. پشتیبان‌گیری از دیتابیس

### ۲.۱ — روش ۱: cPanel Backup Wizard

1. **cPanel → Files → Backup Wizard**.
2. روی **Backup** کلیک کنید.
3. بخش **MySQL® Database** را انتخاب کنید.
4. دیتابیس `ACCOUNT_postyar` را انتخاب و روی **Generate Backup** بزنید.
5. فایل `.sql.gz` دانلود می‌شود (معمولاً ~۳۰۰KB تا ۵MB بسته به حجم).

### ۲.۲ — روش ۲: phpMyAdmin

1. **cPanel → Databases → phpMyAdmin**.
2. دیتابیس `ACCOUNT_postyar` را در سمت چپ انتخاب کنید.
3. تب **Export**.
4. روش **Custom - display all possible options**.
5. تمام جدول‌ها را انتخاب کنید.
6. فرمت: **SQL**. چکباکس **Add DROP TABLE / TRIGGER** را فعال کنید (برای بازگردانی روی staging که ممکن است جدول تکراری باشد).
7. روی **Go** بزنید؛ فایل `.sql` دانلود می‌شود.

### ۲.۳ — روش ۳: ترمینال cPanel

```bash
mysqldump --no-tablespaces -u ACCOUNT_user -p ACCOUNT_postyar > /tmp/postyar-$(date +%Y%m%d-%H%M).sql
gzip /tmp/postyar-*.sql
mv /tmp/postyar-*.sql.gz /home/ACCOUNT/backups/
```

> **نکته**: برای پشتیبان‌گیری خودکار، یک cron job در cPanel تنظیم کنید:
> ```cron
> 0 3 * * * mysqldump --no-tablespaces -u ACCOUNT_user -p'PASSWORD' ACCOUNT_postyar | gzip > /home/ACCOUNT/backups/postyar-$(date +\%Y\%m\%d).sql.gz && find /home/ACCOUNT/backups -name 'postyar-*.sql.gz' -mtime +14 -delete
> ```
> این هر شب ساعت ۳ صبح پشتیبان می‌گیرد و نسخه‌های قدیمی‌تر از ۱۴ روز را حذف می‌کند.

---

## ۳. پشتیبان‌گیری از فایل‌ها

### ۳.۱ — روش ۱: cPanel Backup Wizard

1. **cPanel → Files → Backup Wizard**.
2. روی **Backup** کلیک کنید.
3. بخش **Home Directory** را انتخاب کنید.
4. **Partial Backup** → **Home Directory** را دانلود کنید. یک فایل `home-ACCOUNT.tar.gz` ساخته می‌شود که شامل تمام `/home/ACCOUNT/` است.

### ۳.۲ — روش ۲: ترمینال cPanel (پیشنهادی — فقط دو پوشهٔ ضروری)

```bash
cd /home/ACCOUNT
mkdir -p backups
tar -czf backups/postyar-storage-$(date +%Y%m%d-%H%M).tar.gz \
  postyar-private/storage \
  postyar-private/.env \
  postyar-private/prisma/schema.prisma \
  postyar-private/package.json
```

> **نکته**: `node_modules/` و `.next/` را پشتیبان نگیرید — در زمان بازگردانی با `bun install` و `bun run build` بازسازی می‌شوند.

---

## ۴. بازگردانی روی staging

### ۴.۱ — پیش‌نیازها

- یک سرور staging با Node.js 22.23.2، MariaDB 10 و (در صورت نیاز) Redis.
- دیتابیس `ACCOUNT_postyar_staging` ساخته‌شده.
- کاربر MariaDB با تمام امتیازها روی دیتابیس staging.

### ۴.۲ — مرحله ۱: بازگردانی دیتابیس

```bash
# در ترمینال staging:
mysql -u ACCOUNT_user_staging -p ACCOUNT_postyar_staging < postyar-YYYYMMDD-HHMM.sql
```

یا با phpMyAdmin:
1. **phpMyAdmin → staging DB → Import → Choose File → postyar-*.sql → Go**.

### ۴.۳ — مرحله ۲: بازگردانی فایل‌ها

```bash
# در ترمینال staging:
cd /home/ACCOUNT-staging/postyar-private

# 1. کپی storage (رسانه + رسید + آواتار)
tar -xzf /path/to/postyar-storage-*.tar.gz
# این کاری می‌کند:
#   postyar-private/storage/* → extracted to current dir
#   postyar-private/.env → extracted
#   postyar-private/prisma/schema.prisma → extracted
#   postyar-private/package.json → extracted

# 2. ویرایش .env برای staging
#    - DATABASE_URL را به staging تغییر دهید:
#      DATABASE_URL=mysql://ACCOUNT_user_staging:PASSWORD@127.0.0.1:3306/ACCOUNT_postyar_staging
#    - POSTYAR_PUBLIC_URL را به staging دامنه تغییر دهید.
#    - POSTYAR_MASTER_KEY را **همان مقدار production** نگه دارید!
#      (در غیر این صورت، تمام توکن‌های ربات‌ها غیرقابل رمزگشایی می‌شوند.)
#    - POSTYAR_JWT_SECRET را **همان مقدار production** نگه دارید.
#      (در غیر این صورت، تمام sessionهای موجود نامعتبر می‌شوند.)
#    - POSTYAR_CRON_SECRET را می‌توانید عوض کنید (فقط cronها را تحت تأثیر قرار می‌دهد).
```

### ۴.۴ — مرحله ۳: نصب وابستگی‌ها و build

```bash
cd /home/ACCOUNT-staging/postyar-private
bun install --frozen-lockfile
bunx prisma generate
bunx prisma migrate deploy  # هرگز db:push
bun run build
```

### ۴.۵ — مرحله ۴: راه‌اندازی و اعتبارسنجی

```bash
# در ترمینال staging (یا Application Manager در cPanel staging):
node .next/standalone/server.js &
SERVER_PID=$!
sleep 5

# 1. Health check عمومی
curl -fsS http://127.0.0.1:3000/api/health | jq
# باید شامل "app":"ok" و "db":"ok" و "storage":"ok" باشد

# 2. Health check مدیران (با session admin)
# ابتدا از طریق لاگین واقعی یک session admin بسازید
# سپس:
COOKIE="postyar_sid=<your-jwt>"
curl -fsS -b "$COOKIE" http://127.0.0.1:3000/api/admin/health | jq
# باید شامل overall=ok و تمام چک‌های ok باشد

# 3. Smoke test: یک کاربر آزمایشی بسازید، یک پست زمان‌بندی کنید،
#    cron tick را شبیه‌سازی کنید با:
SECRET=$(grep -m1 POSTYAR_CRON_SECRET .env | cut -d= -f2)
curl -fsS -X POST -H "x-postyar-cron-secret: $SECRET" http://127.0.0.1:3000/api/publish/run
# باید شامل {"ok":true,"summary":{"processed":...,"delivered":...}} باشد

# Stop staging server
kill $SERVER_PID
```

### ۴.۶ — مرحله ۵: اعتبارسنجی صحت داده‌ها

| چک | روش |
|-----|------|
| تعداد کاربران | `mysql -e "SELECT COUNT(*) FROM User;"` → باید با production مطابقت کند |
| تعداد سفارش‌ها | `mysql -e "SELECT COUNT(*) FROM Order;"` |
| تعداد WalletTxn | `mysql -e "SELECT COUNT(*) FROM WalletTxn;"` |
| تعداد LedgerEntry | `mysql -e "SELECT COUNT(*) FROM LedgerEntry;"` |
| مجموع WalletTxnها | `mysql -e "SELECT SUM(CASE direction WHEN 'credit' THEN amountRials ELSE -amountRials END) FROM WalletTxn;"` |
| تعداد ربات‌ها | `mysql -e "SELECT COUNT(*) FROM Bot;"` |
| تعداد رسانه‌ها | `ls -1 storage/images/ storage/videos/ storage/receipts/ storage/avatars/ | wc -l` |
| چک دیجیتال مدیا | `find storage -type f -exec sha256sum {} \; | sort > /tmp/staging-media.sha256` و مقایسه با همان خروجی از production |

---

## ۵. سناریوهای بازیابی (Disaster Recovery)

### ۵.۱ — از دست رفتن پایگاه داده (DB crash)

1. سرور MariaDB را تعمیر کنید یا یک سرور جدید MariaDB 10 بالا بیاورید.
2. `DATABASE_URL` در `.env` را به سرور جدید آپدیت کنید.
3. `bunx prisma migrate deploy` برای ساخت تمام جدول‌ها.
4. فایل `.sql` پشتیبان را import کنید: `mysql ... < postyar-backup.sql`.
5. سرور Next.js را restart کنید.

### ۵.۲ — از دست رفتن `.env`

اگر `.env` گم شد اما `POSTYAR_MASTER_KEY` و `POSTYAR_JWT_SECRET` در یک مخزن امن (مثل 1Password) ذخیره شده بودند:
1. مقادیر را از مخزن امن بازیابی کنید.
2. `.env` جدید بسازید.
3. **اگر `POSTYAR_MASTER_KEY` عوض شد**: تمام توکن‌های ربات‌ها، WooCommerce consumer key/secret و webhook secretها غیرقابل رمزگشایی می‌شوند. کاربران باید دوباره ربات‌های خود را بسازند. این یک سناریوی فاجعه‌بار است — همیشه از `POSTYAR_MASTER_KEY` چندین نسخهٔ پشتیبان در جاهای مختلف نگه دارید.

### ۵.۳ — از دست رفتن رسانه‌ها (`storage/`)

اگر پوشهٔ `storage/` گم شد:
1. فایل `tar.gz` پشتیبان را در مسیر `postyar-private/storage/` extract کنید.
2. سطح دسترسی را تنظیم کنید: `chmod 700 postyar-private/storage`.
3. اگر `tar.gz` هم گم شد: رسانه‌ها قابل بازگشت نیستند. رکوردهای `Media` در دیتابیس به فایل‌هایی اشاره می‌کنند که دیگر وجود ندارند. در این حالت:
   - `Media.storagePath` به فایل مفقود اشاره می‌کند.
   - `GET /api/media/[id]` با 404 پاسخ می‌دهد (`src/lib/storage/index.ts:170-173`).
   - محتوای قابل انتشار که به رسانهٔ مفقود ارجاع می‌دهد، در زمان publish با خطای soft-fail مواجه می‌شود (`src/lib/queue/worker.ts:184-188`).

### ۵.۴ — Recovery Time Objective (RTO)

| سناریو | RTO پیشنهادی |
|--------|-------------|
| خطای MariaDB (نرم‌افزاری) | < ۳۰ دقیقه (restore از mysqldump) |
| خرابی کامل سرور | < ۴ ساعت (provision سرور جدید + restore) |
| خرابی storage | < ۲ ساعت (restore از tar.gz) |
| گم شدن `.env` | < ۱ ساعت (بازیابی از 1Password) |

---

## ۶. سیاست نگهداری (Retention)

| نوع پشتیبان | نگهداری | محل ذخیره |
|------------|---------|-----------|
| روزانه (cron) | ۱۴ روز | سرور cPanel در `/home/ACCOUNT/backups/` |
| هفتگی | ۸ هفته | دانلود به کامرو محلی و آپلود به S3/Backblaze |
| ماهانه | ۱۲ ماه | S3/Backblaze با lifecycle policy |
| نسخهٔ قبل از migration | دائمی | S3/Backblaze با versioning |

---

## ۷. بازگردانی یک کاربر تکی (GDRR-friendly)

اگر فقط یک کاربر گزارش داد «حسابم خراب شد»:
1. آخرین پشتیبان هفتگی را extract کنید.
2. فقط رکوردهای آن کاربر را با SQL فیلتر کنید:
   ```sql
   SELECT * FROM User WHERE id = 'USER_ID';
   SELECT * FROM WalletTxn WHERE userId = 'USER_ID';
   SELECT * FROM LedgerEntry WHERE userId = 'USER_ID';
   SELECT * FROM Order WHERE userId = 'USER_ID';
   ```
3. مقادیر فعلی را با مقادیر پشتیبان مقایسه کنید.
4. در صورت نیاز، فقط رکوردهای مربوطه را در جدول مرتب UPDATE کنید (نه کل دیتابیس).
5. هرگز UPDATE روی `WalletTxn` یا `LedgerEntry` انجام ندهید — اینها append-only هستند. اگر اشتباهی رخ داده، با `adminAdjustWallet` یک ردیف جدید `WalletTxn` با `direction=debit/credit` و `reason=admin_adjust` ایجاد کنید.

---

## ۸. تأیید نهایی

پیش از اعلام «بازگردانی موفق»:

- [ ] `curl /api/health` همهٔ چک‌ها `ok` هستند.
- [ ] `curl /api/admin/health` (با session admin) همهٔ چک‌ها `ok` هستند.
- [ ] یک کاربر admin می‌تواند لاگین کند.
- [ ] یک کاربر عادی می‌تواند لاگین کند و کیف پول خود را ببیند.
- [ ] تعداد رکوردهای `User`، `Order`، `WalletTxn`، `LedgerEntry` با production مطابقت می‌کند.
- [ ] `find storage -type f | sha256sum` با production مطابقت می‌کند.
- [ ] یک ربات تستی از طریق `POST /api/bots/[id]/activate` فعال می‌شود و `setWebhook` با Telegram/Bale موفق است.

اگر هر کدام fail شد، بازگردانی کامل نیست.

---

**پایان سند**.
