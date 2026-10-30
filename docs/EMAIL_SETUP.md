# Email: sender setup and monitoring

How the shop sends email, how to connect a real sending domain (Resend or SMTP), the DNS records
that keep mail out of spam, and how to watch for and fix emails that fail. Nothing here changes
DNS or live settings by itself: each step is something you do in Resend, at your domain provider,
or in `backend/.env` on the server.

**Current state:** email is in **log mode** (`MAIL_MAILER` not set). Every email is written to
`backend/storage/logs/mail.log` and nothing reaches customers. Resend support is built and waits
for a sending domain and an API key.

---

## 1. What the shop sends

| Email | To | When |
| :--- | :--- | :--- |
| Order received | Customer | An order is placed |
| Payment confirmed | Customer | A payment is verified (card, transfer, or recorded by the admin) |
| Shipped, with tracking | Customer | The admin adds a shipment |
| Order cancelled / refund | Customer | The order is cancelled, expires unpaid, or is refunded |
| Sign-in link | Customer | They ask for one at sign-in (never stored, cannot be re-sent) |
| "Customer says they paid" | Admins | A customer taps "Mark as paid" on a WhatsApp transfer |
| Clean-up code and result | Admins | Data & storage clean-up (code never stored) |
| Database alert | Admins | The daily database check finds a problem |
| Newsletter | Opted-in subscribers | The admin sends a broadcast (each has an unsubscribe link) |

## 2. Choose how email is sent

Set this in `backend/.env` on the server (never in the storefront's `.env.local`, and never in a
`NEXT_PUBLIC_*` value). The API reads `.env` on every request, so no restart is needed.

| Setting | Log (default) | Resend (recommended) | SMTP |
| :--- | :--- | :--- | :--- |
| `MAIL_MAILER` | `log` or unset | `resend` | `smtp` |
| `RESEND_API_KEY` | – | your Resend API key | – |
| `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_ENCRYPTION` | – | – | from your email provider |
| `MAIL_FROM_ADDRESS` | – | e.g. `orders@mail.yourshop.com` (on the verified domain) | an address your provider lets you send from |
| `MAIL_FROM_NAME` | – | optional, e.g. `Shop.co` (else the store name) | optional |

Also available: `MAIL_TIMEOUT_SECONDS` (default 10: how long one send may wait),
`MAIL_SEND_IMMEDIATELY` (default true: one attempt right after the response) and
`MAIL_AUTO_RETRY` (default true: retries after requests, see section 5).

Resend is recommended because each email carries an idempotency key: if an answer is lost and
the email is retried, Resend recognises it and does not send it twice. With SMTP that one rare case
(a crash after the mail server accepted an email but before the shop recorded it) can repeat an email.

## 3. Set up Resend

1. **Create a Resend account** and, under **Domains**, add the domain you will send from. Resend
   recommends a **subdomain** such as `mail.yourshop.com`, so the shop's sending reputation is kept
   apart from your main domain's own mail. Each subdomain is verified separately.
