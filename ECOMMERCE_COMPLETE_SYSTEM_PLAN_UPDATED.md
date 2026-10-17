# E-commerce System Blueprint — Frontend, Backend, Admin, Database and Payments

## 1. Purpose and confirmed decisions

Build the existing e-commerce project into a fully testable end-to-end application. It is a development/demo system, but every implemented flow should actually work against the database and Kora sandbox rather than pretending to work with hard-coded success states.

Confirmed:
- Product types: physical ONLY. (There are no digital products or digital downloads in this system; the entire catalog, checkout, and inventory are physical-only).
- Payments: cards and bank transfers.
- Customer access: checkout can be started without a pre-existing password account, but every purchase is attached to a lightweight customer account/profile so purchase history, details, cart and wishlist can persist. Secure email verification or passwordless sign-in is required before exposing saved account data.
- Fulfilment: admin-managed physical delivery, destination zones, carrier assignment, and tracking.
- First gateway: Kora / Korapay sandbox.
- Frontend: existing Next.js 14 App Router, React, TypeScript and Tailwind CSS.
- Backend: PHP 8+ REST API using MySQLi.
- Database: MySQL, locally managed through XAMPP/phpMyAdmin.
- Coding workflow: one Antigravity prompt at a time; inspect, run checks and test before continuing.
- Delivery fees: location-based, calculated and validated by PHP from configured delivery destination zones/rules.
- Redis: explicitly deferred until the core system is functional and a measured need is identified.
- Admin access: one securely authenticated admin account for the demo; no multi-staff/role-management UI in the initial scope. First-run onboarding captures admin identity and store details, including the store origin address used to configure delivery zones. Server-side admin authorization and audit logs still apply.
- Admin onboarding/authentication: provide a protected first-run setup flow to create the single admin account and capture the store profile/address; after setup, disable public admin registration/setup. Never seed a known default password.
- Preserve existing UI and project structure where practical; do not rebuild the site from scratch.

## 2. Project audit notes

The current project has a Next.js storefront, category/product pages, cart, reusable components, wishlist context, admin routes/components, and mock data in `data/mockData.ts` and `data/adminData.ts`. An existing `PRODUCTION_BLUEPRINT.md` references Stripe and a more complex architecture. Do not blindly follow that document: use Kora and the PHP/MySQLi architecture below, and update or supersede conflicting guidance.

The first implementation task is to verify current code, package scripts, pages and existing behaviour. Do not assume a component is functional just because it renders.

## 3. Architecture

```text
Customer browser                         Admin browser
      |                                        |
      +-------------- HTTPS -------------------+
                         |
               Existing Next.js frontend
       storefront / cart / checkout / account / admin
                         |
                 JSON REST API requests
                         |
                 PHP 8+ backend (MySQLi)
  authentication / permissions / catalogue / pricing / orders
   inventory / payment verification / fulfilment / analytics
                         |
                    MySQL database
                         |
                 Kora hosted checkout
       initialize / redirect / verify / webhook callback
```

- The browser must never connect directly to MySQL.
- All price calculations, stock checks, permissions, order status transitions and payment verification happen server-side.
- Next.js can remain the frontend. PHP is the backend API. Do not add a second Node backend.
- The frontend and admin use the same API and database; the admin is not a separate store.
- Start with a simple PHP API and MySQL. Redis, queues, WebSockets and microservices are not prerequisites for the local demo. They are considered in Section 17 and should be added only if a real need exists.
- Development can use HTTP on localhost; production must use HTTPS.

## 4. Suggested repository layout

Adapt to the current repository after auditing; do not force a wholesale restructure.

```text
project/
  app/                         # existing Next.js App Router pages
  components/                  # existing reusable UI
  context/                     # existing cart/wishlist state
  data/                        # fixtures only, not production source of truth
  lib/
    api-client.ts              # typed frontend API client
    auth.ts                    # client-safe auth helpers only
    validation.ts              # client-side convenience validation
  public/
  backend/
    public/
      index.php                # API entry point / router
    src/
      Config/
      Database/
      Middleware/
      Controllers/
      Services/
      Repositories/
      Validators/
      Payments/Kora/
      Support/
    routes/
    migrations/
    seeds/
    storage/private-downloads/ # outside public web root in real deployment
    tests/
    .env.example
    README.md
  docs/
    PROJECT_AUDIT.md
    API_CONTRACT.md
    TEST_PLAN.md
```

