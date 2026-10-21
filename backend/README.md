# Shop.co E-Commerce — PHP 8+ REST API Backend

This directory houses the native **PHP 8+ REST API** powering the Shop.co e-commerce platform. It provides high-performance, transaction-safe e-commerce operations using native **MySQLi** prepared statements, local **MySQL (XAMPP)**, and **Kora (Korapay) Sandbox** payment flows.

---

## 1. Architectural Principles

1. **Single Public Document Root**:
   - Only `backend/public/` is exposed to the web.
   - All source code (`src/`), configuration files (`.env`), private downloads (`storage/private-downloads/`), and logs are strictly isolated outside the public web root.
2. **Zero Leaks & Safe Error Envelope**:
   - Database credentials, raw SQL queries, and stack traces are **never** returned to the client.
   - All exceptions are caught globally, logged to `storage/logs/error.log`, and returned in a sanitized JSON response envelope.
3. **No Heavy Framework Overhead**:
   - Zero-dependency modern PHP 8.2 architecture utilizing native `mysqli`, `spl_autoload_register`, and modular services.
4. **Strict CORS Allowlist**:
   - Restricts browser requests to explicit origins configured in `CORS_ALLOWED_ORIGINS` (default: `http://localhost:3000`).
   - Handles browser preflight `OPTIONS` requests automatically with `204 No Content`.

---

## 2. Directory Structure

```text
backend/
├── public/
│   ├── index.php                # Single public document root & API gateway
│   └── .htaccess                # Apache rewrite rules for clean URLs
├── src/
│   ├── Config/
│   │   └── Env.php              # Environment variable loader (.env)
│   ├── Database/
│   │   └── Database.php         # MySQLi connection singleton & prepared statement wrapper
│   ├── Support/
│   │   ├── Response.php         # Standardized JSON response & error envelope
│   │   └── Router.php           # Lightweight regex-based REST router
│   ├── Middleware/
│   │   ├── CorsMiddleware.php   # Environment-driven CORS headers & preflight
│   │   └── JsonBodyMiddleware.php # Content-Type validation & JSON body parser
│   ├── Controllers/
│   │   └── HealthController.php # System health check (/api/v1/health)
│   ├── Services/                # Domain business logic (Catalog, Orders, Shipping, etc.)
│   ├── Repositories/            # Database query layers
│   ├── Validators/              # Server-side input validation rules
│   └── Payments/
│       └── Kora/                # Kora checkout client & webhook processor
├── migrations/                  # Versioned SQL database migrations (Step 3)
├── seeds/                       # Development database seeds (Step 3)
├── storage/
│   └── logs/                    # Backend error logs
├── tests/                       # Automated CLI test runners
├── .env.example                 # Environment configuration template
├── .env                         # Local environment configuration (untracked)
├── composer.json                # Composer manifest for autoloading
└── README.md                    # Backend documentation
```

---

## 3. Local Setup & Configuration

### Prerequisites
- **PHP 8.2+** with extensions: `mysqli`, `curl`, `mbstring`, `openssl`, `json`, `fileinfo`.
- **XAMPP** (or standalone Apache + MySQL).

### Step 1: Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp backend/.env.example backend/.env
```

Review local database settings in `backend/.env`:
```ini
APP_NAME="Shop.co REST API"
APP_ENV=development
APP_DEBUG=true
APP_URL=http://localhost:8000

DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=shopco_dev
DB_USERNAME=root
DB_PASSWORD=""

STORE_NAME="SHOP.CO"
STORE_CURRENCY=NGN
STORE_ORIGIN_CITY=Enugu
STORE_ORIGIN_STATE=Enugu

