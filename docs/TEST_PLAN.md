# Test Plan & Latest Results

**Last run:** 20 October 2026, branch `main`, on Windows / XAMPP (PHP 8.2, MariaDB 10.4, Node 24, Next.js 16.4 with React 19.3).

This replaces the earlier "Step 16" report. That report's 47 passing checks depended on a
development admin token and on sign-in tokens being returned by the API, both of which were
security holes and have been removed; those legacy scripts were deleted with them.

## How to run

```bash
npm run typecheck          # TypeScript
npm run lint               # ESLint
npm run build              # production build
npm run test:api           # php backend/tests/run.php
```

`backend/tests/run.php` creates a throw-away `shopco_test` database (all migrations + demo seed),
starts the API on port 8099 against it, runs every suite, then drops the database. It never touches
`backend/.env`'s database. See [backend/README.md](../backend/README.md#6-verification--testing-commands).

## Latest results

| Check | Result |
| :--- | :--- |
| `npm run typecheck` (`next typegen && tsc --noEmit`) | 0 errors; also 0 with `--noUnusedLocals --noUnusedParameters` |
| `npm run lint` (ESLint 9: core web vitals, React Compiler and TypeScript rules; `any` and unused code are errors) | 0 problems |
| `next build` (Turbopack) | compiled with no warnings; 39 routes |
| API test suites (`run.php`) | **423 passed, 0 failed** |
| Browser: real WhatsApp checkout on the production build against `shopco_test` (guest, signed in, two tabs, store cancels) | all pass |
| Browser: card-payment return, behaviour checks of the reworked screens, admin search box / sign-in gate / setup / banners | all pass |
| Browser: every store and admin page at 1440 px and 390 px, production build and `next dev` | no errors or warnings |
| Image optimiser: store images, `/uploads/*` through the proxy, Unsplash | 200, served as AVIF |

| Suite | Checks | What it proves |
| :--- | ---: | :--- |
| SecurityTest | 70 | No dev admin header; customer-only magic links that work once and are never returned; admin email gets no link; suspended users blocked; scoped HTTP-only cookies; sessions stored hashed; CSRF on mutations (admin and customer tokens not interchangeable); guest order lookup only with token or full email (no phone-suffix or tracking-number-only access, uniform 404); rate limits; SVG / disguised PHP uploads refused; CORS does not trust arbitrary origins. |
| StorefrontFlowTest | 87 | Facets and filters; cart price/stock check; delivery quotes by state (FCT resolves, misspelt states refused); exact variant required; idempotent guest orders with stock reserved once; payment windows (24 h for manual transfer); guest orders linked after magic-link sign-in; saved cart and wishlist; cancel restores stock; reviews moderated with server-decided "verified purchase"; ratings only from approved reviews; real homepage stats; expired flash deals hidden; newsletter subscribe/unsubscribe. |
| PaymentIntegrityTest | 72 | Nested transactions and after-commit hooks; price overrides; idempotency; promo counted once (unlimited codes work); expiry releases stock and promo exactly once; Kora signatures over raw bytes, bad signatures rejected and recorded, duplicates ignored, paid orders never moved backwards, duplicate/under/over/late payments flagged; Monnify signature mandatory, partial payments not marked paid; manual confirmation; refunds partial/full; admin routes, inventory logs, variant upserts and stale-stock protection. |
| AdminApiTest | 95 | Every admin screen's endpoint; pagination; categories, zones, promotions, banners, settings validation and audit; full order lifecycle (unpaid → manual payment → ship → deliver), illegal transitions refused, refund caps; order emails recorded; customer suspension and admin password change revoke sessions. |
| ReportingTest | 36 | Analytics totals equal database sums (gross, refunds, owed refunds, daily, per gateway); date ranges; dashboard and report agree; CSV exports and their filters; exports require an admin session; audit names and admin sign-in/out audited; outbox endpoints; sign-in links never stored or re-sent. |
| CatalogScalingTest | 20 | Units sold count only paid orders (and drop again on cancel), so "best selling" lists the top seller first; unchanged lists answer 304; account and admin data are never cached; large responses are gzip-compressed. |
| MaintenanceTest | 10 | The clean-up removes never-paid cancelled orders with their items and closed payment attempts, and used sign-in links older than a day, and never a paid order. |
| DataRetentionTest | — | Keep periods; inactive customers' accounts deleted and orders anonymised (totals, items, payments kept), returning/active/flagged customers untouched; nothing removed without review; records listed page by page; password + emailed code (wrong password/code, expiry, single use, other session refused); a changed list is refused; slow-request log and health checks; admin alert emails. |
| MailOutboxTest | 33 | SMTP protocol against a local fake server (accepted, recipient refused, unreachable); retries with backoff then give up after 5; log mode recorded as such; dedup; unsubscribed newsletter recipients skipped at send time; retry rules; templates escape customer data and use working links. |

## Bugs the new suites found (fixed before this run)

- The dashboard's current period ended at the request second, so a payment verified in that second was missing from the overview (it now ends at midnight tonight like the report).
- Seed files gave fresh installs invented ratings (`seed.php` now recomputes ratings from approved reviews).
- Earlier in the audit: SMTP could never connect (`MAIL_PORT` default type error); "All time" analytics missed refunds older than the first order; WhatsApp links broke for formatted phone numbers.

## Not covered by automated tests

These need a person, a browser or real accounts:

- **Real gateway round trips.** Kora/Monnify sandbox checkout in a browser and real webhook delivery (see [KORA_INTEGRATION.md](KORA_INTEGRATION.md), method 3). The suites sign webhooks locally instead.
- **Real email delivery.** Sending through an SMTP provider. The suites use a fake SMTP server and log mode.
- **In-browser behaviour.** Keyboard-only use of dialogs, menus and forms, screen readers, and the 360 / 768 / 1280 px layouts. The components were built for these, but no browser test runs them.
- **Lighthouse.** Accessibility and performance scores have not been measured.

### Manual end-to-end checklist

1. On an empty database, `/admin` → setup → sign in. Create a product with 2 colours × 3 sizes and check it appears on the storefront.
2. On the product page, size/colour combinations that don't exist are disabled. Add to cart; the cart says delivery is calculated at checkout.
3. Check out as a guest. Choosing a state shows that zone's fee; a state no zone covers is refused with a message.
4. Pay with Kora sandbox. The callback verifies, the cart clears only then, the receipt shows real data, and the "payment received" email appears in the mail log.
5. Start a Monnify payment and abandon it. Retry on the same order, then let it expire: `expire_pending_orders.php` releases stock once.
6. In the admin, ship with a real tracking number; track-order shows it and the shipped email is sent. Record a partial refund; the order, analytics and refund email agree.
7. Edit the product: existing orders still show their variants and the inventory log is intact.
8. Sign in with a magic link (link in the mail log); earlier guest orders appear under My orders.
