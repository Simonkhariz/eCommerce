# Deployment compatibility (roadmap Prompt 40)

30 October 2026. What the shop needs from a host, checked against the code, and what each kind
of hosting means for it. The host is not chosen yet; step-by-step setup is in
`docs/OWNER_TODO.md` (VPS, cPanel, this PC). Nothing was deployed and no DNS or production
setting was changed.

## What the shop needs

| Part | Requirement | Where it comes from |
|---|---|---|
| Storefront | Node.js 20.9 or newer (Next.js 16); `npm ci` on the server itself (sharp is built per system) | `node_modules/next/package.json` engines; `package.json` engines |
| API | PHP 8.2+ with mysqli, curl, mbstring, openssl, json, simplexml, ctype | `backend/composer.json`; admin → System status → PHP lists any that are missing |
| Backups | zlib (and phar when pictures are on the server's disk) | `scripts/backup.php` stops with the reason if missing |
| PHP settings | `upload_max_filesize` and `post_max_size` at least 6M (pictures up to 5 MB; many hosts default to 2M); `max_execution_time` 120; OPcache on (halved response times in the load test) | System status shows the upload limit and OPcache |
| Database | MySQL 8 or MariaDB 10.4+, InnoDB, utf8mb4 | Migrations use only syntax both accept; the session time zone is set as an offset (`+01:00`), so the server needs no time-zone tables |
| Web server | Apache (the `.htaccess` files are ready) or nginx + PHP-FPM; document root `backend/public` only | `php -S` serves one request at a time (load test: a single slow request held up every other one for 4.6 s) |
| HTTPS | Required in production: sign-in cookies are always `Secure` when `APP_ENV=production` | `SessionCookie::isSecure` |
| Scheduled jobs | Every minute (email), every 10 minutes (unpaid orders), daily (database check, backup) | Root README "Background jobs". If the host only allows every 5 or 15 minutes, email still goes out: the API retries due emails after requests |
| Email | Resend (domain verified) or SMTP; outbound HTTPS to api.resend.com or the SMTP port | `docs/EMAIL_SETUP.md`; Resend allows 10 requests a second per account |
| Payments | Kora must reach `APP_URL/api/v1/webhooks/kora` over public HTTPS; Monnify's webhook URL is set in its dashboard; outbound HTTPS to both | System status warns when `APP_URL` is not public HTTPS |
| Pictures | Server disk (default) or an S3-compatible bucket (Cloudflare R2 chosen, not set up) | `docs/STORAGE.md` |
| Redis | Optional (`REDIS_URL`; a hosted one such as Upstash must be in the server's region, `docs/REDIS.md`): shares the catalogue cache between servers; no PHP extension needed (TCP, TLS or a Unix socket, as many cPanel hosts give it). Without it, or when it is down, the file cache is used | `docs/REDIS.md` |
| Live payment status (SSE) | Optional, off by default (`SSE_ENABLED`). Each open stream holds one PHP worker and one database connection for up to 110 s, capped by `SSE_MAX_STREAMS` (measured exactly so in Prompt 35). Size it at about half of PHP-FPM `pm.max_children` and MySQL connections on a VPS, and about a quarter of entry processes and database connections on shared cPanel (4–5 on a typical plan). Never with `php -S`. Re-measure on staging before switching it on (`docs/SSE_CONTRACT.md` §13) | `docs/SSE_CONTRACT.md` |

## Hosting options

### A. One Linux server (VPS): recommended

nginx (HTTPS) → Next.js on 127.0.0.1:3000 → PHP-FPM API on 127.0.0.1:8080, MySQL on the same
server or managed. Everything the shop needs is available, the API stays internal, and cron is
normal. Constraints:

- nginx in front of Next.js must set `X-Forwarded-For $remote_addr` (see OWNER_TODO). Without
  it, Next.js passes on whatever address a visitor sends, and the API cannot tell visitors apart.
- `APP_URL` = the shop's public `https://` address (not 127.0.0.1:8080), or Kora's payment
  notifications go nowhere.
- One Next.js process: its page cache and the API's file cache live on this server. Running
  several servers needs a shared page cache, and `catalog.version` moved into MySQL (noted in
  the Redis review, Prompt 26).

### B. Shared hosting (cPanel)

API under a subdomain whose document root is `backend/public`; storefront as a cPanel
"Node.js App" (Passenger) or on Vercel (option C). Step-by-step guide and build script:
`deploy/cpanel/README.md`. The storefront is built on a PC into a self-contained package, because
builds on shared hosting usually run out of memory. Rehearsed on Linux with Apache, Passenger and
MySQL 8; not yet run on a real host or LiteSpeed. Constraints:

- Check the PHP version (8.2+), the extensions and the upload limit in cPanel's "Select PHP
  Version" / "MultiPHP INI Editor", then in System status.
- Cron is under "Cron Jobs"; some hosts allow every 5 or 15 minutes only (email still works,
  less promptly; see above).
- The Node.js App must run behind the host's proxy that sets `X-Forwarded-For`, and the proxy's
  address must be in `TRUSTED_PROXIES`. Confirm with System status → "Visitor addresses".
- Long admin actions are limited by the host's PHP time limit (often 30 s). A newsletter is
  queued in one transaction (11 s for 20,000 in the load test): if it is cut off, nothing is
  queued and sending again is safe; if it finished, sending again queues nobody twice.
- Shared CPU: the load test (4 cores) reached 50 shoppers at p95 0.1 s; expect less.

### C. Storefront on Vercel, API elsewhere

Works, with one real limit: every request reaches the API from Vercel's servers, whose addresses
are many and change, so they cannot be listed in `TRUSTED_PROXIES`. The API then sees Vercel's
address instead of each visitor's, and visitors share rate limits (10 orders per 10 minutes per
address, sign-in attempts, promo-code tries). On a busy shop that would refuse real customers.
Before choosing this, the shop needs a signed header from the storefront that the API trusts in
place of the address list: a small change, not built yet. Also:

- `BACKEND_ORIGIN` must be the API's public `https://` address.
- Picture resizing (`/_next/image`) counts against Vercel's image limits.

## Free hosting: what was checked (30 October 2026)

The owner's choice: cPanel for the API, the storefront host still open, and free if possible.
Official terms, read on 30 October 2026:

| Option | Fits the shop? | Why (quoted from the provider) |
|---|---|---|
| Vercel Hobby (free) for the storefront | **No** | "Hobby teams are restricted to non-commercial personal use only." Commercial use includes "Any method of requesting or processing payment from visitors of the site" (vercel.com/docs/limits/fair-use-guidelines). The shop takes payments, so it needs Vercel Pro, and option C's address limit (above) still applies |
| Free cPanel hosting such as InfinityFree for the API | **No** | Every free account has a browser check that blocks "Webhooks from external services" and "REST APIs" and "can't be turned off for one path" (forum.infinityfree.com, Browser security system). Kora's payment notifications and the storefront's own calls to the API would both be refused |
| Cloudflare Workers free plan for the storefront | Not realistic | "CPU time per HTTP request: 10 ms" and 100,000 requests a day on the free plan (developers.cloudflare.com/workers/platform/limits); Next.js there runs through vinext, which "is in beta" |
| Free cPanel hosting **with Node.js**, such as HelioHost or WebHostMost (checked 2 November 2026) | Untested | Both list Node.js on their free plans, so the storefront could run next to the PHP API (option B). Their memory and process limits are not published; the storefront must be built on a PC and uploaded (`output: 'standalone'`, not set up yet), since builds on shared hosts run out of memory. HelioHost is volunteer-run and reportedly suspends accounts not logged into monthly. A fallback if Oracle is not available |
| Render free for the API, plus a free MySQL (checked 5 November 2026) | **Not advised** | Free web services "spin down" after 15 minutes idle and take about a minute to wake, so a client's first click waits. No MySQL (only Postgres, deleted after 30 days plus a grace period), so the database would be a third service such as Aiven's free 1 GB. PHP needs Docker; no free cron jobs or one-off jobs; 750 free hours a month across the workspace, so two services can't both run all month; and it can restart at any time, losing files that aren't in the bucket (logs, cache, backups) |
| Oracle Cloud Always Free (one server for everything, option A) | **First choice for the demo (2 November 2026); sign-up refused the owner on 5 November with a generic error** | Arm server; the free allowance was cut in August 2026 to 2 OCPUs and 12 GB of memory (servers above it were switched off), 200 GB of storage, "10 TB per month of outbound data". "Idle Always Free compute instances may be reclaimed by Oracle" when CPU, network **and** memory stay under 20% for 7 days. A quiet shop uses little CPU and network, so memory decides: an estimated 700–1000 MB (not yet measured on the server) is about 23–33% of a 1 OCPU / 3 GB server, and under 20% of a larger one. Card needed at sign-up. See "Free always-on demo" below |

**Recommendation:** for a shop that takes real payments, the dependable choice is a low-cost
paid plan that runs both parts in one place: a cPanel plan that includes "Setup Node.js App"
(storefront) next to PHP and MySQL (API), or a small VPS (option A). Everything then stays on one
server: no address limit, no browser check, real cron. Oracle's free server can work for testing
and a soft launch if you accept the reclaim risk and keep off-server backups (`docs/BACKUPS.md`).
Whatever you choose, check before paying: PHP 8.2+, Node.js 20.9+ ("Setup Node.js App"),
cron every minute, SSH (handy, not required: backups and restores work without it), and no
browser check on API calls.

## Free always-on demo: Oracle Cloud (2 November 2026)

To show the shop to clients at no cost, online even when the owner's PC is off:
`deploy/oracle/README.md` (step by step) with `deploy/oracle/setup.sh` (one command on a fresh
Ubuntu 24.04 server). It is option A on one free server:

- **Address without a domain:** `https://<server-ip>.sslip.io` (sslip.io resolves to the IP in the
  name; Let's Encrypt issues the certificate). Moving to a domain later: point it at the server,
  then change `APP_URL`, `FRONTEND_URL`, `CORS_ALLOWED_ORIGINS` and the nginx `server_name`.
- **Security on a public demo:** the API listens on 127.0.0.1 only; nginx replaces
  `X-Forwarded-For` with the visitor's address (`TRUSTED_PROXIES=127.0.0.1`); `APP_ENV=production`
  and `APP_DEBUG=false`; the first-run setup page is refused from the internet (on an empty
  database whoever reached it first would own the shop), so the first administrator is created
  through an SSH tunnel, or the owner's database is copied in with its admin accounts.
- **Keeping it:** sized 1 OCPU / 3 GB, not the free maximum, because a database cache only takes
  memory as data is read (the shop's data is a few MB), so a larger server looks idle. Measure
  after setup (README step 8) and lower to 2 GB if it is still under 20%. Also a free
  uptime monitor on `/api/v1/health`; nightly database backup copied to the R2 bucket
  (`backend/scripts/backup_to_bucket.php`), so a lost server is rebuilt from it in about an hour.
- **Demo limits:** WhatsApp payment only until gateway keys are added; emails go to the log until
  Resend is set up; live payment status (SSE) stays off until measured on this server.
- The PC and the server share the R2 bucket but not the database: removing "unused" pictures on
  either copy could remove pictures the other uses.

## Fixed during this audit

| Problem | Effect on a live shop | Fix |
|---|---|---|
| The client address was taken from the leftmost `X-Forwarded-For` entry | Anyone could send a made-up address and step around every rate limit (sign-in, checkout, promo codes) | Read from the right, skipping only trusted proxies; `TRUSTED_PROXIES` accepts ranges (IPv4 and IPv6); System status shows the address the API sees. `SecurityTest` |
| The public `/health` showed the PHP version, database name, environment and extensions | Free information for attackers | Only up/down and a timestamp; details moved to System status |
| A picture over the host's PHP upload limit said "error code: 1", or "no image file provided" when over `post_max_size` | Admin cannot tell why uploads fail on a new host | Plain message with the server's limit and what to ask the host; System status shows the limit |
| Calls through the storefront to the API were cut at 30 s | A long admin action shows an error while the server finishes it; sending a newsletter again would email everyone twice | `experimental.proxyTimeout` 120 s, and the same newsletter is queued at most once per subscriber per day |
| `APP_URL` was described as "the API's URL" | In the recommended layout that is an internal address, so Kora's payment notifications would never arrive (payments confirmed only when customers return to the shop) | `.env.example` explains it; System status warns about it, an `http://` `FRONTEND_URL`, localhost in `CORS_ALLOWED_ORIGINS`, and sandbox payment keys, on a production server |
| ctype was used but not declared; backups needed zlib and phar without saying so | A host without them fails with a PHP error | Declared in `composer.json`; `backup.php` names what is missing |

## Before going live

1. Choose the hosting (A recommended). If C, ask for the signed-header change first.
2. Set `APP_ENV=production`, `APP_DEBUG=false`, and `APP_URL`, `FRONTEND_URL` and
   `CORS_ALLOWED_ORIGINS` to the `https://` address.
3. Turn on dev mode (admin → Store settings), then open System status: no warnings, PHP extensions complete, OPcache on, upload limit at
   least 5 MB, "Visitor addresses" shows your real public address.
4. Schedule the jobs, and set up Resend and the live payment keys (`docs/EMAIL_SETUP.md`,
   `docs/KORA_INTEGRATION.md`).
5. Re-run the load test on staging (`docs/LOAD_TEST_PLAN.md`), never on the live shop.
