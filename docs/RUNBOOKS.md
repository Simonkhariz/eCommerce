# Runbooks: what to do when something goes wrong (roadmap Prompt 41)

Short, step-by-step answers for the shop's owner or whoever runs it. Each one starts with how
you notice, then what to do. Admin → **System status** is the first place to look for all of
them. Redis (runbook 8) and live payment status (runbook 9) are optional.

Golden rules: never restore over the live database (restore into a new one, check it, then
switch); never delete data outside admin → Data & storage (which asks for your password and an
emailed code); write down what you did and when.

## 1. Restore after data loss (database or pictures)

**You notice:** orders, products or customers are missing or wrong; the host lost the server.

1. Put the shop in a quiet state if it is still running (pause ads; a notice on the home banner).
2. Pick the newest backup from before the problem (`backend/storage/backups/<date>/`, or your
   off-server copy). Check `manifest.json` → `created_at`.
3. Create a new, empty database (cPanel → MySQL Databases; add the shop's user with all
   privileges). Restore into it, with no shell tools needed:
   ```bash
   php backend/scripts/restore_database.php --backup=<backup folder> --database=<new database>
   ```
   It checks the backup's checksum first, refuses any database that already has tables, and
   for backups written by PHP checks every table's row count. On cPanel without SSH, run the
   same command once as a cron job ("Cron Jobs", a minute from now, then remove it) and read its
   output in the email cPanel sends.
4. Point `DB_DATABASE` in `backend/.env` at the new database. Open admin → System status
   (database connected, migrations applied), then a few recent orders and products.
