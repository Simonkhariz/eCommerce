# Deployment runbook: Shop.co on Truehost (cPanel)

The exact steps used to put the demo shop online, with the real addresses and the problems met on
the way. Follow it top to bottom for a fresh deployment; "Updating later" covers new versions.
The general guide for any cPanel host is `deploy/cpanel/README.md`; this file is the record of
**this** host. No passwords or keys are written here.

**Status:** in progress (see the log at the end).

## The setup at a glance

| What | Value |
|---|---|
| Host | Truehost, Web Hosting **Starter** (cPanel, LiteSpeed, CloudLinux) |
| Account (home folder) | `oqlfyktj` → `/home/oqlfyktj` |
| Main domain | `kharizdigital.com.ng`: the owner's company site and email. **The shop never touches it** (`public_html`) |
| Storefront | `https://shopco.kharizdigital.com.ng` (Node.js app in `/home/oqlfyktj/shopco-web`) |
| API | `https://shopco-api.kharizdigital.com.ng` (PHP, document root `/home/oqlfyktj/shopco-api/public`) |
| Database | MySQL **8.4**, database and user both `oqlfyktj_shopco`, host `localhost` |
| PHP | 8.3 (MultiPHP), all needed extensions present; OPcache not available in the panel |
| Node.js | Setup Node.js App, versions up to 26 (20 or newer needed) |
| Pictures | Cloudflare R2, bucket `shopco-media` (the same keys as the PC) |
| Email | Resend, domain `shopco.kharizdigital.com.ng`, sender `orders@shopco.kharizdigital.com.ng`, replies to `khariz.digital@gmail.com` |
| Server location | Dallas, USA (IP `102.203.116.19`) |

**Why the email is on the subdomain:** the main domain is kept free for the company's own email.
Resend's free plan allows one domain, so later demos either share this one or need a paid plan.
No mailbox exists for `orders@...`; `MAIL_REPLY_TO` sends replies to the Gmail.

**Redis (Upstash) is not used:** the server is in Dallas and the Upstash database was in Cape Town,
slower than the 150 ms the shop allows per reply, and on one server the built-in file cache is faster.

## 0. On the PC, before each deployment

1. Commit everything (the build only takes committed code).
2. Build the two upload files (about 5 minutes; they land in `Desktop\shopco-cpanel`):
   ```powershell
   powershell -ExecutionPolicy Bypass -File deploy/cpanel/build.ps1 -ApiUrl https://shopco-api.kharizdigital.com.ng
   ```
3. **First deployment only:** make the clean copy of the database (products, settings, coupons,
   banners and administrators; no test customers or orders):
   ```powershell
   php backend/scripts/export_for_host.php
   ```
   It writes `backend/storage/backups/for-host-<date>.sql.gz` and lists the administrators it keeps.
   Before running it, set a real contact email in admin → Store settings: it appears in every email's
   footer and the storefront's.
4. **The API's settings file** (`.env`): start from `deploy/cpanel/env.cpanel.example` and fill in the
   values in the table above. The secrets come from: database password (cPanel, step 2), R2 keys (the
   PC's `backend/.env`), Resend key (resend.com → API Keys), `REVALIDATE_SECRET` (any random 48
   characters: `php -r "echo bin2hex(random_bytes(24));"`, the same value goes in the Node.js app).
   The filled copy from the first deployment is kept on the PC at
   `Desktop\shopco-cpanel\api-settings\.env`, with `node-app-variables.txt` beside it. Keep both private.

## 1. Domain, subdomains and https

