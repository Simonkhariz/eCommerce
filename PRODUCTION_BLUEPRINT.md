# Master Production Blueprint: Next.js Frontend + PHP & Redis Backend

This blueprint provides the complete, chronological engineering roadmap to turn the **SHOP.CO** frontend prototype into a high-concurrency, hardened enterprise e-commerce platform using **Next.js 14 (Frontend)**, **Modern PHP 8.2+ (Backend API)**, **Redis (Caching, Rate Limiting & Locks)**, and **MySQL/PostgreSQL (Transactional Database)**.

---

## 🗺️ Architectural Topology

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Cloudflare Edge / WAF                           │
│   - DDoS Shield     - Bot Protection (Turnstile)    - Edge Asset Cache │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                  Next.js 14 Frontend (Port 3000)                       │
│   - React 18 SSR/SSG    - Client Debouncing    - Zero-Trust Cart Model │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTPS REST JSON
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│               Modern PHP 8.2+ API Gateway (Nginx / PHP-FPM)            │
│   - Fast Modular Router  - Strict DTO Validation  - Auth / CORS Guards │
└──────────────┬──────────────────────────────────────────┬──────────────┘
               │                                          │
               ▼                                          ▼
┌───────────────────────────────┐          ┌─────────────────────────────┐
│       Redis (In-Memory)       │          │   MySQL / PostgreSQL (DB)   │
│ - Sliding Window Rate Limit   │          │ - Atomic Stock Transactions │
│ - 24-Hour Idempotency Keys    │          │ - Authoritative Prices      │
│ - 10-Minute Cart Holds        │          │ - Strict Foreign Keys       │
└───────────────────────────────┘          └─────────────────────────────┘
```

---

## 🛑 Problem, Threat & Solution Matrix

| Threat / Scaling Problem | Exploitation Scenario | Production Engineering Solution |
| :--- | :--- | :--- |
| **1. Client Tampering (LocalStorage Manipulation)** | A tech-savvy shopper edits `localStorage` via Chrome DevTools to set a $260 jacket to `$1.00`, or injects an invalid 99% off coupon. | **Zero-Trust Server-Authoritative Architecture**: Frontend sends only `{ productId, variantId, qty }`. PHP calculates subtotal, tax, and discounts against the database. |
| **2. Traffic Surges & Concurrency (Millions of Clicks)** | 100,000 visitors hit "Buy Now" simultaneously during a flash sale. Node/PHP worker processes max out and the database drops connections (`Too many connections`). | **Edge Caching + Connection Pooling**: Cloudflare absorbs 95% of read requests. PHP-FPM connection limits + Redis fast-path caching protect the relational database. |
| **3. Inventory Race Conditions (Overselling)** | 5 items left in stock. 500 shoppers click "Pay" at the exact same millisecond. Simple `if ($stock > 0)` checks result in 495 oversold orders. | **Atomic Database Decrements**: `UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ? RETURNING stock;` combined with Redis 10-minute cart reservation locks. |
| **4. Button Spamming & Bot DDOS** | Scalper bots script 5,000 checkout attempts/sec to corner sneaker inventory, or an impatient user clicks "Pay" 4 times. | **Frontend Debounce + Redis Token Bucket Rate Limiting**: Max 10 cart actions/min per IP. Cloudflare Turnstile blocks automated scripts silently without CAPTCHA puzzles. |
| **5. Double Billing (Duplicate Charges)** | A user's network drops for 2 seconds after clicking "Pay"; user taps it again, charging their credit card twice. | **Idempotency Keys**: Frontend generates a UUID v4 `Idempotency-Key` header. PHP caches transaction status in Redis for 24 hours and ignores duplicate charges. |
| **6. Disconnected Payment Webhooks** | Customer completes 3D Secure verification on mobile bank app, but closes the browser before redirecting back to the store. | **Asynchronous Stripe Webhooks**: PHP backend listens to Stripe's `payment_intent.succeeded` event directly and creates the order in the database independent of the browser. |

---

## 🚀 Chronological Implementation Roadmap & LLM Prompts

Follow these 6 stages sequentially. Each stage provides the exact **Master Prompt** to feed into the assistant to build that specific layer.

---

### Stage 1: Frontend Hardening & Zero-Trust Adaptation
**Objective**: Prepare the Next.js frontend for live backend communication, lock rapid click spam, debounce search inputs, and ensure no pricing calculations are trusted from client storage.

#### 📋 Tasks:
1. Update `CartContext.tsx` so items maintain `productId`, `colorId`, `sizeId`, and `quantity` as primary data.
2. Add submission locks and loading spinners to "Add to Cart" and "Checkout" buttons (`isSubmitting` state).
3. Add a client-side UUID generator for `Idempotency-Key` headers.

#### 🤖 Master Prompt to Run for Stage 1:
```markdown
You are an expert Frontend Security Engineer. Harden the Next.js 14 e-commerce frontend in `components/ui/ProductCard.tsx`, `components/product/VariantSelector.tsx`, `components/cart/OrderSummary.tsx`, and `context/CartContext.tsx`:
1. Add button debouncing and loading submission locks to prevent rapid click spamming. When a button is clicked, immediately disable it and show an inline spinner until the operation settles.
2. Ensure `CartContext` supports passing clean cart payloads ({ productId, size, color, quantity }) without relying on client-tampered prices for checkout.
3. Install and configure a client idempotency key utility (`crypto.randomUUID()`) to include in checkout request headers.
4. Ensure all user input forms (Promo Code, Review modal, Newsletter) have trimmed sanitization.
Keep all existing styles and hugeicon assets intact.
```

---

### Stage 2: PHP 8.2+ REST API Scaffolding (No Heavy Frameworks)
**Objective**: Set up a lightweight, blazing-fast native PHP backend API using Composer, standard routing, PSR-7 JSON responses, and strict CORS handling.

#### 📋 Tasks:
1. Create a `backend/` directory with `composer.json` using PHP 8.2+, `bramus/router` (or lightweight FastRoute), `vlucas/phpdotenv`, and `predis/predis`.
2. Configure `public/index.php` with JSON response helpers and CORS headers allowing requests from `http://localhost:3000`.
3. Set up a secure database connection manager (`Database.php`) using PDO with `ATTR_EMULATE_PREPARES => false` and `ERRMODE_EXCEPTION`.