A small router or a lightweight existing PHP routing library is acceptable, but do not introduce a large framework without explaining the benefit. Keep business logic out of route files.

## 5. Local XAMPP and MySQLi setup

1. Install/start XAMPP and start **Apache** and **MySQL** from the XAMPP Control Panel.
2. Open phpMyAdmin, normally `http://localhost/phpmyadmin`.
3. Create a database such as `shopco_dev` using `utf8mb4_unicode_ci` (or a compatible `utf8mb4` collation).
4. Create a dedicated local database user and password where possible. XAMPP's default root account may have no password; that is acceptable only for an isolated local setup, never production.
5. Put the PHP backend in a directory Apache can serve, or configure a VirtualHost/document root so only `backend/public` is web-accessible. Do not expose `.env`, SQL dumps, private downloads or source configuration through Apache.
6. Configure the PHP API to connect with MySQLi using host, port, database name, username and password from a server-side environment file.
7. Enable/verify required PHP extensions such as `mysqli`, `curl`, `mbstring`, `openssl`, `fileinfo` and `json`. Check PHP version from XAMPP and command line; CLI PHP may differ from Apache PHP.
8. Import the versioned schema/migrations and then run a separate seed script with fake products and a development-only admin.
9. Start Next.js with the existing package manager and configure a public API base URL such as `NEXT_PUBLIC_API_BASE_URL=http://localhost/shop-api/api/v1` only if that matches the chosen local Apache routing. This variable is public and must contain no secrets.
10. Test `GET /api/v1/health`, then test a database-backed endpoint, then test admin login and product CRUD.
11. Configure CORS for the exact frontend origin used locally, such as `http://localhost:3000`; do not use wildcard CORS with credentialed cookies.
12. Document the exact local URL, ports, setup steps and common errors in `backend/README.md`.

Do not assume the API URL: choose it after inspecting the local folder and Apache configuration. Prefer a VirtualHost such as `http://shop-api.local/api/v1` if the developer is comfortable configuring hosts, otherwise use an explicit Apache alias/rewrite.

## 6. Database design

Use InnoDB, `utf8mb4`, foreign keys, indexes and migrations. Use MySQLi prepared statements. Store money as integer minor units where supported by the provider/currency, or as fixed-precision decimal with carefully controlled arithmetic; never use floating-point arithmetic for monetary totals. Store currency on each order/payment.

### Identity and access
- `users`: name, email, password hash nullable for passwordless-only users, role, account status, timestamps.
- `sessions` if implementing database-backed sessions; otherwise document PHP session storage.
- `addresses`: customer-owned delivery addresses.
- `email_verification_tokens` and/or short-lived one-time sign-in tokens; password reset tokens if passwords are supported.
- `store_settings` or equivalent settings records for store name/contact details, store origin address, timezone and currency. Keep store address separate from an admin personal address unless the owner explicitly uses the same address.

### Customer account model
A shopper may begin checkout as a guest without creating a password first, but the purchase must be associated with a lightweight customer profile identified by a verified email. After checkout, offer a secure email verification/magic-link flow to view prior orders and manage saved details. Persist cart and wishlist for that profile once identity is verified/signed in; merge any local guest cart/wishlist carefully and avoid overwriting server state blindly. Do not expose order history using email address alone. Public order lookup must require a high-entropy expiring token or verified sign-in. Support a later password-creation option if appropriate; do not require the customer to create a password just to buy.

Roles for first release: `customer`, `admin`, optionally `super_admin`. Public registration must never allow a caller to assign an admin role.

### Catalogue and stock
- `categories`
- `products`: slug, title, description, product type (`physical` only), status (`draft`/`published`/`archived`), SKU, price, currency, stock policy, featured flag, SEO fields if needed.
- `product_images`
- `product_variants`: SKU, size/colour/options, price override if supported, stock quantity.
- Optional `inventory_movements` for stock adjustment history.

### Shopping and orders
- `carts`, `cart_items` if persistent server-side carts are required; guest browser carts may remain local until checkout, but backend revalidates all items.
- `wishlists`, optional.
- `orders`: public order number, internal ID, customer ID nullable for guest, guest email, secure guest access token hash, billing/shipping snapshots, currency, subtotal, shipping, discount, tax if configured, grand total, order status, timestamps.
- `order_items`: product/variant references plus immutable name/SKU/variant/price/quantity/type snapshots.
- `order_status_history`.
- `shipments`: carrier, tracking number/URL, shipment status, shipped/delivered dates.

