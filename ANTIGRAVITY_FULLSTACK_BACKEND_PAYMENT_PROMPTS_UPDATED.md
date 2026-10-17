# Antigravity CLI — Full E-commerce Implementation Prompts

## Instructions

Use this document with the existing e-commerce project folder. Run **one prompt at a time**. After each step, inspect changes, run checks and manually test before proceeding. The goal is a functional development/demo store with real database operations and Kora sandbox payments, not a static prototype.

Global requirements:
- Preserve the existing Next.js 14 App Router UI and components where practical.
- Frontend: Next.js, React, TypeScript, Tailwind.
- Backend: PHP 8+ REST API with MySQLi; local database via XAMPP/phpMyAdmin.
- Payment provider: Kora/Korapay sandbox first. Read current official docs before coding provider-specific fields/signatures.
- Do not introduce Stripe, Laravel, a second Node backend, Redis or microservices without explicit approval. Redis is explicitly deferred until the core system works.
- Delivery fees are location-based and calculated server-side from configurable delivery zones. Do not invent zone prices; unmatched addresses must not default to free delivery.
- Product scope: Physical products ONLY. There are NO digital products or digital downloads. All products require physical fulfillment, inventory tracking, SKU, and destination delivery zone calculation.
- Demo admin scope is one securely authenticated admin account; do not build multi-staff role management, but retain backend authorization and audit logging.
- Include a protected first-run admin/store onboarding flow that captures admin details and the store origin address, then disable public setup after completion.
- Guest-first shoppers still get a lightweight customer profile tied to a verified email so purchases, order details, saved cart and wishlist can persist. Use secure email verification/magic-link access; never expose history based on email alone.
- Store origin address is captured in onboarding. Admin then configures destination delivery zones and fees based on the store's delivery coverage; do not invent rates or assume the origin address alone determines the fee.
- Delivery & Fulfillment: All orders contain physical items only and require destination address validation, delivery fee calculation from destination zones, and physical shipping status tracking. Digital downloads and digital files are strictly excluded from the store.
- Never put secrets in frontend code or `NEXT_PUBLIC_*` variables.
- Never trust browser prices, totals, role, stock or payment status.
- Use prepared statements, server-side validation, secure authentication, role checks, transaction-safe inventory and idempotent payment handling.
- No fake “success” states or dashboard figures. If a page is not implemented, mark it clearly rather than pretending it works.
- Inspect before editing. Avoid unnecessary rewrites. Run checks and stop after each prompt.

---

## STEP 1 — Audit the existing project

Inspect the repository, including `package.json`, app routes, product/category pages, product detail, cart, contexts, mock data, admin pages/components and `PRODUCTION_BLUEPRINT.md`.

Create `docs/PROJECT_AUDIT.md` documenting:
- routes and reusable components;
- real versus mocked behaviour;
- current cart/wishlist data shape and persistence;
- existing admin navigation and dead links;
- current styling conventions;
- package scripts and build status;
- missing backend/database/auth/payment integrations;
- recommended smallest-change implementation sequence.

The existing blueprint references Stripe and a more complex stack. Note the conflict; this project uses PHP/MySQLi and Kora. Do not change product UI yet. Run the current build/type check if possible and report actual results.

## STEP 2 — Create backend skeleton and API contract

Create a maintainable `backend/` PHP 8+ REST API structure with a single public document root, routing, controllers, services, repositories, validators, middleware, migrations, seeds and tests as appropriate. Add:
- JSON response/error helpers;
- environment-based configuration;
- MySQLi connection using `utf8mb4`;
- prepared statement examples;
- method/content-type validation;
- strict configurable CORS allowlist;
- `/api/v1/health` endpoint;
- `.env.example` with placeholders only;
- `backend/README.md`;
- `docs/API_CONTRACT.md`.

Do not add authentication or Kora calls yet. Health endpoint must return valid JSON. Errors must not leak credentials, SQL or stack traces. Run PHP syntax checks and document commands.

## STEP 3 — XAMPP setup, migrations and seed data

Document and validate the local XAMPP workflow:
1. Start Apache and MySQL in XAMPP.
2. Create `shopco_dev` in phpMyAdmin with `utf8mb4`.
3. Configure backend DB environment values.
4. Ensure Apache only exposes `backend/public`; private source, `.env`, and SQL dumps must not be public.
5. Verify Apache PHP and CLI PHP versions/extensions, including `mysqli`, `curl`, `mbstring`, `openssl`, `json` and `fileinfo`.
6. Configure a dedicated local DB user where practical; never use an unsecured root account in production.
7. Document the exact local API URL based on actual Apache configuration.
8. Configure Next.js API base URL with a public URL only, no secrets.

