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

The API does a small sweep whenever an order is placed or the admin order list is opened. Schedule
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

### Payment rules (PaymentFinalizer)
Every confirmation path (Kora/Monnify webhooks and verification, admin "Confirm payment") goes
through `src/Services/PaymentFinalizer.php`: amount and currency must match, a payment is never
applied twice, an order only moves `pending_payment -> paid`, and money that arrives for a
cancelled/expired order, a second successful payment, an underpayment or an overpayment is recorded
and flagged on the order (`requires_attention`) for the admin instead of changing it.

---

## 6. Verification & Testing Commands

### Payment, order & stock integrity suite
Requires the API to be running (`php -S 127.0.0.1:8000 -t backend/public`). Creates its own test
data and removes it afterwards:
```bash
php backend/tests/PaymentIntegrityTest.php
```

### PHP Syntax Check
Run syntax checks across all backend PHP files:
```powershell
Get-ChildItem -Path backend -Recurse -Filter "*.php" | ForEach-Object { php -l $_.FullName }
```

### Automated CLI Endpoint Tests
Execute the built-in CLI test suite:
```bash
# 1. Test /api/v1/health endpoint
php backend/tests/test_health.php

# 2. Test 404 Route Not Found handling
php backend/tests/test_router_404.php

# 3. Test 405 Method Not Allowed handling
php backend/tests/test_router_405.php
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