2. **Add the DNS records Resend shows** (the domain's **Records** tab) at your domain provider:
   - The records set up **SPF** and **DKIM** (and the return path for bounces, by default on
     `send.<your domain>`). They are `TXT` and `MX` or `CNAME` records.
   - Copy and paste them **exactly** as Resend generated them; don't retype them.
   - If your DNS is on Cloudflare, turn **proxying off** (grey cloud) for any CNAME, or
     verification will not complete.
3. **Wait for verification.** It often completes within 15 minutes; DNS changes can take up to
   72 hours. You can check that the records are visible with Resend's `dns.email` tool. If it has
   not verified after 72 hours, use **Restart verification** in the Resend dashboard.
4. **Create an API key** (sending access is enough) and keep it somewhere safe.
5. **Add DMARC** (section 4).
6. **Configure the shop** in `backend/.env` on the server:
   ```ini
   MAIL_MAILER=resend
   RESEND_API_KEY=re_...            # server-only
   MAIL_FROM_ADDRESS=orders@mail.yourshop.com
   MAIL_FROM_NAME="Shop.co"
   ```
7. **Check** admin → **System status**: "Email delivery" should say **Resend**.
8. **Send yourself a test**: place an order on the shop with your own email address (no need to
   pay: the "order received" email goes out when the order is placed), then cancel it in admin →
   Orders. Check admin → **Email outbox** says **Delivered** for both emails, they arrived, and
   their headers show `spf=pass`, `dkim=pass` and `dmarc=pass`.

While a Resend account is in **testing mode** (no verified domain), Resend only delivers to your
own address and answers other recipients with an error; the outbox shows that reason.

## 4. DMARC (all providers)

DMARC tells mailbox providers what to do with mail that claims to be from your domain but fails
SPF and DKIM. Add it after SPF and DKIM pass (they do once the domain is verified in Resend).

1. **Start with monitoring only.** Add a `TXT` record:

   | Name | Type | Value |
   | :--- | :--- | :--- |
   | `_dmarc.yourshop.com` | TXT | `v=DMARC1; p=none; rua=mailto:dmarc@yourshop.com;` |

   The `rua` address receives daily reports (it must be able to receive mail; it may be on another
   domain). `p=none` changes nothing for delivery while you check.
2. **Check for a few days** that every service sending as your domain passes: the shop, your
   own mailbox (Google Workspace etc.), any newsletter tool. Look for `dmarc=pass` in message
   headers and read the reports (Resend's DMARC analyzer or Google Postmaster Tools help).
3. **Tighten** to `p=quarantine;` once everything passes, and later to `p=reject;`, keeping `rua`.

## 5. How delivery and retries work

1. Every email is saved in `email_outbox` first, so a mail outage never loses an email or an order.
2. During a web request, the first attempt runs **after the response** has gone out: a slow or
   unreachable mail service never delays a checkout, payment confirmation or admin action.
3. A failed attempt is retried after **1, 5, 15 and 60 minutes**, then marked **failed** after
   5 attempts. An email the provider refuses as invalid (Resend 400/422) is marked failed at once,
   since retrying cannot help.
4. Retries run **automatically**: after a request has answered, the first request each minute
   sends up to 5 due emails (across all servers). On a quiet shop, schedule the worker so retries
   stay punctual:
   ```cron
   * * * * *  php /var/www/shopco/backend/scripts/process_outbox.php --limit=500 --max-seconds=50 --rate=8 >> /var/log/shopco-jobs.log 2>&1
   ```
   (cPanel: "Cron Jobs"; Windows: see `backend/README.md`.)
5. **No duplicates:** each email has a unique dedup key, so it is queued once; it is claimed
   before every attempt, so the worker, the automatic retries and other servers never send it
   twice; and with Resend the idempotency key covers a retry after a lost answer.

## 6. Monitoring

| Where | What to look at |
| :--- | :--- |
| Admin → **System status** | "Email delivery" (Resend / SMTP / Log only), "Emails waiting to send", "Emails that failed", and a warning when the oldest due email has waited over 15 minutes. |
| Admin → **Email outbox** | Every email with its status (**Waiting**, **Retrying**, **Failed**, **Delivered** or **Logged only**) and the last error. Filter by status. **Send now** / **Retry** on a row; **Send queued now** for everything due. |
| Server: `/var/log/shopco-jobs.log` (if you used the cron line above) | One line per worker run: `mode=resend processed=… sent=… retrying=… failed=…`. |
| PHP error log | One line per failed attempt, starting `[MailService Resend]` or `[MailService SMTP]`, with the reason. |
| Resend dashboard → **Emails** | Whether each email was delivered, bounced or marked as spam by the recipient. |

What the shop can and cannot tell: **Delivered** in the outbox means Resend (or your SMTP server)
**accepted** the email. Whether it then reached the inbox, bounced or was marked as spam is visible
in the Resend dashboard; the shop does not receive those events.

A healthy shop shows **0 failed**, a small or zero "waiting" count, and no 15-minute warning.

## 7. When emails fail

The last error in the Email outbox says why. After fixing the cause, use **Retry** on failed rows
(or **Send queued now**); waiting rows retry on their own.

| Error contains | Meaning | What to do |
| :--- | :--- | :--- |
| `HTTP 401` | The Resend API key is wrong, deleted or inactive | Create a new key in Resend, update `RESEND_API_KEY`, then Retry |
| `HTTP 403` | Domain not verified, account in testing mode, or the key is suspended/restricted | Finish domain verification (section 3), check the key in Resend |
| `HTTP 422` / `HTTP 400` | The email itself was refused (e.g. missing or invalid field) | Check the recipient address; if it repeats for every email, report it as a bug |
| `HTTP 429` | Sending rate, daily or monthly quota reached | Usually passes on its own (it retries); for quotas, upgrade the Resend plan |
| `HTTP 409` | Resend was still handling the same email | Nothing: it retries and is not sent twice |
| `HTTP 500` / `503` | Resend had a problem | Nothing: it retries; check Resend's status page if it persists |
| `Could not reach Resend` | Network or DNS problem from the server | Check the server's internet access and DNS |
| `Could not connect to the mail server`, SMTP replies | SMTP host, port, encryption or login is wrong, or the server is down | Check the `MAIL_*` settings with your provider |

Sign-in links and clean-up codes are never stored, so they cannot be retried: the customer requests
a new sign-in link, and the admin starts the clean-up again for a new code.

## 8. Go-live checklist

- [ ] Sending domain (subdomain) added in Resend and **Verified**
- [ ] DMARC record added (`p=none` to start)
- [ ] `MAIL_MAILER=resend`, `RESEND_API_KEY`, `MAIL_FROM_ADDRESS` set in `backend/.env` on the server only
- [ ] System status shows "Email delivery: Resend"
- [ ] Test email to yourself delivered, headers show `spf=pass dkim=pass dmarc=pass`
- [ ] `process_outbox.php` scheduled every minute (cron)
- [ ] After a few days of clean DMARC reports, policy raised to `p=quarantine`