### Payments and money movement
- `payments`: order ID, provider, provider reference unique, amount, currency, method, payment status, raw provider payload only if necessary and safely redacted, verified timestamp.
- `payment_webhook_events`: provider event/deduplication key unique, received timestamp, signature/verification result, processing result, safe payload metadata.
- `refunds`: provider refund reference, amount, status, reason and timestamps.
- `admin_audit_logs`: admin ID, action, entity type/ID, before/after summary, timestamp and request metadata.
- `notifications` or `email_outbox` if adding retryable email delivery.

### Store configuration and delivery
- Store profile/settings must include the store origin address entered during admin onboarding. The origin is the basis for planning delivery coverage, but it does not automatically determine fees. Admin configures destination zones (for example, state/city/area combinations) and a fee for each zone; PHP resolves the customer address against these configured rules. If a destination matches no active zone, block checkout or request a manual quote; never default to free delivery. Save the selected zone, fee and full delivery-address snapshot on the order.
- Provide a simple admin UI to add/edit/disable zones and fees. Avoid maps/geocoding/distance calculations in the first demo unless specifically required.

### Store content and analytics
- `banners`
- `promotions` / `coupons`
- `reviews` if reviews are supported
- `settings`
- Analytics can initially be computed from orders, payments and order items; add daily aggregate tables only if needed.

Add indexes for email, product slug/SKU, published status/category, order number, customer/order dates, provider reference, payment status and webhook deduplication key. Apply unique constraints where appropriate. Avoid storing card PAN/CVV.

## 7. Core business rules

1. MySQL is the source of truth.
2. The frontend submits IDs and quantities, not trusted prices or totals.
3. Backend recalculates current prices, discounts, shipping and total at checkout.
4. Order item snapshots preserve historical purchase details.
5. Order status and payment status are separate.
6. Payment confirmation comes from verified server-side provider status/webhook, never just the browser redirect.
7. Payment handling must be idempotent. Duplicate events cannot double-confirm orders, send duplicate notifications or decrement stock twice.
8. Inventory updates use transactions and row locking/conditional updates to prevent overselling.
9. Choose one inventory policy and document it. Suggested simple demo policy: reserve/decrement stock in a transaction when creating a pending order, then restore it once on confirmed failure/cancellation/expiry. If using a temporary reservation, implement expiry and release logic consistently.
10. Calculate location-based shipping fees in PHP from active configured delivery zones; persist the selected zone and fee on the order. Reject unmatched locations or require an explicit manual quote.
11. Guest order access uses a high-entropy token or email verification; sequential order IDs alone are not authorization.
12. Customers can only access their own accounts, orders and saved addresses.
13. Admin permissions are checked in PHP on every protected endpoint.
14. Every important admin action is auditable.
15. Do not store raw card details.
16. All errors returned to clients must be useful but must not reveal SQL, secrets, stack traces or private customer data.

## 8. Frontend navigation and pages

Preserve current pages/design and add only what is needed.

### Public storefront
- Home: hero, categories/brands if present, flash deals, featured products, new arrivals, best sellers, reviews and editorial sections.
- Product listing/category: pagination, sorting, search, category filters, price filter if supported, availability and variants.
- Product detail: images, description, price, variant selection, stock/availability, quantity, add-to-cart, wishlist.
- Search results.
- Cart: quantity edits, remove item, availability warning, subtotal and checkout action.
- Checkout: guest/account choice, email, delivery destination address (all orders are physical), shipping zone choice/fee, order summary and payment method.
- Payment return/status page: checking/pending/success/failure based on backend verification.
- Order confirmation/details page.
- Login, registration, logout, password reset if implemented.
- Customer account: profile, saved addresses, order history/detail, shipment tracking, wishlist.
- About, contact, FAQ, shipping, returns/refunds, privacy and terms pages as appropriate for the store.

### Customer account navigation
- Overview
- My orders
- Addresses
- Wishlist
- Profile/security
- Sign out

### Admin layout and navigation
Create a protected, responsive admin shell with persistent sidebar, top bar, page title/breadcrumbs, search where useful, date-range filters for analytics, loading/empty/error states, pagination, confirmation dialogs and accessible forms. Every navigation item must route to a real page or be clearly marked as intentionally deferred; no dead links or fake data disguised as live.

Recommended sidebar:
1. **Overview**
   - Dashboard KPIs, sales chart, order trend, recent orders, low-stock alerts, payment alerts and top products.
