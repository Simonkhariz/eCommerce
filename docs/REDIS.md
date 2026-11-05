# Redis (optional) — roadmap Prompts 27-30

Redis is **optional**. Without `REDIS_URL` the shop works exactly as before, on the file cache.
With it, Redis is used for the public catalogue cache only, and the shop falls back to the file
cache by itself whenever Redis is missing, slow, wrongly set up or restarting. MySQL stays the
record of everything: orders, stock, payments, sessions, rate limits and emails never live in
Redis.

Why it is optional (Prompt 26 measurements): on one server the file cache answers a cached read
in 0.3 ms, the MySQL rate limiter handled 871 checks a second without losing one, and the MySQL
email queue sent 193 emails a second. Redis earns its place when the shop runs on **more than one
server**: then every server must see the same "catalogue changed" signal and can share cached
pages. Many cPanel plans do not offer Redis; some include it (often as a Unix socket).

## Setting it up

`backend/.env`:

| Setting | Meaning |
|---|---|
| `REDIS_URL` | `redis://:PASSWORD@127.0.0.1:6379/0`, `rediss://…` (TLS, certificate checked) or `unix:///home/USER/redis.sock?password=PASSWORD&db=0` |
| `REDIS_PREFIX` | Start of every key (default `shopco:`), so a Redis shared with other sites never mixes with the shop's |
| `REDIS_TIMEOUT_MS` | Longest wait for Redis to connect or answer (default 150), then the file cache answers |
| `REDIS_RETRY_SECONDS` | After a failure Redis is skipped, with no waiting, for this long (default 30), then tried again |

No PHP extension is needed: the shop speaks Redis's protocol itself (`App\Support\Redis`).
Admin → System status → **Redis (optional cache)** shows whether it answers and how fast.