#### 🤖 Master Prompt to Run for Stage 2:
```markdown
You are an expert Backend Engineer. Build a fast, lightweight native PHP 8.2+ REST API in a new `backend/` directory:
1. Create `backend/composer.json` requiring:
   - `bramus/router`: Minimalist, zero-bloat REST router.
   - `vlucas/phpdotenv`: Environment variables.
   - `predis/predis`: Redis client for rate limiting and locks.
   - `stripe/stripe-php`: Official payment SDK.
2. Build `backend/public/index.php` as the single entrypoint with:
   - Strict CORS middleware allowing our Next.js frontend origin.
   - Global JSON error handling and structured response helper `jsonResponse($data, $status)`.
3. Build `backend/src/Database.php` providing a singleton PDO connection to MySQL/PostgreSQL with UTF8mb4, prepared statements, and persistent connection support.
4. Create `.env.example` with DB_HOST, DB_NAME, DB_USER, DB_PASS, REDIS_HOST, REDIS_PORT, STRIPE_SECRET_KEY, and STRIPE_WEBHOOK_SECRET.
Ensure the code uses modern PHP 8 typed properties and readonly classes without requiring Laravel.
```

---

### Stage 3: Redis Integration (Rate Limiting, Idempotency & Locks)
**Objective**: Protect PHP endpoints from bot spam and race conditions using in-memory Redis keys.

#### 📋 Tasks:
1. Build `backend/src/Services/RateLimiter.php`: Sliding-window rate limiter checking client IP and user tokens.
2. Build `backend/src/Services/IdempotencyService.php`: Checks incoming `Idempotency-Key` headers to block duplicate transactions.
3. Build `backend/src/Services/InventoryLock.php`: Creates 10-minute temporary reservations for products during checkout.

#### 🤖 Master Prompt to Run for Stage 3:
```markdown
You are a High-Concurrency Systems Engineer. In `backend/src/Services/`, build native PHP Redis services using `predis/predis`:
1. `RateLimiter.php`:
   - Implement a Sliding-Window Token Bucket algorithm.
   - Configurable limits: e.g. `check($clientIp, 'cart_add', $maxRequests = 20, $decaySeconds = 60)`.
   - Returns 429 Too Many Requests with `Retry-After` header if exceeded.
2. `IdempotencyService.php`:
   - Checks `Idempotency-Key` HTTP header.
   - If key exists with status 'processing', return 409 Conflict.
   - If key exists with status 'completed', return cached JSON response immediately without re-executing logic.
   - Locks key for 24 hours.
3. `InventoryLock.php`:
   - Acquire temporary lock on product stock: `SET lock:product:{id} {userId} NX EX 600`.
Provide clean, production-ready code with graceful fallbacks if Redis is temporarily unreachable.
```

---

### Stage 4: Database Schema & Atomic Transactions
**Objective**: Build relational database tables with foreign keys and write atomic queries that make overselling mathematically impossible.

#### 📋 Tasks:
1. Create `backend/database/schema.sql`:
   - `products`: ID, name, slug, base_price, status, created_at.
   - `product_variants`: ID, product_id, sku, color, size, stock_quantity, price_override.
   - `coupons`: code, discount_percent, valid_until, usage_limit, times_used.
   - `orders`: ID, order_number, user_email, total_amount, discount_amount, status, payment_intent_id.
   - `order_items`: ID, order_id, variant_id, unit_price, quantity.
2. Write atomic stock deduction repository methods using `SELECT ... FOR UPDATE` inside `PDO::beginTransaction()`.