2. **Orders**
   - All orders, pending payment, paid/new, processing, shipped, delivered/completed, cancelled, refund requests.
   - Order detail: customer/guest details, line items, payment record, address snapshot, internal notes, status timeline, shipment/tracking and allowed actions.
3. **Products**
   - All products, add product, edit product, categories, variants, images, stock/inventory.
4. **Categories**
   - Create/edit/reorder/activate categories.
5. **Inventory**
   - Stock overview, low stock, stock adjustments, inventory movement history.
6. **Customers**
   - Customer list/search, profile, orders, spend summary, status; suspend/reactivate with audit trail.
7. **Payments**
   - Transactions, pending/failed/successful, provider reference, method, amount, currency, verification status, webhook event history.
8. **Refunds**
   - Requests/history, provider refund reference, status and notes. Only execute refunds through documented provider support; otherwise mark as manually handled with proper permissions and audit.
9. **Promotions**
   - Coupons/discounts, date windows, usage limits, product/category applicability and active status.
10. **Storefront**
    - Homepage sections, banners, featured products, flash deals, content blocks and reviews moderation if implemented.
11. **Shipping & fulfilment**
    - Shipping options/rates, destination zones, shipment queue, carrier, tracking code/URL, shipped/delivered actions.
12. **Analytics & reports**
    - Sales, orders, average order value, units sold, top products/categories, customer acquisition/repeat customers, payment success/failure, refunds, low stock, date ranges and CSV export if feasible.
13. **Staff & roles**
    - Admin/staff list and permissions if multi-admin access is required. At minimum protect `admin` and `super_admin`; avoid implementing a complex permission matrix unless needed.
14. **Notifications**
    - Email/event logs and retry status if email delivery is implemented.
15. **Audit logs**
    - Search/filter admin changes, actor, entity, time and action.
16. **Settings**
    - Store details, currency, timezone, destination shipping rules/rates, tax settings if applicable, email configuration status, payment gateway mode (sandbox/live display), security/session settings. Secrets should be configured server-side, not displayed back to the browser.
17. **Help / system status**
    - API/database health for admins without exposing credentials or stack traces.

### Admin KPI definitions
- Gross sales: sum of verified successful payments for non-refunded portions, according to a clearly documented accounting definition.
- Net sales: gross sales minus discounts/refunds, excluding shipping/tax only if that is the chosen definition.
- Orders: count by order status and date created.
- Average order value: eligible sales divided by eligible paid orders.
- Payment success rate: successful payment attempts / completed attempts, excluding pending attempts if documented.
- Refund total: completed refunds only.
- Top products: paid order item quantities or revenue, with a stated basis.
- Low stock: physical variant/product quantity at or below configurable threshold.
- Pending fulfilment: paid physical orders not yet shipped.
- Use database queries, never hard-coded dashboard metrics. Use consistent store timezone and date range.

## 9. Frontend/backend connection contract

Use a typed frontend API client and a documented `API_CONTRACT.md`. Standardize JSON response/error shape, pagination, validation errors and authentication behavior. Set API base URL via environment variable. The public `NEXT_PUBLIC_*` variable may contain only the public API URL, never secrets.

Suggested endpoint families (adapt after audit):
- Public: `GET /api/v1/products`, `GET /products/{slug}`, `GET /categories`, `GET /storefront/homepage`, `GET /promotions`.
- Auth: `POST /auth/register`, `/auth/login`, `/auth/logout`; `GET /me`; profile/address routes.
- Checkout: `POST /checkout/quote`, `POST /checkout/orders`, `POST /checkout/initialize-payment`.
- Customer orders: `GET /me/orders`, `GET /me/orders/{id}`, secure guest order lookup.
- Payments: Kora initialize, verify/reference, webhook.
- Admin: products/categories/inventory/orders/customers/payments/refunds/shipments/promotions/storefront/analytics/settings/audit logs.
- Use pagination and filters for large admin lists. Do not expose all customer data through public endpoints.

## 10. Kora payment architecture

Use Kora-hosted checkout for the first implementation so the app does not handle raw card details. Confirm current official Kora documentation before implementation; do not guess API URLs, required fields, currency constraints, signature algorithm or event names.

