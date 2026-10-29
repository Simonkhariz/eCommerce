# Load test plan (roadmap Prompt 36)

Design only: nothing here has been run. Prompt 37 runs the scenarios the owner approves, exactly
as written, without tuning anything mid-test. Prompt 38 then fixes at most one measured bottleneck
and repeats the same scenario.

## 1. Safety rules (checked by the runner before it starts)

- **Never production, never live providers.** Every target must be `127.0.0.1` or `localhost`; the
  runner refuses anything else.
- **Its own database:** `shopco_load`, created for the test and dropped afterwards. The runner
  refuses to start if the API's `DB_DATABASE` is anything else. `shopco_dev` is never touched.
- **Made-up keys only.** Kora/Monnify secrets are random test values generated per run, and
  `KORA_API_BASE_URL` / `MONNIFY_API_BASE_URL` point at a local stand-in. Real keys in
  `backend/.env` are never read or used.
- **No real email, storage or storefront refresh:** `MAIL_MAILER=log` (to a throw-away log),
  stand-in S3 (`tests/support/fake_s3.php`) or a throw-away `UPLOAD_DIR`,
  `STOREFRONT_REVALIDATE_URL` empty.
- **The owner's servers keep running untouched** (storefront :3000, API :8000, the main `.next`).
  The test uses its own ports: API 8150 (Apache), storefront 3100 (`next start` from an isolated
  copy), stand-ins 8151+.
- **Rate limits stay on.** Each simulated shopper sends its own `X-Forwarded-For` address (the
  load runner is the trusted proxy, as the storefront is in production), so limits behave as for
  real, separate customers.

## 2. Test environment

| Part | Setup | Why |
|---|---|---|
| API | A temporary XAMPP Apache (mod_php, 150 threads) on :8150 with its own config, serving a copy of `backend/` | `php -S` runs one request at a time and cannot show concurrency (measured in Prompt 31) |
| OPcache | Run every scenario twice: OPcache off (as this PC is now) and on (as production should be) | Measured in Prompt 26: halves response time |
| Storefront | `next build` + `next start` on :3100 from the scratchpad copy | Pages and the image optimiser as in production |
| Database | `shopco_load`: migrations, then 4,000 products, 8,500 variants, 50 categories, 2,000 customers, 5,000 past orders | A shop larger than today's 43 products, so slow queries show up |
| Load generator | A small Node script (`fetch`, no packages to install) on the same PC; `ab.exe` (bundled with XAMPP) for single-URL checks | No install needed; k6 would need approval to install |
| Machine | This PC: 4 cores, 16 GB RAM, 12 GB free disk, with other apps closed where possible | Results are a relative baseline. Repeat on staging that matches the real hosting once chosen |

The generator and the shop share the same 4 cores, so the CPU each one uses is recorded and
reported. Numbers from this PC show where the limits are, not the production maximum.

## 3. Scenarios

**S1. Shoppers browsing (catalogue, search, product pages)**

- **Mix of requests:**

  | Request | Share |
  |---|---|
  | Homepage | 20% |
  | Category list with filters and sorting (`/category?...`) | 35% |
  | Search | 15% |
  | Product page | 25% |
  | Filter options | 5% |

  Each request is split about 60/40 between storefront pages (:3100) and the API (:8150).
- **Simulated shopper:** waits 1–3 s between requests. Keywords, categories and pages are random,
  so the cache sees realistic misses.
- **Ramp-up:** 5 → 10 → 25 → 50 → 100 → 150 concurrent shoppers, 2 minutes per step, after 1
  minute of warm-up.
- **Variants:** catalogue cache on (`CATALOG_CACHE_SECONDS=60`) and off (cold-cache worst case).

**S2. Checkout contention (overselling)**

- **S2a, one item many people want:** one variant with stock 20; 100 shoppers place an order for
  it at the same moment, each from its own address.
  - Expected: exactly 20 orders created, 80 clear "out of stock" answers, stock never below 0, and
    `inventory_logs` matching the stock change.
- **S2b, everyday load:** 30 concurrent checkouts on different products, repeated for 5 minutes,
  using WhatsApp payment (no provider involved), with S1 running at 25 shoppers.
- **Measured:** order time p50/p95/p99, database lock waits and deadlocks.