#### 🤖 Master Prompt to Run for Stage 4:
```markdown
You are a Database Architect. In `backend/database/`, create the complete database setup for our e-commerce platform:
1. Write `schema.sql` (compatible with MySQL 8 & PostgreSQL) with strict indexing, foreign keys, and unsigned integers:
   - `products`, `product_variants`, `coupons`, `orders`, `order_items`.
2. Build `backend/src/Repositories/OrderRepository.php`:
   - Implement `createOrderWithAtomicStockDeduction($orderData, $items, $couponCode)`:
     - Open PDO transaction (`beginTransaction()`).
     - Query each variant with `SELECT stock_quantity, price FROM product_variants WHERE id = ? FOR UPDATE`.
     - Verify stock is sufficient; throw exception and `rollBack()` if any item is sold out.
     - Decrement stock atomically: `UPDATE product_variants SET stock_quantity = stock_quantity - ? WHERE id = ?`.
     - Calculate authoritative totals from database prices (ignoring any client-sent price).
     - Commit transaction (`commit()`).
Include comprehensive error handling and rollback guarantees.
```

---

### Stage 5: Secure Checkout & Stripe Integration
**Objective**: Wire live server-authoritative checkout with Stripe Payment Intents and webhook listeners.

#### 📋 Tasks:
1. `POST /api/checkout/create-intent`: Validates cart items, verifies stock, applies server-side coupon discount, and returns Stripe `client_secret`.
2. `POST /api/checkout/webhook`: Listens for Stripe's cryptographically signed webhook to mark order paid and trigger customer email.

#### 🤖 Master Prompt to Run for Stage 5:
```markdown
You are a Payment Systems Specialist. Build the checkout and payment pipeline in `backend/src/Controllers/CheckoutController.php` using `stripe/stripe-php`:
1. `createPaymentIntent()`:
   - Validate input `{ items: [{ variantId, quantity }], couponCode, customerEmail }` using strict sanitization.
   - Check RateLimiter (max 5 checkout attempts per 10 min).
   - Check IdempotencyService header.
   - Look up real prices in Database; calculate total in integer cents.
   - Call `\Stripe\PaymentIntent::create()` with amount, currency ('usd'), metadata (order_id, items).
   - Return `{ clientSecret, orderId, authoritativeTotal }`.
2. `handleWebhook()`:
   - Verify `Stripe-Signature` using `\Stripe\Webhook::constructEvent()`.
   - On `payment_intent.succeeded`, update order status to 'PAID' in database.
   - Release Redis inventory holds and finalize stock deductions.
```

---

### Stage 6: Cloudflare WAF, Nginx Configuration & Production Deployment
**Objective**: Configure production server infrastructure (Nginx + PHP-FPM + OPcache) and edge protection to handle traffic spikes.

#### 📋 Tasks:
1. Create `backend/docker-compose.yml` (Nginx, PHP 8.2-FPM, Redis, MySQL).
2. Configure `nginx.conf` with rate-limiting zones, gzip/brotli compression, and fastcgi buffers.
3. Configure `php.ini` with OPcache enabled (`opcache.enable=1`, `opcache.memory_consumption=256`).

#### 🤖 Master Prompt to Run for Stage 6:
```markdown
You are a DevOps & Infrastructure Architect. Create production container and server configurations in `backend/docker/`:
1. `Dockerfile` for PHP 8.2-FPM with extensions: pdo_mysql, pdo_pgsql, redis, opcache.
2. `nginx.conf` optimized for high concurrency:
   - Reverse proxy for Next.js on port 3000 and fastcgi for PHP on `/api/`.
   - Limit request zones (`limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s`).
   - Security headers (HSTS, X-Content-Type-Options, X-Frame-Options).
3. `docker-compose.yml` spinning up: `frontend` (Next.js), `api` (Nginx + PHP-FPM), `redis`, and `mysql`.
4. Provide the step-by-step terminal commands to test and deploy this cluster locally and to a VPS (Ubuntu/Debian).
```

---

## 🎯 Verification Checklist for Production Readiness

Before declaring the store ready for real commercial sales, verify each check:
- [ ] **Tampering Test**: Open DevTools, edit localStorage cart price to $0.01. Proceed to checkout: confirm the charge amount displayed by Stripe matches the true database price.
- [ ] **Click Flood Test**: Run `wrk` or `autocannon` to hit the cart API with 500 requests/second: verify Redis returns HTTP 429 after 20 requests and server stays healthy.
- [ ] **Race Condition Test**: Concurrently checkout 10 threads on an item with 2 units in stock: verify exactly 2 succeed and 8 receive "Out of Stock".
- [ ] **Double-Click Test**: Send 2 identical requests with the same `Idempotency-Key`: verify only 1 charge is created in Stripe dashboard.
- [ ] **Browser Crash Test**: Complete payment in Stripe test mode, close browser before redirect: verify webhook processes order into database.
