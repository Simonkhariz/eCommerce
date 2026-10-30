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
back. To stop using Redis, empty `REDIS_URL`.