CORS_ALLOWED_ORIGINS="http://localhost:3000,http://127.0.0.1:3000"
```

---

## 4. Serving the API Locally

### Option A: PHP Built-in Server (Recommended for Quick Testing)
You can run the PHP built-in server pointing directly to the public document root:
```bash
php -S localhost:8000 -t backend/public
```
The API is then immediately available at:
```text
http://localhost:8000/api/v1/health
```

### Option B: Local XAMPP Apache (Virtual Host)
Add the following virtual host to `C:\xampp\apache\conf\extra\httpd-vhosts.conf`:
```apache
<VirtualHost *:80>
    ServerName shop-api.local
    DocumentRoot "C:/Users/smnkh/Desktop/E-templates/E-commerce/backend/public"
    <Directory "C:/Users/smnkh/Desktop/E-templates/E-commerce/backend/public">
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>
</VirtualHost>
```
Add `127.0.0.1 shop-api.local` to `C:\Windows\System32\drivers\etc\hosts`.

### Option C: Local XAMPP Apache (Subdirectory Alias)
If serving from Apache's `htdocs`:
Configure an Alias pointing `/shop-api` to the `backend/public` folder. The built-in `Router.php` automatically detects and strips directory prefixes.

### Speed and scale
- **Turn on OPcache** (PHP keeps compiled code in memory instead of recompiling every file
  on every request; typically 2-3x faster). In `C:\xampp\php\php.ini`:
  ```ini
  zend_extension=opcache
  opcache.enable=1
  opcache.memory_consumption=128
  opcache.max_accelerated_files=10000
  opcache.validate_timestamps=1   ; 0 in production (then restart PHP after each deploy)
  ```
- **Use Apache or nginx + PHP-FPM in production.** `php -S` handles one request at a time;
  it is for development only.
- **Catalogue cache:** public listing, homepage, filter and category responses are cached in
  `storage/cache` for `CATALOG_CACHE_SECONDS` (default 60) and cleared after every admin
  change. Responses are gzip-compressed and public ones carry `Cache-Control` + `ETag`
  (browsers get `304 Not Modified` when nothing changed); account, order and admin
  responses are `no-store`.
- **Best selling** sorts on `products.units_sold`, kept up to date when an order is paid,
  cancelled or refunded (`App\Services\ProductSales`). Search uses a full-text index.
- Measured on a test store with 20,000 products, 80,000 variants and 150,000 order lines:
  catalogue pages 30-130 ms uncached and ~17 ms cached (best selling was 125 s before).

---

## 5. Database Migrations & Scheduled Jobs

### Migrations
```bash
php backend/migrations/migrate.php
```
Each migration runs exactly once; applied files are recorded in the `schema_migrations` table.
Re-running the command only applies new files. (On a database created before the ledger existed,
migrations 001–008 are recorded as already applied the first time.)

### Releasing stock from unpaid orders
Placing an order reserves its stock until `orders.expires_at` (60 minutes after the order or the
latest gateway checkout attempt; 24 hours when the customer pays by WhatsApp/manual transfer).
Overdue orders are cancelled and their stock and promo use released exactly once.

The API does a small sweep whenever an order is placed or the admin order list or dashboard is opened. Schedule
the full job so stock is released even when the store is quiet; it asks Kora/Monnify for the final
status first, so a payment completed at the last minute is applied instead of cancelled:
```bash
php backend/scripts/expire_pending_orders.php                 # check gateways, then expire
php backend/scripts/expire_pending_orders.php --no-gateway-check
```
Windows Task Scheduler (every 10 minutes):
```powershell
schtasks /Create /SC MINUTE /MO 10 /TN "ShopCo Expire Orders" /TR "C:\xampp\php\php.exe C:\path\to\E-commerce\backend\scripts\expire_pending_orders.php"
```

Optional `.env` settings: `ORDER_PAYMENT_WINDOW_MINUTES` (default 60) and
`ORDER_MANUAL_PAYMENT_WINDOW_HOURS` (default 24).

### Sending email (outbox)
Every email is written to `email_outbox` first. Order emails (received, paid, shipped, cancelled,
refunded) get one delivery attempt as soon as the order change is saved; newsletters, and any email
whose attempt failed, are sent by the outbox worker with retries after 1, 5, 15 and 60 minutes (failed
after 5 attempts). Sign-in links are sent immediately and never stored, so they cannot be re-sent.
```bash
php backend/scripts/process_outbox.php              # one batch of up to 100
php backend/scripts/process_outbox.php --limit=500
```
```powershell
schtasks /Create /SC MINUTE /MO 5 /TN "ShopCo Send Email" /TR "C:\xampp\php\php.exe C:\path\to\E-commerce\backend\scripts\process_outbox.php"
```
With `MAIL_MAILER=log` (the default) emails go to `backend/storage/logs/mail.log` and the admin outbox
shows them as "Logged only". The admin Email outbox page also has "Send queued now".

### Database clean-up and data retention
Removes data the store no longer needs: expired sign-in sessions, used or expired sign-in links,
old rate-limit counters, cancelled orders that were never paid and abandoned guest carts (after
30 days), old sent emails and gateway notifications (180 days). How long each kind of data is
kept is chosen in **admin → Data & storage**:
- **Customer records** (off until chosen; 3 months to 2 years): a customer with no sign-in and no
  order for that long, and nothing open, has their account, saved addresses, cart and wishlist
  deleted, and the name, phone, email and street address removed from their finished orders.
  The orders keep their items, totals, payments and delivery city/state for the accounts.
- **Unfinished checkouts** (7, 30 or 90 days), **emails and gateway notifications** (3, 6 or 12
  months; never longer than the customer-record period) and **admin activity / stock history**
  (kept unless a period is chosen).

Money records (order totals and items, payments, refunds) and orders flagged for attention are
never removed. After each run the script checks the database size against the admin's limit,
slow requests (`SLOW_REQUEST_MS`) and whether the clean-up is running, and emails the admins
(at most once a week) when something needs attention. The same check feeds the admin alert bell.
```bash
php backend/scripts/cleanup_database.php --dry-run   # only count what would be removed
php backend/scripts/cleanup_database.php
```
Windows Task Scheduler (daily at 03:00):
```powershell
schtasks /Create /SC DAILY /ST 03:00 /TN "ShopCo Cleanup" /TR "C:\xampp\php\php.exe C:\path\to\E-commerce\backend\scripts\cleanup_database.php"
```

### Admin panel
The admin lives at `/admin` on the storefront (one route per screen, e.g. `/admin/orders`, `/admin/shipping/zones`).
On a brand-new database `/admin` sends you to `/admin/setup` to create the first administrator and the store
details; after that the setup endpoint is closed and `/admin/login` is the way in. Old `/admin?tab=…` links
redirect to the matching route.

### Payment rules (PaymentFinalizer)
Every confirmation path (Kora/Monnify webhooks and verification, admin "Confirm payment") goes
through `src/Services/PaymentFinalizer.php`: amount and currency must match, a payment is never
applied twice, an order only moves `pending_payment -> paid`, and money that arrives for a
cancelled/expired order, a second successful payment, an underpayment or an overpayment is recorded
and flagged on the order (`requires_attention`) for the admin instead of changing it.

---

## 6. Verification & Testing Commands

### Test suites (throw-away database)
```bash
php backend/tests/run.php                    # every suite
php backend/tests/run.php Security Admin     # suites whose name contains these words
php backend/tests/run.php --keep             # keep shopco_test afterwards for debugging
```
The runner writes `backend/.env.testing` (a copy of `.env` pointing at `shopco_test` and a separate
mail log), drops and re-creates that database, applies every migration, runs `seeds/seed.php`,
starts the API on `127.0.0.1:8099` against it, runs each `backend/tests/*Test.php`, then stops the
server and drops the database. `.env` and `shopco_dev` are never touched.

| Suite | Covers |
| :--- | :--- |
| `SecurityTest` | Admin access, cookies and CSRF, magic links, guest order lookup, rate limits, uploads, CORS. |
| `StorefrontFlowTest` | Catalogue filters and facets, cart check, delivery quotes, idempotent guest orders, payment windows, account linking, saved cart/wishlist, reviews, flash-deal expiry. |
| `PaymentIntegrityTest` | Payment finaliser, Kora/Monnify webhooks and signatures, expiry, promos, refunds, variants, transactions. |
| `AdminApiTest` | Every admin screen's API, the full order lifecycle, refunds, settings, sessions. |
| `ReportingTest` | Analytics agree with the database, CSV exports, audit log, email outbox endpoints. |
| `MailOutboxTest` | Outbox delivery, retries and backoff, SMTP protocol (fake server), templates. |

Each suite refuses to run directly against the configured database unless `ALLOW_DEV_DB=1` is set.

### PHP syntax check
```powershell
Get-ChildItem -Path backend -Recurse -Filter "*.php" | ForEach-Object { php -l $_.FullName }
```

---

## 7. Prepared Statement Usage Example

Always execute queries through `App\Database\Database::getInstance()` using prepared statements:

```php
use App\Database\Database;

$db = Database::getInstance();

// 1. Fetching multiple records with parameter bindings:
$products = $db->fetchAll(
    "SELECT id, name, price, stock FROM products WHERE category_id = ? AND status = ?",
    "ss",
    [$categoryId, "published"]
);

// 2. Fetching a single row:
$product = $db->fetchOne(
    "SELECT * FROM products WHERE slug = ? LIMIT 1",
    "s",
    [$slug]
);

// 3. Inserting a record:
$orderId = $db->insert(
    "INSERT INTO orders (customer_email, total_amount, currency) VALUES (?, ?, ?)",
    "sds",
    [$email, $total, "NGN"]
);

// 4. Atomic Transaction:
$db->transaction(function (Database $db) use ($orderId, $items) {
    foreach ($items as $item) {
        $db->execute(
            "UPDATE product_variants SET stock = stock - ? WHERE id = ? AND stock >= ?",
            "isi",
            [$item['qty'], $item['variant_id'], $item['qty']]
        );
    }
});
```