Payment flow:
1. Backend validates cart, current prices, stock, delivery and currency.
2. Backend creates pending order, immutable item snapshots and payment record.
3. Backend creates a unique reference and initializes Kora checkout with the server-calculated amount.
4. Frontend redirects to hosted checkout.
5. Kora returns customer to a status page; page calls backend to retrieve verified status.
6. Kora sends webhook to PHP API. Verify authenticity using the documented signature mechanism and/or fetch the transaction status from Kora's API.
7. Compare reference, expected amount, currency and order.
8. Update payment/order within a DB transaction; deduplicate events and handle out-of-order delivery.
9. Send confirmation and permit fulfilment only after verified success.
10. Reconciliation page helps admin identify pending payments; never expose a button that casually forces a payment to successful.

Test sandbox card and bank-transfer flows supported by the merchant account. Test delayed transfer, failed/cancelled payment, browser closed before return, invalid signature, duplicate webhook, wrong amount/reference and network timeout. Sandbox success is not evidence that a live merchant account is ready.

## 11. Order status model

Suggested order states:
- `pending_payment`
- `paid`
- `processing`
- `shipped` (physical)
- `ready_for_pickup` (optional)
- `delivered` (physical)
- `completed`
- `cancelled`
- `refund_pending`
- `partially_refunded` (if partial refunds are supported)
- `refunded`

Payment states:
- `pending`
- `successful`
- `failed`
- `cancelled`
- `refund_pending`
- `partially_refunded`
- `refunded`

Fulfillment states are tracked through shipments and order status. Enforce allowed transitions in backend service logic and record status history.

## 12. Email and notifications

After core checkout is verified, add:
- order created/payment pending;
- verified payment success;
- payment failure/cancellation where useful;
- order shipped with tracking;
- delivery/completion;
- refund status update;
- password reset/account verification if implemented.

Use an email provider suitable for the domain and environment. Log failures and retry safely. Do not send paid confirmation until server verification succeeds. Avoid duplicating notifications when webhook retries occur.

## 13. Security and testing requirements

- Password hashing via PHP `password_hash` / `password_verify`.
- Secure cookies: HTTP-only, SameSite and Secure in production.
- CSRF protection for cookie-authenticated state-changing requests.
- Strict CORS allowlist.
- Prepared statements and input validation.
- Rate limits or basic throttling for login, password reset, checkout and webhook routes where appropriate.
- Role checks on every admin endpoint.
- Safe guest order tokens or email magic links; verified customer profiles own their saved order history, carts and wishlists.
- Do not expose `.env`, SQL dumps, logs, private files or stack traces.
- Secrets are server-side only.
- Webhook signature verification, amount/currency/reference checks and idempotency.
- MySQL transactions for orders, payments and inventory.
- Audit log for sensitive admin actions.
- Production HTTPS, backups, restore test and least-privilege DB credentials.

## 14. Testing definition: functional means functional

A screen is not complete merely because it looks right. Each feature must read/write the database and show real results, or be explicitly documented as a demo-only placeholder.

Acceptance tests:
- Admin-created product appears on storefront after publication.
- Price, variant, image and stock updates appear correctly.
- Guest and registered checkout work.
- Client cannot manipulate totals by editing browser requests.
- Kora sandbox payments can be initiated and verified.
- Closing the browser does not prevent webhook-confirmed payment from updating the order.
- Duplicate webhooks do not double-process.
- Stock cannot go negative; failed/expired orders release stock once.
- Customers cannot access another customer's order.
- Admin-only endpoints reject customers.
- Admin tracking/status changes appear in customer account/order lookup.
- Analytics reconcile with underlying orders/payments.
- Product/order tables have loading, empty, error and pagination states.
- Existing responsive layout and current visual identity remain intact.
- Frontend build, PHP syntax checks and database migration/seed scripts succeed.

## 15. Build sequence

1. Audit existing frontend/backend assumptions and document gaps.
2. Establish PHP API skeleton and health endpoint.
3. Configure XAMPP, MySQLi and database migrations/seeds.
4. Implement catalogue/category API.
5. Connect storefront to live product data.
6. Implement authentication, roles and sessions.
7. Implement checkout validation, order snapshots and stock policy.
8. Integrate Kora sandbox initialization.
9. Verify payments and process webhooks idempotently.
10. Implement customer order history and guest access.
11. Connect admin product, inventory, order and fulfilment pages.
12. Implement physical delivery and carrier tracking.
13. Implement admin analytics/reports and remaining navigation pages.
14. Add email notifications and storefront content management.
15. Run complete end-to-end test plan and document known limitations.

The separate Antigravity prompt file must operationalize these stages with one prompt per stage, explicit file inspection, implementation instructions, tests and a stop point after each step.