Create versioned schema/migration and rollback notes for:
`users`, `sessions` or documented session storage, `email_verification_tokens`/magic-link tokens, `addresses`, `store_settings`, `shipping_zones`/rates, `carts`, `cart_items`, `wishlists`/items, `categories`, `products`, `product_images`, `product_variants`, `orders`, `order_items`, `order_status_history`, `payments`, `payment_webhook_events`, `shipments`, `refunds`, `promotions`, `banners`, `settings`, `admin_audit_logs`, and optional persistent carts/wishlists/email outbox where justified.

Use InnoDB, foreign keys, indexes, unique payment references and webhook deduplication keys. All products are physical products only with inventory and SKU tracking. Orders must snapshot guest email, address, selected shipping zone/rule and calculated shipping fee, plus item names/variant/price/quantity. Add a simple configurable shipping-zone/rate schema. Seed only clearly fake development products. Implement a one-time first-run admin setup that creates the single admin account from user-entered details and captures store name/contact details plus the store origin address; setup must close once an admin exists. Do not ship a hard-coded/default production password. Store origin address is used to inform delivery-zone configuration, while destination zone fees are explicitly configured by the admin. Do not add Redis. Test migration and setup on a clean database.

## STEP 4 — Build public catalogue API

Implement database-backed endpoints for:
- published product listing with pagination, search, category and sort filters;
- product detail by slug/ID;
- categories;
- homepage sections/featured products/promotions;
- public availability fields without exposing private data.

Implement admin product/category CRUD behind authorization middleware (auth is completed in a later step; use a clearly temporary development guard only if required and remove it before completion). Validate input and use prepared statements. Add documented response examples and API tests. Do not connect the frontend until the API contract is stable.

## STEP 5 — Connect the storefront to the API

Replace mock data progressively, preserving current components and design:
- homepage sections;
- product listing/category pages;
- search/filter/sort/pagination;
- product detail and variant selection;
- product images, prices and availability.

Create typed API client helpers with loading, empty, error and retry states. Keep mock fixtures for tests only or a clearly documented development fallback. Do not silently fall back to fake prices when the API fails. Test routes, responsive layout, missing products and unavailable items. Run the frontend build.

## STEP 6 — Admin onboarding, authentication and customer account

First implement a one-time protected setup flow for the single admin. Capture admin name/email and securely establish credentials, plus store name/contact details and the store origin address. Check on the server whether setup has already completed; once an admin exists, permanently disable public setup endpoints unless a deliberate local-only reset procedure is used. The store origin address is not a delivery fee by itself: provide admin settings to configure destination zones and fees after onboarding.

Implement PHP endpoints for customer registration or passwordless account creation, email verification/magic-link sign-in, login, logout, current user, profile and address management. Use `password_hash`/`password_verify`, secure HTTP-only SameSite cookies or another clearly documented session strategy, session ID rotation after login, CSRF protection for cookie-authenticated mutations, and strict CORS credentials configuration.

Roles: customer, admin, optional super_admin. Public registration cannot set roles. Enforce authorization server-side for every admin endpoint. Customers can only read/update their own account, addresses, orders and downloads. Add login throttling/basic rate limiting and safe error responses. Connect existing frontend auth/account UI with the real API. A shopper may check out without setting a password first, but link the order to a lightweight customer profile using the email address. Offer secure email verification/magic-link access to order history, saved profile/address details, persistent cart and wishlist. Merge local cart/wishlist into account state carefully. Never allow order history access by email alone. Test unauthenticated, unverified customer, verified customer and admin access. Do not store session tokens or passwords in localStorage.

## STEP 7 — Implement product administration and inventory

Connect the existing admin product screens to the API. Implement:
- product list, pagination, search and filters;
- create/edit product;
- publish/unpublish/archive;
- categories;
- multiple images;
- variants such as size/colour if supported by existing UI;
- physical products only (all catalog items are physical);
- price, SKU, stock and low-stock threshold;
- inventory adjustments with reason and audit record.

Validate every field server-side. Product changes must be reflected on the storefront after re-fetch. Checkout must always revalidate current price and stock. Add loading, empty, error, confirmation and success states. Test all CRUD operations against MySQL.

## STEP 8 — Define checkout and order creation 

Implement a server-side checkout quote/order-creation service. Frontend sends only item IDs/variant IDs and quantities, plus email, delivery address/location fields, selected shipping zone identifier (if applicable) and coupon code if enabled. The PHP backend must resolve the location against active shipping rules and calculate the fee; never trust a fee supplied by the browser. If the location is unserved or ambiguous, return a clear validation error and do not silently apply free shipping. The store origin address comes from admin onboarding; destination zones and fee values must be explicitly configured by the admin, with no invented rates.