5. Pictures (when they are on the server's disk): extract `uploads.tar.gz` into
   `backend/public/uploads` (cPanel File Manager → Extract, or `tar -xzf`).
6. Orders paid between the backup and the failure are not in the restored database: find them
   in the Kora and Monnify dashboards (and your WhatsApp transfers) and re-enter or refund them
   (runbook 4).

**Rehearse it** every few months into a spare database. The test suite does this on its test
database every run (`UploadsTest`: mysqldump and PHP backups restore with identical rows; damaged
or cut-off backups are refused and leave nothing behind).

## 2. Emails are not going out

**You notice:** System status → "Emails waiting to send" keeps growing, or "The oldest email due
to be sent has waited N minutes"; customers say they got no confirmation.

1. **Email delivery** row: "log only" means no email service is set up (`MAIL_MAILER`,
   `RESEND_API_KEY`, `MAIL_FROM_ADDRESS` in `backend/.env`; `docs/EMAIL_SETUP.md`).
2. Admin → Email outbox: the **last error** of a waiting or failed email names the cause:
   - `HTTP 401/403`: the Resend key is wrong or the sending domain is not verified.
   - `HTTP 429 rate_limit_exceeded`: sending too fast; nothing is lost (the email keeps its
     attempts and is tried again a minute later). Lower `--rate` in the cron command.
   - `daily_quota_exceeded` / `monthly_quota_exceeded`: the Resend plan's limit; upgrade or wait.
   - `Could not reach Resend` / timeouts: Resend or the host's network is down. Emails are
     retried after 1, 5, 15 and 60 minutes, five attempts in all.
3. **Resend is down for hours:** switch to SMTP (your host's mailbox works): set
   `MAIL_MAILER=smtp` and the `MAIL_*` SMTP settings; waiting emails go out through it.
4. Emails that reached "failed" (5 attempts used) are not sent on their own: Email outbox →
   **Send again** for each one that still matters (order confirmations, payment receipts).
   Sign-in links cannot be re-sent; the customer asks for a new one.
5. **Nobody is sending at all** (oldest due email older than 15 minutes on a busy shop): the
   cron job for `process_outbox.php` is missing or failing (runbook 3). Meanwhile "Send queued
   now" on the Email outbox page sends a batch by hand.

## 3. Scheduled jobs (cron) stopped

**You notice:** emails wait (above); System status → "Unpaid orders past their payment window"
keeps growing (stock stays reserved); no backup folder for today; no database-check emails.

1. cPanel → Cron Jobs: the four lines from the root README ("Background jobs") are there, with
   the right PHP path (cPanel shows it, often `/usr/local/bin/php`) and the right folder.
2. cPanel emails each job's output to the address at the top of the Cron Jobs page: errors show
   there. Run a job once by hand (SSH, or a one-off cron line) to see its message.
3. A host that only allows every 5 or 15 minutes: keep those intervals. Emails still go out
   (the API retries due emails after visits) and unpaid orders still expire (also swept when an
   order is placed or the admin order list is opened), just less promptly.

## 4. Payments that need a person (reconciliation)

**You notice:** System status → "Orders needing attention", or the attention filter on Orders.
Each flagged order says why:

| Flag says | What happened | What to do |
|---|---|---|
| Underpaid … received X of Y | The customer paid less than the total | The order is not paid. Ask the customer to pay the rest, or refund what came in (Refunds takes up to the amount received) and cancel |
| Overpaid / duplicate payment | Paid twice or too much | The order is paid; refund the extra from the gateway dashboard, then record it in Refunds (a refund goes against the newest payment), then resolve the flag with a note |
| Payment received after the order was cancelled/expired | Money arrived after the payment window; stock was already released | A cancelled order can't be reopened. Refund the customer; they can place a new order for the items |
| The customer said they sent the transfer, but the payment window ended | They tapped "I've sent the transfer" and nobody confirmed it in time | Check your bank. Money arrived: confirm the payment (it is kept as a late payment), then refund it. Nothing arrived: resolve the flag with a note |
| Currency mismatch … verify with the gateway | The gateway reported another currency | Not applied. Check the transaction in the Kora/Monnify dashboard before doing anything |
| Cancelled after payment: record a refund | An admin cancelled a paid order | Refund in the gateway dashboard, then record it in Refunds |

Recording a refund clears the flag once no payment is left on the order. Any other flag stays until
you have dealt with it and resolved it on the order page, with a note saying what you did; the note
and the old reason stay in the order's history.

**Daily check (two minutes):** compare yesterday's successful payments in the Kora and Monnify
dashboards with admin → Payments. A payment the gateway shows but the shop does not means its
notification never arrived (check `APP_URL` in System status → warnings, and the webhook URL in
the Monnify dashboard). The order is confirmed when the customer returns to the shop, or by
`expire_pending_orders.php`, which asks the gateway before cancelling anything. WhatsApp
transfers: admin → Orders → "payment claimed" → confirm only after you see the money.

**Gateway down:** customers see an error starting payment; nothing is charged. Turn the method
off in admin → Settings → Payment methods so customers use the other one (or WhatsApp), and
turn it back on later.

## 5. A database migration went wrong

**Limits first:** migrations only add (tables, columns, indexes) and run once each, recorded in
`schema_migrations`. There is no per-migration undo. `migrations/rollback_all.sql` **drops every
table and all data**; it is for a throw-away development database only, never the live one.

1. Before every deploy that includes new migrations: take a backup (`backup.php`) and keep it.
2. If `php backend/migrations/migrate.php` fails, it stops at that file; the earlier ones are
   applied and recorded. Read the error, fix the cause (often a missing privilege on the
   host), and run it again: applied files are skipped.
3. If a migration broke the shop: restore the pre-deploy backup into a new database (runbook 1),
   deploy the previous code, and point `DB_DATABASE` at the restored database.

## 6. Pictures do not load

**You notice:** grey boxes instead of product photos; uploads fail in admin.

1. System status → **Image storage**: "not writable" means the uploads folder lost its
   permissions (cPanel File Manager → `backend/public/uploads` → 755).
2. **Largest picture upload** below 5 MB: ask the host to set `upload_max_filesize` and
   `post_max_size` to 6M (cPanel → MultiPHP INI Editor).
3. Pictures in a bucket (`STORAGE_DRIVER=s3`, Cloudflare R2): the API answers 503 when the
   bucket cannot be reached. Check Cloudflare's status page and the `S3_*` keys. Going back to
   the server's disk: `docs/STORAGE.md` → rollback (`migrate_uploads.php --to=local`).

## 7. The shop is slow or down

1. `https://<shop>/api/v1/health`: `"database":"down"` means MySQL (host's status page or
   support). No answer at all means PHP or the web server.
2. System status → PHP: OPcache off doubles response times; missing extensions break features.
3. Under heavy traffic the storefront slows first (`docs/LOAD_TEST_RESULTS.md`): a bigger plan
   or a second CPU helps more than changes to the database.
4. A wave of failed sign-ins or orders from one place is handled by rate limits. If every
   visitor seems to share them, System status → "Visitor addresses" shows a private address:
   the proxy is not passing real addresses (`docs/DEPLOYMENT.md`).

## 8. Redis is down (only when `REDIS_URL` is set)

**You notice:** System status → "Redis (optional cache)" says "Not answering"; the PHP error log
has `[Redis] unavailable, using the file cache`.

Nothing breaks: the shop serves the catalogue from the file cache and MySQL, and checks Redis again
every `REDIS_RETRY_SECONDS` (30 s). Orders, payments, stock, sign-ins and emails never depend on it.

1. Read the error in System status: "WRONGPASS" (password changed: update `REDIS_URL`), "Cannot
   connect" (Redis stopped: restart it in the host's panel, or ask the host), "did not answer in
   time" (Redis overloaded or far away).
2. When it answers again, nothing needs doing: the first request starts the shared cache afresh,
   so nothing from before the outage is shown.
3. To stop using Redis altogether, empty `REDIS_URL` in `backend/.env`.

## 9. Live payment status misbehaves (only when `SSE_ENABLED=true`)

**You notice:** the shop slows down while many customers are paying; the host reports the
"entry processes" or database connection limit reached; or customers' payment pages update only
every few seconds instead of at once.

Nothing about payments depends on it. With live status off or busy, the payment page checks the
usual way, and every payment is still confirmed by the provider's notice, the page's checks and
the 10-minute job.

1. **Too many workers or database connections:** lower `SSE_MAX_STREAMS` in `backend/.env` (each
   stream holds one of each for up to `SSE_STREAM_SECONDS`), or set `SSE_ENABLED=false`. The
   change applies to the next stream opened. A closed tab frees its worker within about 10 s,
   and after a crash or restart the old slots stop counting within 30 s; nothing needs clearing
   by hand.
2. **Pages don't update at once:** something between the shop and the customer is holding the
   stream back. Check that no proxy or CDN compresses `text/event-stream` (the stream is sent
   `no-transform`), and on nginx that buffering is off for `/api/v1/checkout/orders/*/events`
   (the stream sends `X-Accel-Buffering: no`). The page notices a silent stream after 5 s and
   checks the usual way meanwhile.
3. **Never** switch it on for a server run with `php -S`: one stream would block every other
   request.