**Security:** use a password (`requirepass`, or the host's ACL user), keep Redis on 127.0.0.1 or a
Unix socket (never open to the internet), and use `rediss://` when it is on another machine.
Only public catalogue data is ever stored, so a leak would expose nothing private.

## Hosted Redis (Upstash)

Tried against a real Upstash database on 5 November 2026. Use the **TCP** address
(`rediss://default:PASSWORD@NAME.upstash.io:6379`); the REST (`https://`) address and token do not
work, because the shop speaks Redis's own protocol. Turn **Eviction** on.

**The shop's code works on it:** a catalogue read stored one listing page with its 60 s lifetime
and the catalogue version, and the secure connection's certificate checked out.

**Distance decides whether it is any use.** PHP opens a new connection for each request, and each
one costs several round trips (network, encryption, password) before the first command. Measured
from a PC in Nigeria to a database in AWS Cape Town: about 1500 ms to connect and 220 ms per
command, against a limit of 150 ms (`REDIS_TIMEOUT_MS`). So:

- **Same region as the server, or leave it off.** Further away, every attempt times out and the
  shop uses the file cache, losing up to 150 ms every `REDIS_RETRY_SECONDS`. Raising the limit
  makes it worse: with a 5000 ms limit, each listing read took about 2 seconds from that PC.
- **Not on a development PC.** It cannot reach a hosted database within the limit.
- **Expect no speed gain on one server.** The file cache answers in 0.3 ms. A hosted Redis is
  useful for a shop on several servers. After setup, compare in admin → System status; to stop
  using it, empty `REDIS_URL`.

**Free plan:** reported as 256 MB and 500,000 commands a month. A catalogue read costs about 2–3
commands (password, version, and the page for listings), since each request connects afresh. Any
Redis failure falls back to the file cache by design; a real exhausted quota has not been tried.

## Prompt 27: one purpose, the catalogue version

The "catalogue changed" signal: every admin change gives the catalogue a new version, and cached
listings belong to a version, so they are rebuilt after the change.

| | |
|---|---|
| Key | `<prefix>catalog:version` (a random 16-character value) |
| Expiry / eviction | No expiry. If Redis evicts it or restarts empty, a new value is chosen (`SET NX`); that only means the cache is rebuilt once |
| Written by | every admin change (`Cache::bumpCatalog`), to Redis **and** the file |
| Read by | every cached catalogue read (one `GET`) |

**Fallback:** when Redis does not answer within `REDIS_TIMEOUT_MS`, the server writes a marker
(`storage/cache/redis.down`) and uses the file version for `REDIS_RETRY_SECONDS`, so later
requests do not wait at all. An admin change during the outage reaches only the file.

**Recovery:** the first request after the outage replaces the Redis version, so nothing cached
before or during the outage is served afterwards (an admin change made meanwhile is never
hidden). Versions from Redis are marked (`r…`), so entries made with the file version are never
mistaken for current ones.

**Tested** (`RedisCacheTest`, against a stand-in Redis): two servers share the version; an admin
change on one is seen by the other; a hanging Redis costs at most its timeout, after which
requests skip it instantly; a change made during the outage is not hidden after recovery; a
Redis restarted empty, switched off, with a wrong password or a malformed `REDIS_URL` never
breaks a request and is reported in System status.

**Monitoring and recovery:** System status (row above); the PHP error log gets one line per
outage (`[Redis] unavailable, using the file cache: …`). Nothing has to be done when Redis comes
back. To stop using Redis, turn it off in admin → Tech switches (dev mode), or empty `REDIS_URL`.

## Prompt 28: one cache namespace, product listing pages

Only the `products:` namespace (product listing pages: category, filters, sorting, page) moved
to Redis. They are the most varied public reads and the ones worth sharing: with several
servers, a page built once serves all of them. Everything else stays in each server's files:
filters (`facets:`), categories, the homepage, and the admin's storage alert, which is admin
data and must never be shared. The list is a fixed allow-list in `Cache::REDIS_NAMESPACES`;
only public catalogue data may ever be added to it.

| | |
|---|---|
| Key | `<prefix>cache:<sha1(version and request)>` holding the serialised page |
| Expiry | The cache lifetime (`CATALOG_CACHE_SECONDS`, 60 s), set on every entry (`SET … EX`) |
| Invalidation | An admin change gives a new catalogue version (Prompt 27), so new keys are used at once; the old ones expire by themselves within the lifetime |
| Eviction | Set the Redis memory limit with `maxmemory-policy allkeys-lru` (or `volatile-lru`): pages are rebuilt when evicted. The version key has no expiry; if evicted, a new one is chosen and pages are rebuilt once |
| Private data | None: listing pages are the same for every visitor. Searches are never cached (`CatalogController`), and made-up filter values are not cached (Prompt 39 fix) |

**Fallback:** a failed read or write marks Redis down (Prompt 27) and the page is served from the
file cache or built from MySQL. A page that fails to build (a database error) reaches the caller
as before and does not count as a Redis outage.

**Tested** (`RedisCacheTest`, 10 more checks): cold start builds once; a second server reuses the
page instead of building it; entries carry the 60 s lifetime; filters and admin data stay in
files and never reach Redis; values come back exactly (text with emoji and quotes, decimals,
nulls, nesting); an admin change rebuilds the shared page (no stale entry); a build error is not
mistaken for an outage. The outage, recovery and restart checks of Prompt 27 now run with
listings in Redis and still pass.

**Not measured:** speed against a real Redis. Running the downloaded Redis server on the
development PC was refused by the assistant's safety check, so the checks above ran against
the stand-in. On one server no speed gain is expected (a file cache hit takes 0.3 ms; a local
Redis round trip is of the same order); the gain is sharing between servers. To run the same
checks against a real Redis: `REDIS_TEST_URL=redis://:PASSWORD@127.0.0.1:6379/15 php
backend/tests/run.php RedisCache` (its keys are removed afterwards; the outage checks need the
stand-in and are skipped).

## Prompt 29: event distribution — not built (it has nothing to deliver to)

The roadmap allows Redis events only "if approved for SSE", to fan live updates out to the
servers holding the browsers' connections. Live updates (SSE, Prompts 32-35) were deferred by the
owner: the shop polls (payment status after checkout, the admin bell every minute), and polling
already reads committed state from MySQL. Publishing events with no listener would be a second
Redis use case with no purpose, which the roadmap rules out ("Do not introduce another Redis use
case"). When SSE is built, its design is set out here already: publish only after the database
transaction commits; treat Redis Pub/Sub as a wake-up signal, not the record (a browser that
reconnects reads the current state over REST, so a missed message costs nothing); use a Redis
Stream only if a message must survive a restart.

## Prompt 30: queue scaling decision — keep the MySQL email outbox

Measured against what the shop needs:

| | Measured |
|---|---|
| MySQL outbox, 4 workers (Prompt 26) | 193 emails a second, each sent exactly once |
| Load test, 20,000-email backlog (Prompt 37) | Drained in 141 s by 4 workers; no email sent twice |
| What can actually leave | Resend allows 10 requests a second per account by default; the worker is paced at 8 |

The queue is about **19 times faster than the email service allows**, so it is not the limit, and
a Redis queue would not send a single email sooner. It would also lose two things that matter:

- **One transaction with the payment.** The payment-confirmed email is queued inside the same
  MySQL transaction that marks the order paid (`PaymentFinalizer`), so there is never a paid order
  without its email or an email for a payment that was rolled back. A Redis queue cannot join
  that transaction.
- **Durability without extra setup.** Outbox rows are in the database and its backups. Redis keeps
  data in memory unless persistence (AOF) is configured, which many hosts do not offer.

**Decision:** keep the MySQL outbox; no Redis queue. Revisit only if all three become true: the
email service allows far more than the outbox delivers, MySQL shows contention on the outbox
under that load, and several servers send at once. A Redis-backed queue would then need, before
any code: persistence (AOF, fsync every second), the outbox kept as the record with Redis only
signalling new work (so the payment transaction stays whole), a stream with consumer groups for
claims and `XAUTOCLAIM` for crashed workers, the same idempotency keys (`shopco-outbox-<id>`),
retries and the 5-attempt limit as today, a dead-letter list shown in admin, and a period running
both side by side before the switch.
