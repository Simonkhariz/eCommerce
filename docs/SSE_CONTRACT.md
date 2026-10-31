# Live payment status: the first SSE contract (roadmap Prompt 32)

31 October 2026, branch `scalability-phase1`. Designed in Prompt 32; the owner approved the four
recommended choices, and **Prompt 33 built it, switched off by default** (`SSE_ENABLED=false`).
What was built and tested is in section 12.

SSE (server-sent events) keeps one connection open from the browser to the server, so the server
can push a message the moment something changes. Today the shop asks again and again instead
(polling).

## 1. The first use case: payment status on the return page

**Chosen:** the payment return page (`/checkout/callback`) learns that the order is paid the
moment the payment is recorded, instead of on its next check.

| Candidate | For | Against |
|---|---|---|
| **Payment status on the return page** (chosen) | The moment customers care about most; each connection is short (a payment settles in seconds to a few minutes), so the number of open connections stays small; already has a REST fallback (the polling) | Needs the gateway check kept (below) |
| Admin bell (new orders, transfers to confirm) | Useful to the owner | An admin tab stays open for hours: one server worker held all day per tab. On shared hosting with ~20 workers that is a poor trade for an alert that is fine at one minute |

**Today's behaviour, measured from the code** (`lib/payment-queries.ts`):
- The return page asks `GET /checkout/orders/{n}/verify-payment` after 3, 3, 5, 5, 8, 10, 15, 15,
  20, 20 and 20 seconds: 11 requests over about 2 minutes, only while the tab is visible.
- **The worst-case delay** between "paid" being recorded and the page showing it is the current
  gap: up to 20 seconds late in the schedule.
- Each check is short (tens of milliseconds) and, while the payment is pending, **asks Kora or
  Monnify directly**. That direct question is what confirms a payment when the provider's notice
  is slow or never arrives (for example when `APP_URL` is wrong). SSE must not lose it.

## 2. What SSE adds, and what it costs on this shop's hosting

| | Polling (today) | SSE |
|---|---|---|
| Delay before "paid" shows | Up to 20 s | About 1–2 s (section 5) |
| Server work per paying customer | 11 short requests over 2 minutes | **One PHP worker held** for up to 110 s, plus 2–4 short gateway checks |
| Database connections | One per short request | **One held** for the whole stream |
| Works on `php -S` (development) | Yes | **No:** `php -S` serves one request at a time, so one stream blocks the whole API |

**The real cost is PHP workers.** The API runs one PHP process per request. On cPanel shared
hosting the limit is often about 20 processes at once ("entry processes"), and the database
often allows 15–30 connections per account. Ten customers paying at the same moment would hold
half of both. Polling holds a worker for milliseconds.

**Recommendation:**
- Build it **switched off by default** (`SSE_ENABLED=false`) and capped hard (section 7).
- The page uses SSE only when the server offers it, and falls back to today's polling otherwise.
- **Turn it on only after Prompt 35** measures it on the chosen host. On a VPS with PHP-FPM the
  cost is small; on a cheap cPanel plan it may not be worth it.

## 3. Endpoint

```
GET /api/v1/checkout/orders/{orderNumber}/events
Accept: text/event-stream
```

- Reached through the storefront's existing `/api/v1` proxy (same origin; no CORS).
- Response headers:
  - `Content-Type: text/event-stream; charset=utf-8`
  - `Cache-Control: no-store`
  - `X-Accel-Buffering: no` (stops nginx buffering)
  - no `Content-Encoding`; compression is never applied to the stream
- **When the feature is off,** the answer is `404 SSE_DISABLED` and the page polls as today.
- **When the server is full** (section 7), the answer is `503 SSE_BUSY` with `Retry-After`, and the
  page polls.

## 4. Who may listen (authentication and authorisation)

**Exactly the same people who may call `verify-payment` today** (`CheckoutController::canViewOrder`
plus the reference rule):
1. the signed-in owner of the order (session cookie);
2. the holder of the guest access key;
3. someone holding the exact gateway reference from the return redirect.

Anyone else gets the same `404 ORDER_NOT_FOUND` as `verify-payment`, so the endpoint can't be used
to find out which order numbers exist.

**Decision 1, how the browser sends the key.** The standard `EventSource` API cannot send
headers, and the shop's rule is that **the guest access key never appears in a web address**
(addresses end up in logs and browser history). Two ways out:

| Option | How | Trade-off |
|---|---|---|
| **A. Stream read with `fetch()`** (recommended) | The page opens the stream with `fetch()` and sends `X-Guest-Access-Token` / `X-Payment-Reference` as headers, exactly like `verify-payment` today, then reads the text stream itself | A small hand-written reader (about 60 lines) and its own reconnect logic; no new table; no secret in any address |
| B. `EventSource` with a ticket | A `POST` first exchanges the key for a random ticket valid for 60 seconds and one use; the stream URL carries `?ticket=` | Built-in reconnect, but a new table (or cache entry) for tickets, and a reconnect after 60 s needs a new ticket anyway |

**Authorisation is checked once, when the stream opens.** The stream carries one order only, and
its order number is fixed by the address. No other order's data can reach it.