1. Buy the domain with the hosting (Truehost's nameservers, so no DNS setup is needed). A new `.com.ng`
   took several hours before it answered at all.
2. cPanel → **Domains** → **Create a New Domain**, twice. Untick **Share document root** both times.
   - `shopco.kharizdigital.com.ng`, document root: keep cPanel's suggestion (`shopco.kharizdigital.com.ng`).
     It must not be `shopco-web`: the Node.js app folder and the document root can't be the same.
   - `shopco-api.kharizdigital.com.ng`, document root: type **only** `shopco-api/public`.
     **Don't type `/home/oqlfyktj/...`:** the box is already inside the home folder, and a full path
     creates `/home/oqlfyktj/home/oqlfyktj/shopco-api/public`. If that happens: Domains → **Manage** →
     **New Document Root** `shopco-api/public`, then delete the stray `home` folder.
3. **https:** this cPanel has no "SSL/TLS Status" page; the free certificates arrive by themselves,
   which took about a day for the new domain. Check by opening both addresses with `https://`.

## 2. Check the host and create the database

1. Upload `deploy/cpanel/check-host.php` to the `shopco.kharizdigital.com.ng` folder, open it, keep the
   result, **delete it**. Leave `cgi-bin` and `php.ini` in that folder alone (cPanel makes them).
   (Its R2 line used to say NO because Cloudflare's bare test address has an expired certificate;
   fixed in the checker. The real R2 check is System status, step 7.)
2. cPanel → **MySQL Database Wizard**: database `shopco`, user `shopco` (both become `oqlfyktj_shopco`),
   **ALL PRIVILEGES**. Avoid `#` and quote marks in the password.
3. phpMyAdmin's first page shows the server version (MySQL 8.4.13 here).

## 3. Put the API online

1. **File Manager** → Settings → tick **Show Hidden Files**.
2. In `/home/oqlfyktj/shopco-api`, upload `shopco-api.zip`, **Extract** it there, delete the zip.
3. Upload the `.env` into `/home/oqlfyktj/shopco-api` (next to `src` and `public`, **not** inside `public`).
4. **PHP:** this cPanel has **MultiPHP**, not "Select PHP Version".
   - **MultiPHP Manager:** `shopco-api.kharizdigital.com.ng` on PHP 8.2 or newer.
   - **MultiPHP INI Editor** → Basic Mode → location `shopco-api.kharizdigital.com.ng`:
     `upload_max_filesize` 8M, `post_max_size` 10M → Apply.
5. **phpMyAdmin** → `oqlfyktj_shopco` → **Import** → the `for-host-<date>.sql.gz` file → Import.
   Green "Import has been successfully finished"; 35 tables.
6. **Database update check:** cPanel → **Cron Jobs** → once per minute, command:
   ```
   /usr/local/bin/php /home/oqlfyktj/shopco-api/migrations/migrate.php > /home/oqlfyktj/shopco-api/storage/logs/migrate.log 2>&1
   ```
   Wait 2 minutes, delete the job, read `storage/logs/migrate.log`: "Database is up to date".
7. Open `https://shopco-api.kharizdigital.com.ng/api/v1/health`: it must show `"status":"healthy"`.
   - **403 Forbidden on every address** (found 8 Nov 2026): LiteSpeed applied `shopco-api/.htaccess`
     ("refuse everything", meant for hosts that serve the whole folder) to `public` too. Fixed in the
     package: `public/.htaccess` now starts with `Require all granted`. For a package built before the
     fix, upload the new `public/.htaccess` over the old one.

## 4. Put the storefront online

*To be written as it is done.*

## 5. Scheduled jobs (Cron Jobs)

Add `>/dev/null 2>&1` at the end if the host emails you every run.

| How often | Command |
|---|---|
| Every 5 minutes | `/usr/local/bin/php /home/oqlfyktj/shopco-api/scripts/process_outbox.php --limit=500 --max-seconds=50 --rate=8` |
| Every 10 minutes | `/usr/local/bin/php /home/oqlfyktj/shopco-api/scripts/expire_pending_orders.php` |
| Daily 03:00 | `/usr/local/bin/php /home/oqlfyktj/shopco-api/scripts/check_database.php` |
| Daily 02:30 | `/usr/local/bin/php /home/oqlfyktj/shopco-api/scripts/backup.php && /usr/local/bin/php /home/oqlfyktj/shopco-api/scripts/backup_to_bucket.php` |

*Status: to be added.*

## 6. Final checks

*To be written as they are done.* (Admin → dev mode → System status: visitor addresses show your own
address, storage `s3 · writable`, email Resend; a test order from a phone on mobile data; one picture
upload; UptimeRobot on the health address and the shop.)

## Updating later

1. Commit, then build (step 0.2). Don't export the database again: it would replace real data.
2. **API:** upload and extract `shopco-api.zip` over `/home/oqlfyktj/shopco-api` (`.env` and
   `storage` aren't in the zip, so they're kept). If the update changed the database, run the update
   check from step 3.6.
3. **Storefront:** delete the old `.next` folder in `shopco-web`, upload and extract `shopco-web.zip`
   over it, then **Restart** in Setup Node.js App.
4. Don't update during a client demo: pages can fail for a few minutes.

## Problems met and their fixes

| Date | Problem | Fix |
|---|---|---|
| 7 Nov 2026 | The new domain didn't exist on the internet for hours | Wait; `.com.ng` registration takes time |
| 7 Nov 2026 | check-host.php said R2 was blocked | Cloudflare's bare test address has an expired certificate; checker fixed (124f434) |
| 8 Nov 2026 | API subdomain's folder created at `/home/oqlfyktj/home/oqlfyktj/...` | Full path typed in the document root box; changed to `shopco-api/public` |
| 8 Nov 2026 | No "Select PHP Version" in cPanel | Truehost uses MultiPHP Manager and MultiPHP INI Editor |
| 8 Nov 2026 | API answered 403 Forbidden to everything | Parent `.htaccess` applied by LiteSpeed; `Require all granted` in `public/.htaccess` |

## Log

| Date | Done |
|---|---|
| 7 Nov 2026 | Bought Truehost Starter and `kharizdigital.com.ng`; created both subdomains; host check passed; upload files built |
| 8 Nov 2026 | Resend verified on `shopco.kharizdigital.com.ng`, test and sample emails delivered; https live; database created, imported and up to date (MySQL 8.4) |