**S3. Duplicate and out-of-order payment webhooks**

- **Setup:** 200 orders waiting for payment.
- **Load:** each order's correctly signed Kora webhook (made-up test secret) is sent 5 times at
  once, and a Monnify webhook 3 times, in random order. Mixed in:
  - a late "failed" event arriving after "paid";
  - a webhook with an amount that doesn't match;
  - webhooks with bad signatures.
- **Expected:**
  - every order paid exactly once;
  - exactly one payment email queued per order (dedup key);
  - mismatched amounts never marked paid;
  - bad signatures rejected with 401 and recorded;
  - no 5xx errors.

**S4. Email queue backlog**

- **Setup:** 20,000 emails queued (log transport) while S1 runs at 25 shoppers.
- **Drain:** `process_outbox.php` with 1 worker, then with 4.
- **Measured:**
  - drain time;
  - age of the oldest waiting email, sampled every 10 s;
  - each email sent exactly once;
  - S1's p95 with and without the backlog;
  - the automatic after-response retry still sending at most one small batch a minute.

**S5. Picture storage and delivery**

- **Uploads:** 50 admin uploads at once (JPEG/PNG/WebP, up to 5 MB) to the server disk, then to
  the stand-in S3 bucket.
- **Delivery:** 200 concurrent first-time image requests through the storefront optimiser
  (`/_next/image`, cold cache), then the same requests warm.
- **Measured:**
  - upload p95;
  - GPS data still removed;
  - optimiser CPU and time to the first and last image;
  - `/uploads` 304 answers.

**S6. Live updates (SSE):** not implemented (Prompts 32–35 skipped), so there is nothing to test.

## 4. What is recorded

Every scenario writes one JSON results file plus a short summary:

- **Load:**
  - concurrent shoppers per step;
  - requests per second;
  - p50/p95/p99 latency per request type;
  - errors by status code (429s counted separately as "limited, as designed").
- **Machine:** CPU and memory of `httpd`, `mysqld`, `node` (the storefront) and the generator,
  sampled every 5 s (Windows performance counters).
- **PHP workers:** Apache `server-status` (busy/idle workers) every 5 s. The temporary config
  loads `mod_status`, for localhost only.
- **Database:**
  - `Threads_connected` and `Threads_running` (peak) and `Innodb_row_lock_waits`/`_time`;
  - deadlocks (`SHOW ENGINE INNODB STATUS`);
  - slow queries (slow query log on, 200 ms threshold, test database only).
- **Cache:** hit rate, estimated from new cache files (misses) versus catalogue requests.
- **Email queue:** pending count, oldest pending age, sent/failed, duplicates (must be 0).
- **Integrity checks after each scenario:**
  - stock never below 0;
  - orders match inventory;
  - each payment applied once;
  - one email per dedup key.

## 5. Stop conditions

- **Stop the whole test immediately:**
  - any integrity check fails (oversold stock, a double payment, a duplicate email);
  - a target is not local;
  - free disk space falls below 3 GB;
  - the owner's :3000/:8000 servers stop answering.
- **End the current step and keep its numbers** (that step is the measured limit):
  - errors other than 429 above 2% for 30 s;
  - p95 above 3 s for 60 s;
  - CPU at 100% for 2 minutes;
  - all 150 Apache workers busy for 30 s.
- **Time limits:** at most 90 minutes for the whole run; no scenario step longer than planned.
- **No tuning during a run.** Settings stay as they were at the start; changes go to Prompt 38.

## 6. Pass targets (the owner to confirm or change)

These are proposed launch targets for a small or medium shop, not measured yet:

| Target | Proposed |
|---|---|
| Shoppers browsing at once | 50, with catalogue API p95 < 300 ms and page p95 < 1 s (server time) |
| Checkouts | 30 at once: order p95 < 1.5 s, zero oversell |
| Errors (excluding designed 429s) | < 0.5% |
| Webhooks | 0 double payments, 0 duplicate emails |
| Email backlog of 20,000 | Drained within 10 minutes with 4 workers; browsing p95 rises < 20% |

## 7. Cleanup after the run

Drop `shopco_load`, stop Apache :8150, storefront :3100 and the stand-ins, and delete the
throw-away log, upload folder and env files. Keep only the results files, in
`backend/storage/loadtest/` (git-ignored).