## 5. Events and payload

The stream sends three kinds of message:

```
retry: 3000

id: 41-pending
event: payment
data: {"order_number":"ORD-20261030-A1B2C3","status":"pending","order_status":"pending_payment"}

: keep-alive

id: 42-successful
event: payment
data: {"order_number":"ORD-20261030-A1B2C3","status":"successful","order_status":"paid"}

event: end
data: {"reason":"final"}
```

| Event | When | Payload |
|---|---|---|
| `payment` | First, the moment the stream opens (the current state). Then again whenever the state changes | `order_number`, `status` (`not_started`, `pending`, `successful` or `failed`), and `order_status`. These are the same words `verify-payment` uses, so the page reuses `paymentViewFor()` |
| `: keep-alive` (comment) | Every 15 s with no change | Nothing. It keeps proxies from closing a quiet connection and lets PHP notice a closed tab |
| `end` | The state is final (`successful`, `failed` with the order cancelled, or the order cancelled), or the stream reached its time limit | `reason`: `final` or `time_limit` |

**Kept out of the payload on purpose:**
- amounts, names, addresses, emails;
- references other than the one the page already has.

The page loads the receipt with the existing `GET /checkout/orders/{n}` after `successful`,
under that endpoint's own rules.

**`id`** is `{payment row id}-{status}`. It is only used to drop repeats; the stream never replays
history.

## 6. Where events come from: commit-before-publish

- **No Redis, no new table** (Prompt 34 asks for the simplest design that works).
- The stream's own PHP process reads the order's `order_status` and its payments' `status` with
  one small query by primary key, **every 1 second for the first 30 seconds, then every 2
  seconds**.
- Each read is a plain autocommit `SELECT`, so it can only see **committed** data. A payment that
  is rolled back is never announced.
- **This is the same gate as today.** Every confirmation still goes through `PaymentFinalizer`
  (webhook, return check, expiry job, manual confirmation). The stream only watches the result.
- **The stream never changes an order and never confirms a payment.**
- **Keeping the gateway check.** While the status is `pending`, the page keeps calling
  `verify-payment` (the call that asks Kora or Monnify) **at 3, 15, 45 and 90 seconds** instead of
  11 times. So a missing provider notice is still caught, and the stream announces the result the
  moment that call records it.
- **Later, with Redis on several servers:** `PaymentFinalizer` publishes a wake-up after commit
  (design in `docs/REDIS.md`) so streams can read less often. The database stays the record; a
  missed wake-up only means the next 2-second read finds it.

## 7. Limits

| Limit | Value | Why |
|---|---|---|
| Stream length | 110 s, then `end` (`time_limit`) | The storefront proxy cuts calls at 120 s (`experimental.proxyTimeout`); a payment that hasn't settled in 2 minutes moves to the page's "Check again" state, as today |
| Streams per order | 2 | Two tabs. A third gets `503`, and that tab polls |
| Streams per visitor address | 4 | Stops one visitor holding workers |
| Streams on the whole server | `SSE_MAX_STREAMS`, default 8 | The worker and database guard. Counted with the existing rate-limit table (a row per open stream with a 120-second expiry, so a crashed process frees its slot) |
| Opening streams | 20 per 10 minutes per address | Same scale as `payment_init` |
| Heartbeat | 15 s | Proxies and phone networks close silent connections at 30–60 s |
| Reconnect (`retry`) | 3 s, at most 3 times per page visit, then polling | A dropped mobile connection recovers; a broken server doesn't get hammered |

**PHP settings for the stream request only:**
- `set_time_limit(130)`;
- every output buffer flushed and closed (`index.php` starts one), with gzip skipped;
- `ignore_user_abort(false)`, checking `connection_aborted()` after each heartbeat, so a closed tab
  frees its worker within 15 s;
- the slow-request log skips this route, since each stream is long by design and would flood it.

**Apache** compresses nothing in `backend/public/.htaccess` today. If a host adds `mod_deflate`,
the route needs `SetEnv no-gzip 1`. Prompt 33 adds that rule.

## 8. Recovery, reconnects, duplicates and order

- **Every (re)connect starts with the current state.** A message missed while disconnected
  costs nothing, so `Last-Event-ID` is accepted but not needed.
- **The page treats every message as a hint and only moves forward:**
  - `not_started` → `pending` → `successful` / `failed`;
  - `successful` is final;
  - an older or repeated message is ignored.
- **If the stream fails** (refused, 404, 503, three drops, or the proxy buffers it so nothing
  arrives within 5 s), the page switches to today's polling schedule for the rest of the visit.
  Customers always get an answer.
- **A process restart or deploy** closes the stream; the page reconnects and gets the current
  state.

## 9. What stays exactly as it is

- `verify-payment`, the webhooks, `PaymentFinalizer`, expiry and manual confirmation.
- Track order, My orders and the admin bell (still polling every minute).
- With `SSE_ENABLED=false` (the default), the shop behaves exactly as today.

## 10. Tests for Prompt 33

API (a new `LiveStatusTest`, run against the test server):

