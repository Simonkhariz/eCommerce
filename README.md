# Shop.co

An online clothing store for Nigeria: physical products only, prices in naira (NGN), card and
bank-transfer payments through **Kora** and **Monnify**, plus manual bank transfer arranged on
WhatsApp. Customers can check out as guests or sign in with an email link; the store team runs
everything from an admin panel at `/admin`.

| Part | Stack | Where |
| :--- | :--- | :--- |
| Storefront + admin UI | Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind | repository root (`app/`, `components/`, `lib/`) |
| API | PHP 8.2, MySQLi, no framework | `backend/` (see [backend/README.md](backend/README.md)) |
| Database | MySQL / MariaDB (XAMPP) | `backend/migrations/`, `backend/seeds/` |

The browser only ever talks to the Next.js site. Next.js forwards `/api/v1/*` and `/uploads/*` to
the PHP API (`BACKEND_ORIGIN`), so sign-in uses HTTP-only, same-site cookies and no token or secret
is ever exposed to JavaScript.

---

## Run it locally

Requirements: Node 20.9+ (Next.js 16 needs it), PHP 8.2+ (extensions `mysqli`, `curl`, `mbstring`, `openssl`, `fileinfo`),
MySQL running (XAMPP is fine).

```bash
# 1. API configuration
cp backend/.env.example backend/.env        # then set DB_* and, for payments, the Kora/Monnify sandbox keys

# 2. Database
php backend/migrations/migrate.php          # creates the database and applies every migration once
php backend/seeds/seed.php                  # optional demo catalogue and delivery zones

# 3. API
php -S 127.0.0.1:8000 -t backend/public

# 4. Storefront (second terminal)
cp .env.example .env.local                  # BACKEND_ORIGIN=http://127.0.0.1:8000
npm install
npm run dev                                 # http://localhost:3000
```

Then open **http://localhost:3000/admin**. On a new database it sends you to `/admin/setup` to
create the first administrator and the store details; after that, `/admin/login` is the way in.

### Background jobs

Schedule these (Windows Task Scheduler or cron). The API also does a small amount of this work
on its own, but nothing replaces the schedule on a quiet store.

| Job | Every | What it does |
| :--- | :--- | :--- |
| `php backend/scripts/expire_pending_orders.php` | 10 min | Asks Kora/Monnify for the final status of overdue unpaid orders, then cancels the rest and releases their stock and promo use. |
| `php backend/scripts/process_outbox.php` | 5 min | Sends queued email (newsletters, retries of failed order emails). |
| `php backend/scripts/check_database.php` | daily | Checks the database size, slow requests and data past the keep periods, and emails the admins when something needs attention. It removes nothing: admins review and confirm clean-ups in admin → Data & storage. |

### Email

With `MAIL_MAILER=log` (the default) nothing is delivered: every email is written to
`backend/storage/logs/mail.log`, and the admin Email outbox shows it as "Logged only". Set
`MAIL_MAILER=smtp` and the `MAIL_*` settings in `backend/.env` to send real email.

---

## How the important parts work

- **Prices, stock and totals are always computed by the API.** The browser never decides a price,
  a delivery fee, a discount or a payment status.
- **Stock is reserved when an order is placed** and held for 60 minutes (card/bank via a gateway)
  or 24 hours (manual transfer). Unpaid orders past that window are cancelled and the stock and
  promo use released exactly once.
- **An order becomes "paid" in exactly one place** (`PaymentFinalizer`): signed Kora/Monnify
  webhooks, the customer's return from the payment page, the expiry job's final check, and the
  admin's "Record manual payment" all go through it. The amount and currency must match; late,
  duplicate, under- and over-payments are flagged on the order for the admin instead of being
  silently accepted.
- **The cart is only cleared after payment is verified**, so a failed or abandoned payment can be
  retried on the same order.
- **Delivery fees come from delivery zones** (states → fee) that the admin manages. A state that no
  zone covers is refused at checkout rather than charged a guess.
- **Refunds are recorded, not sent.** The admin sends the money from the Kora/Monnify dashboard or
  their bank, then records it; the order, payment, analytics and customer email follow.
- **Sales figures are verified money**: analytics count payments when they are verified and refunds
  when they are completed; orders paid and then cancelled show as refunds owed until recorded.
- **Every admin change is in the audit log** with the admin who made it.

More detail: [docs/API_CONTRACT.md](docs/API_CONTRACT.md),
[docs/KORA_INTEGRATION.md](docs/KORA_INTEGRATION.md), [backend/README.md](backend/README.md).

---

## Checks and tests

```bash
npm run typecheck && npm run lint && npm run build     # storefront + admin
npm run test:api                                       # = php backend/tests/run.php
```

`backend/tests/run.php` creates a throw-away `shopco_test` database, migrates and seeds it, starts
the API on port 8099 against it, runs every suite, and drops the database again; your development
data is never touched. Run a subset with `php backend/tests/run.php Security Admin`, or keep the
test database for debugging with `--keep`. To point your own API at that database, set
`SHOPCO_ENV_FILE` to the **absolute** path of `backend/.env.testing`; the API refuses to start if
it cannot read the file, rather than falling back to your real `.env`. The latest results are in
[docs/TEST_PLAN.md](docs/TEST_PLAN.md).

---

## Before going live

- Review the store policies in `lib/site-content.ts` (search for `TODO(store owner)`): return
  window, who pays return delivery, data-retention period, legal business name. The pages describe
  how the store actually works and deliberately leave these business decisions to you.
- Use live Kora/Monnify keys, set the webhook URLs to `https://<your-domain>/api/v1/webhooks/kora`
  and `/api/v1/webhooks/monnify`, and set `APP_ENV=production`, `FRONTEND_URL` and
  `CORS_ALLOWED_ORIGINS` in `backend/.env`.
- Configure SMTP and schedule the three background jobs.
- Serve only `backend/public/` from the web server (never the whole `backend/` folder).