Backend must:
- confirm products are published and purchasable;
- validate quantities and variants;
- load current prices from MySQL;
- calculate subtotal, discount, location-based shipping and total using safe money arithmetic;
- expose eligible delivery zones/rates from the backend and revalidate the chosen zone at order creation; persist the zone/rule snapshot and fee on the order;
- validate guest email or authenticated customer;
- require delivery address for all orders (all products are physical);
- create pending order, item snapshots and pending payment in a database transaction;
- use unique public order numbers and high-entropy guest access tokens (store token hashes when practical);
- apply one documented inventory reservation/decrement policy;
- prevent negative stock and concurrent overselling.

Create a test matrix for empty cart, invalid quantities, changed prices, out-of-stock item, physical checkout with valid zone, out-of-zone address, guest and signed-in checkout. Do not call Kora yet.

## STEP 9 — Kora sandbox initialization 

Read the current official Kora documentation and identify the supported checkout initialization, reference, currency, return URL, verification and webhook requirements. Document the confirmed fields and source URLs in `docs/KORA_INTEGRATION.md`. Do not invent API details.

Implement an isolated PHP Kora service:
- read credentials only from backend environment variables;
- generate/store unique provider reference;
- initialize checkout using backend-calculated order amount and supported currency;
- use hosted checkout where supported;
- save provider response safely, redacting sensitive fields;
- handle timeouts/provider errors while retaining a recoverable pending order;
- return only the checkout URL and safe public data to frontend.

Configure sandbox keys in local backend environment only. Add mock/unit tests for provider success, failure, timeout and malformed response. Do not use live keys or mark orders paid on initialization.

## STEP 10 — Kora verification, webhook and idempotency

Implement the documented Kora webhook endpoint and server-side transaction verification. Confirm exact signature verification/event handling from current Kora docs. Validate reference, amount, currency, expected order and provider status. Store webhook events with a deduplication key and safe processing result.

Within a database transaction:
- lock or conditionally update payment/order;
- ensure the same event/reference cannot be processed twice;
- prevent duplicate stock deduction, emails or digital access grants;
- tolerate retries and out-of-order events;
- keep failed/pending payments from being marked successful.

The browser return page must query the backend for status. The return query string alone is never proof of payment. Test invalid signature, duplicate webhook, wrong amount/currency/reference, delayed bank transfer, browser closed before return, repeated verify request and network timeout. Provide a safe local webhook testing procedure; do not expose XAMPP publicly without a deliberate secure tunnel and teardown instructions.

## STEP 11 — Checkout UI, payment return and customer orders

Connect checkout UI to quote/order/payment endpoints. Support:
- guest checkout and logged-in checkout;
- email and physical delivery address;
- mixed carts;
- authoritative backend totals;
- card/bank transfer options available through the configured Kora checkout;
- disabled submit/loading states and duplicate-click protection;
- clear pending/success/failure states;
- retry payment where the order remains eligible;
- order confirmation only after verified status.

Implement customer order history/detail and secure guest lookup. Show item snapshots, payment status, order status, address snapshot and tracking. Never reveal an order based only on sequential order ID. Test cross-customer access and expired/invalid guest tokens.

## STEP 12 — Physical delivery and order fulfilment -

Physical Fulfillment:
- calculate delivery fees from configured location zones during checkout; persist the applied zone and fee on the order;
- provide an admin-editable set of delivery destination zones/rates for the demo; do not invent rates or default unmatched locations to free shipping;
- admin can set carrier, tracking code/URL, shipped date and delivered status;
- enforce allowed status transitions (pending -> paid -> processing -> shipped -> delivered);
- store status history and admin audit log;
- customer order page reflects tracking updates.

Test failed payment, shipping fee calculation by location, physical shipment updates, carrier tracking assignment, and delivery confirmation.

## STEP 13 — Build the complete admin navigation and real pages

Inspect existing admin UI and preserve its design language. Implement a responsive protected admin shell with working sidebar links, breadcrumbs, page titles, table pagination, search/filter, date filters, loading/empty/error states and confirmation dialogs. No dead links, fake analytics or static data presented as live.

