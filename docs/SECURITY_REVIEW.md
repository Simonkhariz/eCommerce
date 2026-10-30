# Security and failure-mode review (roadmap Prompt 39)

30 October 2026, branch `scalability-phase1`. Scope: everything this branch added or changed
(storefront refresh, admin and payment queries, catalogue cache, picture storage and bucket
serving, picture migration, backups, email after the response, Resend, the outbox worker). Redis
and SSE were not built (owner decision), so there is nothing of theirs to review. Earlier audit
work (sign-in, CSRF, sessions, uploads, rate limits) is covered by `SecurityTest` and was
re-run, not re-reviewed.

## Fixed

| # | Area | Problem | Fix | Test |
|---|---|---|---|---|
| 1 | Catalogue cache | The cache key was the raw query string and catalogue reads have no rate limit, so made-up filter values (`?min_price=1`, `2`, `3` …) each created a new cache file, kept for an hour. At a few hundred requests a second that is gigabytes per hour on the server's disk. | Keys are built from normalised values (same colours in any order or case share one entry; page size capped like the API); deep pages (> 20), non-numeric prices and unusual values are served but not cached; the folder is capped at 5,000 entries, the oldest removed first (about 65 MB). | `CacheRefreshTest` (11 new checks) |
| 2 | Shared caches | The JSON response replaced the `Vary: Origin` header that CORS sets, so a CDN could hand one site's CORS answer to another (breaks the shop for that site; no data leak). | `Vary: Accept-Encoding` is added, not replaced. | `SecurityTest` (fails without the fix) |
| 3 | Email after the response | The work after the response (emails, storefront refresh) did not ask PHP to ignore a visitor who disconnects. Where PHP stops a script on disconnect, an email accepted by the mail server but not yet marked sent would be sent again after its 10-minute lease (Resend's idempotency key prevents that for 24 hours; SMTP has no such protection). | `ignore_user_abort(true)` before finishing the response. | Existing `MailAsyncTest` (no test reproduces a disconnect) |

Fixed in the load-test follow-up (commit `e2f8484`): a Resend "too many requests" answer used to
count as a failed attempt (5 attempts and the email is marked failed).

## Checked, no problem found

- **Storefront refresh** (`app/api/revalidate`): secret at least 32 characters, compared in
  constant time; 404 when not set; `no-store`; the PHP side has 1 s / 3 s timeouts and never
  affects the admin change. A leaked secret only lets someone clear the page cache.
- **Admin and payment queries:** keys start with the admin's id, the cache is cleared on sign-out,
  the server makes a new query client for every render; mutations are never retried.
- **Public caching:** only catalogue, categories, homepage, delivery zones and payment methods are
  marked public; session cookies are set only on sign-in and sign-out, never on those answers.
  The browser cache in `lib/api-client.ts` holds only public catalogue reads.
- **Picture serving from the bucket** (`MediaServer`): GET/HEAD only, keys validated (no `..`,
  no hidden files, letters/digits/`._-` only), only jpg/png/webp with a fixed content type and
  `nosniff`, objects limited to the `uploads/` prefix, errors give no details.
- **Disk storage:** paths are resolved and must stay inside the uploads folder.
- **Bucket signing:** the secret is never sent or logged (SigV4); TLS verification is never turned
  off; error messages carry the HTTP status only.
- **Webhooks:** Kora and Monnify signatures use HMAC with `hash_equals`; unchanged on this branch
  and still covered by `PaymentIntegrityTest`.
- **Backups:** the folder is created `0750` (other accounts on the server cannot open it); the
  database password goes to `mysqldump` through its environment, not the command line;
  `backend/.htaccess` refuses all web access if the server is ever pointed at `backend/`.
- **Command-line scripts** answer 404 when reached through a web server.
- **Secrets in the browser:** the only `NEXT_PUBLIC_` variable is the API path.
- **Email content:** Resend gets JSON (no header injection); SMTP headers are encoded and stripped
  of line breaks; addresses are validated before queueing.
- **Outbox:** each email is claimed with a 10-minute lease before sending, so workers, the API's
  own retries and other servers never send the same email twice (re-tested in the load test:
  1,500 and 2,000 emails, four workers alongside the API's retries, every email exactly once).

## Accepted risks (no change; reasons)

- **At-least-once email with SMTP:** a crash between the mail server accepting an email and it
  being marked sent resends it after 10 minutes. Resend (the chosen provider) closes this with
  its idempotency key.
- **The API's automatic email retry** runs after the first request each minute and can keep that
  one PHP worker busy for up to 20 s when the mail service hangs. Bounded, and the visitor has
  their answer already.
- **`S3_ENDPOINT` may be `http://`** (needed for local tests). Cloudflare R2 endpoints are
  HTTPS; set it as given in the R2 dashboard.
- **`/_next/image`** resizes only the shop's own pictures, to the configured widths, so the
  number of versions an attacker can make is limited.
- **`dev-router.php`** is for `php -S` on a development PC only; the production server uses
  `backend/public` with `.htaccess`.