1. Feature off → `404 SSE_DISABLED`.
2. No access, a wrong access key, or another order's key → `404 ORDER_NOT_FOUND`, the same body as
   `verify-payment`.
3. With access: correct headers, first message is the current state, no `Content-Encoding`.
4. A payment confirmed through `PaymentFinalizer` in another process is announced within 3 s,
   followed by `end`.
5. **A change inside an open, uncommitted transaction is not announced;** after the commit it is.
6. A rolled-back confirmation is never announced.
7. The payload holds only the three fields (no amount, name, email or address).
8. A heartbeat arrives within 16 s; the stream ends with `time_limit` at 110 s (a test setting
   shortens both).
9. Caps: the third stream for one order, and stream number `SSE_MAX_STREAMS + 1`, get `503`; a
   slot frees when a stream ends and after a killed process's 120 s.
10. A closed connection frees its worker within one heartbeat.
11. The slow-request log has no entry for the stream.

Storefront:

12. The reader parses split chunks, comments, `retry`, `id` and `end`, and ignores older or
    repeated states (web unit test).
13. The fallback to polling happens on 404, 503 and three drops (web unit test).
14. Through the production build's proxy, the first message arrives within 1 s, which proves the
    proxy doesn't buffer (added to `smoke.mjs`).

Prompt 35 then measures, on staging only:
- open streams against PHP workers and database connections;
- memory and CPU;
- the delay from "paid" recorded to the page;
- reconnects.

## 11. Decisions for the owner before Prompt 33

1. **First use case:** payment status on the return page (recommended), or the admin bell.
2. **Transport:** `fetch()` stream with headers (recommended), or `EventSource` with a 60-second
   ticket.
3. **Default:** switched off until Prompt 35 measures it on the chosen host (recommended).
4. **Caps:** 8 streams per server, 110-second streams (recommended defaults; adjustable in
   `backend/.env`).

## 12. Prompt 33: built (31 October 2026)

The owner chose all four recommendations: payment status on the return page, a `fetch()`
stream with headers, switched off by default, and 8 streams of 110 s.

| Part | Where |
|---|---|
| Endpoint | `CheckoutController::paymentEvents`, route `GET /api/v1/checkout/orders/{n}/events`; access shared with `verify-payment` (`canSeePaymentStatus`) |
| State, slots and settings | `App\Services\LiveStatus` (`snapshot`, `claimSlot`, `releaseSlot`; `SSE_ENABLED`, `SSE_MAX_STREAMS`, `SSE_STREAM_SECONDS`, `SSE_HEARTBEAT_SECONDS` in `backend/.env.example`) |
| The page knows whether to try | `GET /checkout/payment-methods` returns `live_payment_status` |
| Stream reader | `lib/live-payment.ts` (parser, forward-only states, 5 s first-message limit, reconnects) |
| Return page | `app/checkout/callback/page.tsx`: stream while pending, `verify-payment` at about 3, 15, 45 and 90 s, the usual schedule when the stream is off, refused, silent or dropped three times |
| Apache | `backend/public/.htaccess`: no compression for `/events` if the host adds `mod_deflate` |
| Slow-request log | Streams left out (`backend/public/index.php`) |

**Changes from the design:**
- The message `id` is `{payment id}-{status}-{order status}`, so a failed attempt followed by the
  order closing is also announced.
- **The stream is sent with `Cache-Control: no-store, no-transform`.** The rig check found that
  Next.js compresses answers it proxies: through `next start` the stream came back gzipped and
  held back, and the first message took 5 s. `no-transform` tells it, and other proxies, to pass
  the stream through as written; the first message then took 32 ms. nginx compresses only
  `text/html` unless a host adds more types. If a host adds `text/event-stream`, turn gzip off
  for this route.

**Tests:**
- `LiveStatusTest`: 47 checks on four extra test APIs with SSE on (short streams, 2 s
  heartbeat, 3 slots). They cover:
  - access the same as `verify-payment`;
  - the state first, then a payment announced within 3 s of its commit;
  - an open transaction and a rollback never announced;
  - heartbeat and time limit;
  - limits per order, per server and per visitor;
  - slots of killed processes expiring;
  - a closed tab freeing its worker;
  - the slow-request log, and the stream never changing the order.
- `tests/live-payment.test.mjs`: 6 checks of the reader (chunks split anywhere, forward-only
  states, the key in a header and never in the address, time limit, 404 and 503, dropped,
  buffered, aborted).
- **Rig check** (`ssecheck.mjs`, production build behind `next start`, Apache, `shopco_load`):
  13 of 13.
  - First message through the proxy in 32 ms; "paid" about 1 s after it was recorded.
  - In a real browser, "Payment confirmed" 571 ms after the payment was recorded, with 2 calls to
    `verify-payment` in total.
  - Smoke test 30 of 30, integrity clean.

**Next:** Prompt 34 is covered by this design: the stream reads committed rows, so no separate
publishing step or Redis is needed on one server. Prompt 35 measures it on staging (open streams
against PHP workers and database connections, memory, CPU, delay, reconnects) before
`SSE_ENABLED=true` on the live shop.