Required navigation and pages:
1. **Overview**: real KPIs, sales/orders trend, recent orders, low-stock alerts, pending fulfilment, payment alerts, top products.
2. **Orders**: all, pending payment, paid/new, processing, shipped, delivered/completed, cancelled and refund states; order detail, status history, payment info, customer/guest details, items, address snapshot, notes and tracking.
3. **Products**: list, add, edit, publish/unpublish, images, variants, physical product attributes, price, SKU, stock and inventory thresholds.
4. **Categories**: CRUD and ordering/activation.
5. **Inventory**: stock overview, low-stock list, stock adjustment with reason and movement history.
6. **Customers**: search/list/detail, contact info, order history, spend summary, status and suspend/reactivate with audit.
7. **Payments**: transaction list/filter, Kora reference (and other payment oprions), amount, currency, method, provider status, internal verified status, timestamps and webhook events.
8. **Refunds**: request/history, amount, reason, provider reference and status. Only execute through supported documented provider flow; otherwise clearly record a manual refund and audit it.
9. **Promotions**: coupons/discounts, schedule, usage limits, applicability and activation if in scope.
10. **Storefront**: homepage banners, featured products, flash deals, content sections and review moderation if reviews exist.
11. **Shipping & fulfilment**: shipment queue, carrier, tracking and status changes.
12. **Analytics & reports**: date range, sales, paid orders, average order value, units sold, top products/categories, customer/repeat purchase metrics, payment success/failure, refunds, low stock, pending fulfilment and CSV export if feasible.
13. **Admin account**: single admin login/account management only for the demo. Do not build staff invitations or multi-role administration. Keep all admin endpoints protected server-side and audit sensitive actions.
14. **Notifications**: email/outbox delivery and retry status if email is implemented.
15. **Audit logs**: actor, action, entity, timestamp and safe before/after summary.
16. **Settings**: store details, currency, timezone, destination shipping zones/rules, tax settings if enabled, gateway sandbox/live mode display, email setup status and operational settings. Do not display secrets.
17. **System status/help**: API/database health without exposing credentials or stack traces.
18. Email marketing - with subscribed users and registered users emails.

Analytics must be derived from database data. Document definitions for gross/net sales, AOV, payment success rate, refunds and top products. Use consistent timezone and date filters. Do not let a dashboard metric count pending payments as sales.

## STEP 14 — Storefront CMS, promotions and notifications

Connect homepage banner/featured sections/promotions to admin-managed data. Validate promotion dates, usage limits and eligibility server-side. Do not trust a discount amount sent by the browser.

Implement email notifications only after payment/order lifecycle is reliable:
- order received/pending;
- verified payment;
- shipment/tracking update;
- cancellation/refund status;
- optional account verification/password reset.

Use an email provider configured through backend environment variables. Log failures, retry safely and deduplicate notifications. Do not send a paid email before verification. If no email provider is configured locally, provide a safe development mail log rather than pretending delivery succeeded.

## STEP 15 — Reports, audit and operational integrity -

Implement database-derived analytics with date filters and documented formulas. Add CSV export only after access checks and filters work. Record admin actions such as product price/stock edits, publication changes, order transitions, customer suspension, refund actions and settings changes.

Test that analytics reconcile to source records, customer data is restricted by role, CSV exports do not leak unauthorized information, and audit logs cannot be edited through normal admin UI.

## STEP 16 — Final end-to-end QA and documentation

Run frontend build/typecheck/lint scripts available in `package.json`, PHP syntax checks, migration tests and relevant automated tests. Create `docs/TEST_PLAN.md` with actual pass/fail results.

Test:
- product CRUD and storefront synchronization;
- guest and registered checkout;
- manipulated browser price/total;
- physical cart checkout;
- location-based shipping fees for valid zones, changed/tampered client fee, and unmatched/out-of-zone address;
- out-of-stock and concurrent purchase;
- Kora sandbox card and transfer paths supported by the account;
- Monnify sandbox card and transfer paths supported by the account;
- failed, pending, delayed and cancelled payment;
- closing browser before redirect;
- repeated/invalid webhook;
- wrong amount/currency/reference;
- duplicate checkout submission;
- failed/expired payment stock release;
- customer trying to view another customer's order;
- customer trying to access admin endpoints;
- admin shipping/tracking changes;
- refund status;
- analytics reconciliation;
- missing API/database/provider configuration;
- responsive storefront and admin navigation;
- clean setup from a new local XAMPP database.

Document all environment variables, exact local URLs, XAMPP setup, migration/seed commands, Kora and monnify sandbox configuration, webhook testing, shipping-zone setup and out-of-zone behavior, single-admin setup, why Redis is deferred, deployment boundaries and unresolved limitations. Never claim a test passed unless it was actually run.

## Completion report after every step

Return:
1. files created/changed;
2. what is functional;
3. commands/tests actually run and results;
4. manual tests still required;
5. known limitations/security concerns;
6. exact next step to run.

Stop after each prompt. Do not automatically implement subsequent steps.
