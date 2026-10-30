# Deployment compatibility (roadmap Prompt 40)

30 October 2026. What the shop needs from a host, checked against the code, and what each kind
of hosting means for it. The host is not chosen yet; step-by-step setup is in
`docs/OWNER_TODO.md` (VPS, cPanel, this PC). Nothing was deployed and no DNS or production
setting was changed.

## What the shop needs

| Part | Requirement | Where it comes from |
|---|---|---|
| Storefront | Node.js 20.9 or newer (Next.js 16); `npm ci` on the server itself (sharp is built per system) | `node_modules/next/package.json` engines; `package.json` engines |
| API | PHP 8.2+ with mysqli, curl, mbstring, openssl, json, fileinfo, simplexml, ctype | `backend/composer.json`; admin → System status → PHP lists any that are missing |
| Backups | zlib (and phar when pictures are on the server's disk) | `scripts/backup.php` stops with the reason if missing |
| PHP settings | `upload_max_filesize` and `post_max_size` at least 6M (pictures up to 5 MB; many hosts default to 2M); `max_execution_time` 120; OPcache on (halved response times in the load test) | System status shows the upload limit and OPcache |
| Database | MySQL 8 or MariaDB 10.4+, InnoDB, utf8mb4 | Migrations use only syntax both accept; the session time zone is set as an offset (`+01:00`), so the server needs no time-zone tables |
| Web server | Apache (the `.htaccess` files are ready) or nginx + PHP-FPM; document root `backend/public` only | `php -S` serves one request at a time (load test: a single slow request held up every other one for 4.6 s) |
| HTTPS | Required in production: sign-in cookies are always `Secure` when `APP_ENV=production` | `SessionCookie::isSecure` |
| Scheduled jobs | Every minute (email), every 10 minutes (unpaid orders), daily (database check, backup) | Root README "Background jobs". If the host only allows every 5 or 15 minutes, email still goes out: the API retries due emails after requests |
| Email | Resend (domain verified) or SMTP; outbound HTTPS to api.resend.com or the SMTP port | `docs/EMAIL_SETUP.md`; Resend allows 10 requests a second per account |
| Payments | Kora must reach `APP_URL/api/v1/webhooks/kora` over public HTTPS; Monnify's webhook URL is set in its dashboard; outbound HTTPS to both | System status warns when `APP_URL` is not public HTTPS |
| Pictures | Server disk (default) or an S3-compatible bucket (Cloudflare R2 chosen, not set up) | `docs/STORAGE.md` |
| Redis, SSE | Not used (owner decision); no requirement | |

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
"Node.js App" (Passenger) or on Vercel (option C). Constraints:

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
3. Open admin → System status: no warnings, PHP extensions complete, OPcache on, upload limit at
   least 5 MB, "Visitor addresses" shows your real public address.
4. Schedule the jobs, and set up Resend and the live payment keys (`docs/EMAIL_SETUP.md`,
   `docs/KORA_INTEGRATION.md`).
5. Re-run the load test on staging (`docs/LOAD_TEST_PLAN.md`), never on the live shop.