## 16. Deployment boundaries

For local testing, use XAMPP and Kora sandbox. Do not expose the local webhook endpoint publicly without a deliberate secure tunnel setup; if a tunnel is used for webhook testing, document its URL, limitations and safe teardown. Do not use live credentials until Kora merchant approval, live account configuration and production HTTPS are ready.

Before launch:
- production database and least-privilege user;
- secure secrets and environment configuration;
- HTTPS;
- backup and restore process;
- private file storage;
- email sender/domain setup;
- error monitoring/log rotation;
- provider settlement and reconciliation process;
- legal store policies and refund/shipping terms.

## 17. Redis and other technologies: what is actually needed?

### Required now
- Next.js / React / TypeScript / Tailwind (existing frontend).
- PHP 8+ REST API.
- MySQL / MySQLi via XAMPP locally.
- Kora sandbox and hosted checkout.
- Git and a repeatable migration/seed process.
- PHP extensions: `mysqli`, `curl`, `mbstring`, `openssl`, `json`, `fileinfo`.
- A typed API client, input validation, backend tests/manual test checklist.

### Useful later, not required for the first functional demo
- **Redis:** caching, rate limiting across multiple API workers, short-lived distributed locks or queues. It is not required for basic cart, checkout or analytics. Do not add it just to appear scalable.
- **Queue worker:** reliable emails, webhook follow-up jobs and retries. Initially a database-backed outbox plus a scheduled/CLI worker may be enough; do not rely on a browser request to send every email.
- **WebSockets/SSE:** real-time admin/customer updates. Initial version can re-fetch after actions or poll order status.
- **Object storage:** recommended for production product images; local uploads can be used for testing if validated and stored safely.
- **CDN/image service:** performance at scale.
- **Error monitoring:** useful before production.
- **Automated test framework:** use a suitable PHP test runner and the project's existing frontend test setup if present.
- **Search engine:** only when catalogue size/search requirements exceed database search.

Add each technology only when there is a clear requirement and the project can be run and tested locally with it.

## 18. Confirmed architecture decisions and remaining questions

### Confirmed decisions

- **Product scope:** Physical products ONLY. There are no digital products or digital downloads. All orders require physical delivery, destination shipping address, and inventory deduction.
- **Location-based delivery fees:** delivery cost is based on the customer's selected delivery location and server-managed shipping zones/rules. PHP must calculate the fee and total; the browser cannot submit a trusted fee. A location that does not match a configured service zone must be marked unavailable or require an explicit admin/manual quote. It must never silently receive a zero fee. Keep the fee and delivery-address snapshot on the order so later rule changes do not rewrite old orders.
- **Redis:** defer it. Use MySQL transactions, indexes, unique constraints, idempotency records, and a database-backed outbox where needed. Do not use Redis as a substitute for correct database consistency. Reconsider Redis only after the core flow works and a specific performance, rate-limiting, queue, or cross-worker locking need is demonstrated.
- **Admin accounts:** one admin account for the demo. Keep server-side authentication/authorization, password hashing, secure session handling, and audit logging. Do not build staff invitations or a multi-role management interface in the first scope. Do not hard-code a default password or expose admin credentials in seeds or docs.

### Still to decide before the relevant implementation stage

- Store display currency and currency supported by the configured Kora merchant account.
- Shipping-zone data and fee table: which country/state/city/area fields are collected, which areas are served, and the fee for each zone. Start with a small editable table of demo zones; do not invent delivery prices. Confirm what happens for out-of-zone addresses (recommended: block checkout with a clear message until a valid zone is selected).
- Customer access model is decided: guest-first checkout creates/links a lightweight customer profile; verified email/passwordless link unlocks purchase history, saved details, cart and wishlist. No email-only access to account data.
- Product variant requirements and stock policy.
- Tax/VAT handling and whether displayed prices include tax.
- Email provider and sender domain.
- Whether coupon codes, product reviews and CSV exports are required for the first demo.
- Deployment target and how Kora webhooks will reach it.

## 19. Working agreement for Antigravity

Implement one prompt at a time. After every stage, report:
1. files created/changed;
2. features now functional;
3. commands and tests run with results;
4. manual tests still required;
5. security/data integrity concerns;
6. known limitations and any decision needed;
7. exact next prompt to run.

Do not automatically continue to the next stage. Do not claim success without test evidence. If the existing project differs from this plan, describe the mismatch and propose the smallest safe adjustment before proceeding.
