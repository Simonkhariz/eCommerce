# E-commerce Scalability & New Technology Implementation Roadmap

**Goal:** Make the existing e-commerce application faster, more reliable
under traffic spikes, and easier to scale without rewriting the
application or adding infrastructure without evidence.

**Technologies in scope** 1. **TanStack Query** --- client-side
server-state fetching, caching, invalidation and refetching. 2.
**Zustand** --- lightweight shared client state, only where the current
architecture benefits. 3. **Resend** --- transactional email transport
integrated with the existing database-backed outbox. 4. **S3-compatible
storage / MinIO** --- product images and uploaded files, if deployment
needs justify migration. 5. **Redis** --- shared cache, cross-process
event distribution and/or queues where a measured need exists. 6.
**SSE** --- live order/payment status and admin notifications.

This roadmap also covers existing Next.js/PHP/MySQL behavior, because
the new technologies must fit the current system.

------------------------------------------------------------------------

## 0. CLI coding agent: mandatory rules

### Read first; do not execute automatically

When first given this file, read it and summarize the plan. **Do not
edit files, install packages, run migrations, start services, contact
providers, or deploy until the owner gives a specific numbered prompt.**
Reading this roadmap is not permission to execute it.

### One prompt at a time

For each prompt: 1. Read this roadmap and the exact active prompt. 2.
Inspect the relevant code before editing. 3. State material conflicts
between the prompt, roadmap and repository. 4. Work only on the active
prompt and necessary supporting changes. 5. Do not implement future
prompts early or refactor unrelated files. 6. Run only safe, relevant
tests. 7. Report exact changed files and actual command results. 8. Stop
and wait for the owner's next instruction.

Never execute all prompts automatically. If a task is ambiguous,
destructive, or requires an owner decision, ask first.

### Preserve the existing system

-   Keep the existing Next.js frontend, PHP REST API, MySQL database,
    MySQLi, Kora and Monnify integrations unless explicitly approved
    otherwise.
-   Do not switch MySQLi to PDO merely for preference.
-   Do not replace the existing email outbox with direct synchronous
    Resend calls.
-   Do not make Redis authoritative for orders, payments, inventory or
    durable jobs.
-   Do not use SSE to create orders, mutate data or verify payments.
-   Do not add Zustand if the current state architecture does not need
    it.
-   Do not migrate every API call to TanStack Query automatically.
-   Do not move uploads to object storage until current storage and
    deployment are audited.
-   Do not assume hosting supports Redis, long-running workers or
    persistent SSE connections.

### Safety

-   Never reveal secrets from environment files or logs.
-   Never test with live payment credentials unless explicitly
    authorized.
-   Never run destructive migrations, resets, mass updates or production
    deployments without approval.
-   Verify automated tests use an isolated test database.
-   Do not claim a test passed unless it was actually run.
-   Do not publicly cache private customer, cart, order, payment or
    admin data.
-   Never trust browser-supplied totals, shipping fees, stock or payment
    status.
-   Do not remove tests to make changes pass.

### Required report after every prompt

Report scope completed/not completed, exact files changed, behavior
impact, commands and observed results, security/data-integrity
considerations, performance measured or still unknown, manual
checks/owner decisions, and the next prompt number/title only. Then
stop.

------------------------------------------------------------------------

## 1. Verified starting architecture from supplied files

Re-check the active repository before implementation because it may have
changed since the ZIPs were created.

### Existing stack

-   Next.js App Router (supplied package reports 16.4.2), React 19.3.1,
    TypeScript and Tailwind CSS.
-   PHP 8+ REST API using MySQLi prepared statements.
-   MySQL database, migrations and existing backend
    services/controllers.
-   Kora and Monnify payment integrations and webhook handling.
-   PHP file-based catalog cache with version-based invalidation.
-   Next.js server-side fetch caching.
-   Browser-side in-memory GET cache in `lib/api-client.ts`.
-   HTTP `Cache-Control`, `stale-while-revalidate` and ETag support on
    public endpoints.
-   Database-backed email outbox, mail templates/service and outbox
    processing script.
-   Pending-order expiry script.
-   Transactional checkout, server-side total calculation, idempotency
    and conditional stock reservation.

### Important existing details

-   `lib/server-api.ts` uses Next.js fetch caching with a default
    revalidation interval of 60 seconds.
-   The homepage and layout fetch shared storefront data from the PHP
    API.
-   The browser API client caches selected public GET routes for 30
    seconds.
-   Catalog/homepage responses also use PHP file cache. These cache
    layers must be coordinated.
-   Checkout currently attempts to expire overdue orders during order
    creation, despite a separate expiry script. Assess moving the sweep
    off the checkout request path while preserving stock/promotion
    release correctness.
-   Email delivery can be attempted immediately depending on
    configuration. Confirm this before making it asynchronous.
-   Redis is not assumed to be installed. The existing file cache and
    MySQL outbox may be sufficient for a single server until
    measurements prove otherwise.

------------------------------------------------------------------------

## 2. Target architecture and ownership

``` text
Browser
  ├─ Next.js / React / TypeScript / Tailwind
  ├─ TanStack Query: selected client-side server data
  ├─ Zustand: only justified shared client/UI state
  ├─ EventSource: receives SSE updates
  └─ Product images: existing storage or S3-compatible storage/CDN
              │ HTTPS REST + SSE
              ▼
Next.js application ── secure server-side cache revalidation
              │
              ▼
PHP REST API
  ├─ validation, authentication, authorization and rate limits
  ├─ catalog, checkout, inventory and orders
  ├─ Kora/Monnify payment verification and webhooks
  ├─ existing database-backed email outbox
  └─ post-commit cache invalidation and event publishing
              │
              ├─ MySQL: authoritative business state
              ├─ Resend: email transport (planned)
              ├─ Redis: optional shared cache/events/queues
              └─ S3-compatible storage/MinIO: optional media storage
```

  -----------------------------------------------------------------------
  Concern                             Source of truth / responsibility
  ----------------------------------- -----------------------------------
  Orders, payment state, stock,       MySQL + validated PHP logic
  prices and promotions               

  Client-fetched server data          TanStack Query, where adopted

  Temporary shared client/UI state    Zustand, if justified

  Durable pending emails              Existing database outbox

  Email delivery                      Existing mail abstraction; Resend
                                      if approved

  Live notifications                  SSE; not authoritative state

  Shared ephemeral cache/event        Redis, if justified
  distribution                        

  Product image objects               Existing storage or approved
                                      S3-compatible store
  -----------------------------------------------------------------------

------------------------------------------------------------------------

## 3. End-to-end workflows

### 3.1 Homepage, catalog and shared data

1.  Next.js requests public data.
2.  PHP serves valid cached catalog/homepage data or queries MySQL.
3.  Each cache layer has an explicit TTL, privacy class and invalidation
    rule.
4.  Admin changes commit to MySQL first.
5.  After commit, invalidate/version-bump the PHP cache.
6.  Revalidate Next.js tags/paths through an authenticated server-side
    mechanism where applicable.
7.  Browser/CDN caches follow their own policy; do not assume server
    invalidation clears every client.
8.  If invalidation fails, record it and rely on a bounded TTL as
    fallback.

Cache public content selectively. Keep cart, account, order, payment and
admin data private. Do not make the entire app dynamic just to refresh
one section.

### 3.2 Product listing, search and filters

-   Validate and normalize filter/sort/page inputs in PHP.
-   Use bounded pagination, selected columns and indexed queries.
-   Cache keys must include all relevant filter/sort/page parameters.
-   Avoid N+1 queries and unsafe user-controlled SQL fragments.
-   Inspect actual query plans before adding indexes or an external
    search engine.

### 3.3 TanStack Query workflow

Use it for suitable **client-side server state**, such as admin
lists/widgets, customer order views, and client-driven product/filter
interactions where the browser currently fetches data. Do not
automatically migrate server-rendered homepage data or every API
request.

-   Define centralized query keys including relevant filters and user
    scope.
-   Choose `staleTime`, garbage-collection and retry policy per data
    type.
-   Invalidate/update related queries after mutations.
-   Do not automatically retry checkout/payment mutations.
-   Avoid a global server QueryClient shared across users.
-   Audit the existing browser GET cache to avoid duplicate/conflicting
    cache ownership.
-   Keep Next.js server fetch caching documented separately.

### 3.4 Zustand workflow

Use only for client-side state that genuinely needs to be shared between
distant components, such as a complicated cart UI, modal/drawer state or
a small set of preferences.

-   Keep server data in TanStack Query, not duplicated in Zustand.
-   Do not treat local cart prices/stock as authoritative.
-   If guest cart persistence/account merge is used, define conflict
    behavior and test it.
-   Do not persist tokens or sensitive data in local storage.
-   If current React state/context is already simple, skip Zustand
    rather than adding a dependency without benefit.

### 3.5 Checkout and stock

1.  Client submits IDs and quantities, not trusted totals.
2.  PHP reloads current prices, stock, promotions and shipping
    configuration.
3.  PHP calculates subtotal, discount, delivery fee and total.
4.  A short MySQL transaction reserves inventory atomically and persists
    the order, item snapshots, idempotency record and payment-attempt
    state as appropriate.
5.  Commit the transaction.
6.  Enqueue email and post-commit notifications.
7.  Return an accurate order/payment state.
8.  SSE may later notify the connected browser of a committed state
    change.

Never report purchase success before the order/reservation is durable.
Do not call SMTP or other slow external services inside the inventory
transaction.

### 3.6 Kora/Monnify payments and SSE

1.  PHP initializes a payment attempt using a unique reference and
    server-calculated amount/currency.
2.  The browser return URL is not proof of payment.
3.  PHP verifies webhook signature, reference, amount, currency and
    expected state.
4.  Persist the verified state transition atomically.
5.  Queue post-commit email/event work.
6.  SSE sends a small authorized event such as `payment.updated` or
    `order.updated`.
7.  Frontend updates the UI and may refetch authoritative state via
    REST.
8.  On reconnect, recover current state via REST; transient SSE events
    are not durable history.

Duplicate/out-of-order webhooks must not double-use promotions,
reserve/release stock twice, duplicate notifications unnecessarily, or
move a paid order backwards.

### 3.7 Email outbox + Resend

1.  Persist an outbox row after the business transaction commits.
2.  A worker claims the row safely using the existing lease/locking
    strategy.
3.  Send through the selected transport (Resend if approved).
4.  Record success or schedule a retry with backoff.
5.  Surface permanent failures and backlog age.
6.  Email outage must not undo a committed order.

Resend is a transport, not a replacement for the outbox, deduplication
or retries. Keep its API key server-side. Verify sender domain and
SPF/DKIM/DMARC requirements. Use safe test recipients; do not send real
customer email during development.

### 3.8 S3-compatible storage / MinIO

1.  Audit current upload validation, storage location, image URLs and
    deployment constraints.
2.  Introduce a small storage adapter before switching providers.
3.  Validate actual file content, size, MIME, extension and permissions;
    generate object keys server-side.
4.  Keep private uploads private and public product images on controlled
    public delivery/CDN paths.
5.  Store stable object keys/metadata in MySQL, not temporary signed
    URLs as canonical URLs.
6.  Use responsive images, reserved dimensions, lazy loading below the
    fold and high priority only for the true hero/LCP image.
7.  Migrate a small test batch first and keep originals until verified.

MinIO is a self-hosted option; managed S3-compatible storage may reduce
operations. Choose based on hosting, durability, backup, cost, latency
and multi-server requirements.

### 3.9 Redis

Only add Redis after identifying a specific limitation: - Shared cache
across multiple app instances. - Shared rate limiting across
instances. - Cross-process SSE event distribution. - Queue/stream
throughput beyond the existing outbox worker.

Keep MySQL authoritative. Choose one Redis use case and primitive at a
time. Redis Pub/Sub is not durable; critical events need an outbox or
durable stream. Define authentication, private network access, TTLs,
eviction, key namespace, failure fallback, monitoring and restart
behavior. Test Redis being unavailable. Do not install Redis merely
because the application should scale.

### 3.10 SSE

Use SSE for one-way server-to-browser updates: order/payment status and
admin notifications are the best initial candidates.

-   Emit only after the authoritative DB transaction commits.
-   Authenticate each connection and authorize the subscribed
    order/admin channel.
-   Send minimal payloads; fetch full current state through REST.
-   Add heartbeats, reconnect behavior, resource limits and safe
    buffering/timeouts.
-   Never put long-lived secrets in query strings.
-   Test cross-customer isolation and reconnect/recovery.
-   SSE must not create orders, mutate data or prove payment.
-   Confirm the actual host supports long-lived HTTP connections. PHP
    SSE connections can occupy workers; use a dedicated stream
    service/process if the target load and hosting require it.
-   REST must continue to work if SSE is unavailable.

### 3.11 Background work

Keep validation, authoritative totals, stock reservation, durable order
creation and payment verification synchronous. Move email, cleanup,
order expiry and non-critical notifications to background processing
only after durable state is saved.

Initially reuse the existing database outbox and scheduled scripts. Move
the pending-order sweep off the checkout hot path only after verifying
expiry/release semantics and reliable scheduling.

------------------------------------------------------------------------

## 4. Technology-specific acceptance criteria

### TanStack Query

-   Compatible versions verified against the actual Next.js/React
    versions.
-   Correct query keys, user isolation, invalidation and retry rules.
-   No redundant/conflicting browser cache without an explicit reason.
-   Loading/error/empty states and cancellation handled.
-   No unsafe retries of checkout/payment mutations.

### Zustand

-   A concrete shared-state problem is solved.
-   No duplication of server state already owned by TanStack Query.
-   Persistence/merge is validated if used.
-   No sensitive tokens or trusted prices/stock persisted.
-   If no meaningful need exists, document the decision to skip it.

### Resend

-   Existing outbox remains durable.
-   Checkout does not wait for email delivery.
-   Retry/deduplication and worker concurrency are safe.
-   API key is server-only and sender domain is verified.
-   Provider failures are visible and recoverable.

### S3-compatible storage / MinIO

-   Upload validation and access control remain secure.
-   Product images load from the chosen store.
-   Object keys/metadata and URL strategy are stable.
-   Migration and rollback are documented.
-   Backup/recovery and storage limits are understood.

### Redis

-   A measured use case is approved.
-   MySQL remains authoritative for business records.
-   TTL/durability/failure behavior is documented.
-   Authentication/network isolation and monitoring are in place.
-   Cold cache, outage and restart are tested.

### SSE

-   Authorized clients receive only permitted events.
-   Events are emitted after commit.
-   Reconnect and REST recovery work.
-   Hosting supports target connection count.
-   No resource leak, cross-user data leakage or dependency on SSE for
    order correctness.

------------------------------------------------------------------------

## 5. Chronological prompt-by-prompt plan

**Every prompt below is a separate task. The agent must stop after each
one.** If an audit proves a technology unnecessary, report the evidence
and ask the owner whether to skip it. Do not silently install it.

### Phase 0 --- Read-only audit and baseline

#### Prompt 0 --- Read the roadmap only

> Read this roadmap fully. Do not run commands, edit files, install
> packages, run migrations, contact external services or deploy.
> Summarize the architecture, technologies, phase order and execution
> rules. Wait.

#### Prompt 1 --- Verify the active repository

> Inspect the repository and relevant documentation read-only. Verify
> package versions/scripts, PHP/runtime assumptions, current client
> state, API/cache layers, upload storage, outbox/worker,
> payment/webhook flows, tests and deployment constraints. Do not modify
> files. Report verified facts, gaps and assumptions. Wait.

#### Prompt 2 --- Establish safe baseline

> Verify test scripts and confirm tests use isolated data. Run safe
> documented typecheck/lint/build/API tests and record actual results.
> Measure available performance metrics without production access. Do
> not fix failures or install tools. Stop.

#### Prompt 3 --- Map dependencies and rollout

> Produce a read-only map showing where TanStack Query, Zustand, Resend,
> S3-compatible storage, Redis and SSE would integrate, dependencies
> between them, rollout/rollback and likely risks. Identify which are
> mandatory fixes versus optional infrastructure. No code changes. Wait.

### Phase 1 --- Remove existing bottlenecks

#### Prompt 4 --- Audit SQL and API performance

> Inspect representative catalog/product/admin/checkout queries,
> indexes, duplicate requests and transaction boundaries. Use safe query
> plans/metrics where available. Do not modify code/schema. Report
> evidence-backed bottlenecks.

#### Prompt 5 --- Implement one approved performance fix

> Implement only the single owner-approved optimization from Prompt 4.
> Preserve API contracts and transactional correctness. Add regression
> tests, compare the same scenario before/after, report and stop.

#### Prompt 6 --- Audit current cache layers

> Map PHP file cache, HTTP headers/ETags, Next.js server cache, browser
> GET cache and deployment/CDN cache if any. Document TTL, key, privacy,
> invalidation and fallback. Do not add Redis or change code.

#### Prompt 7 --- Fix one approved cache/invalidation issue

> Implement only the approved existing-cache fix. Commit DB changes
> before invalidation. Do not publicly cache private/admin/order/payment
> data. Test cache hits/misses and admin-write freshness. Stop.

### Phase 2 --- TanStack Query, one feature at a time

#### Prompt 8 --- Audit client-side server state

> Identify client components with server data fetches and determine
> whether duplicate requests, inconsistent loading/errors or poor
> invalidation justify TanStack Query. Separate server-rendered data
> from client queries. Do not install it.

#### Prompt 9 --- Add the QueryClient foundation

> If explicitly approved, install a compatible TanStack Query version
> and add the minimal correct provider/query-client setup for this App
> Router project. Avoid sharing a server QueryClient between users. Do
> not migrate features yet. Test typecheck/lint/build and stop.

#### Prompt 10 --- Migrate one client query

> Migrate only the single feature approved by the owner. Define query
> keys, stale/gc policy, retry/cancellation, and loading/error/empty
> states. Do not migrate homepage server data or other features. Test
> and stop.

#### Prompt 11 --- Add mutation invalidation for that feature

> Implement only the related query invalidation/update behavior. Test
> success, validation failure, network failure and user/account
> switching. Do not migrate another feature. Stop.

#### Prompt 12 --- Migrate another approved query

> Migrate only the next owner-approved client-side data slice using the
> established conventions. Avoid duplicate caching with the existing API
> client. Test and stop. Repeat only when explicitly prompted.

### Phase 3 --- Zustand, only if justified

#### Prompt 13 --- Audit shared client state

> Inspect cart/wishlist, React context, local storage, modals/drawers
> and component state. Identify the exact shared-state problem Zustand
> would solve. Do not install it. Recommend a small store or skipping
> Zustand.

#### Prompt 14 --- Add one approved Zustand slice

> If approved, install compatible Zustand and implement only the
> selected state slice. Keep server state in TanStack Query, avoid
> secrets and duplicated derived state, and preserve behavior. Test and
> stop.

#### Prompt 15 --- Verify persistence/cart merge if applicable

> If the approved slice involves cart persistence, implement only the
> agreed persistence and guest-to-account merge rules. Test
> stale/deleted products, quantity limits, duplicate merges, logout and
> account switching. Never trust local prices/stock. If unnecessary,
> report and skip.

### Phase 4 --- Resend and asynchronous email

#### Prompt 16 --- Audit outbox delivery

> Inspect MailService, templates, outbox schema, retries, deduplication,
> leases/locking, worker script and immediate-send configuration.
> Determine whether email can block checkout or workers race. Do not
> expose secrets or modify code.

#### Prompt 17 --- Make outbox processing asynchronous

> Implement only the approved change to persist email jobs after
> transaction commit and remove synchronous email delivery from critical
> checkout/payment paths. Preserve templates, retries and deduplication.
> Do not add Resend yet. Test failure/retry and stop.

#### Prompt 18 --- Integrate Resend transport

> If approved, add Resend behind the existing mail abstraction. Keep the
> API key server-only; preserve the outbox and retry logic. Use safe
> test recipients, do not send customer email or switch production
> traffic. Test provider failure handling and stop.

#### Prompt 19 --- Document sender setup and monitoring

> Document verified sender-domain, SPF/DKIM/DMARC, environment setup,
> retry monitoring and permanent-failure handling. Do not change DNS or
> production secrets. Stop.

### Phase 5 --- S3-compatible storage / MinIO

#### Prompt 20 --- Audit uploads and image delivery

> Inspect upload validation, local storage, image URLs, Next.js image
> config, cache headers, private/public access and backups. Determine
> whether local disk is a real scaling risk. Do not install an SDK or
> move files.

#### Prompt 21 --- Recommend storage target

> Compare current storage, managed S3-compatible storage and MinIO using
> actual hosting, durability, backup, latency, cost and operational
> constraints. Recommend one and wait for approval. Do not create
> accounts/buckets.

#### Prompt 22 --- Add storage abstraction

> If approved, add a small storage interface while keeping the current
> storage active. Do not migrate assets. Preserve validation and URLs;
> test upload/read/delete/error/path safety. Stop.

#### Prompt 23 --- Configure chosen S3-compatible provider

> If approved, implement only the selected provider
> adapter/configuration. Keep credentials server-side, use least
> privilege, generate safe object keys and distinguish public product
> images from private uploads. Use test configuration only. Do not
> migrate production files.

#### Prompt 24 --- Test a small media migration

> If separately approved, migrate only a test batch, verify object
> count/content/metadata and rendered URLs, and keep originals. Full
> production migration requires separate approval, backup and rollback
> plan.

#### Prompt 25 --- Optimize image delivery

> Implement only approved responsive sizing, dimensions, modern formats,
> lazy loading, hero priority, cache-busting or CDN configuration.
> Preserve design and upload security. Measure image bytes/LCP before
> and after. Stop.

### Phase 6 --- Redis, only for an approved use case

#### Prompt 26 --- Redis go/no-go analysis

> Use measurements and hosting limits to decide whether Redis is needed
> for shared cache, shared rate limiting, event distribution or queue
> throughput. Compare the existing file cache/MySQL outbox and simpler
> alternatives. Do not install Redis. Wait for owner decision.

#### Prompt 27 --- Configure Redis for one purpose

> After explicit approval, add Redis for one named use case only.
> Document keys, TTL/eviction or stream semantics, security, fallback,
> monitoring and recovery. Keep MySQL authoritative and the outbox
> durable. Test outage/restart. Stop.

#### Prompt 28 --- Migrate one approved cache namespace

> If shared cache is approved, migrate only the named namespace. Define
> invalidation and fallback, protect private data, and test cold start,
> Redis outage and stale entries. Do not migrate every cache.

#### Prompt 29 --- Redis event distribution if approved

> If approved for SSE, publish only committed state changes through the
> selected Redis primitive. Plain Pub/Sub is transient, so provide REST
> recovery or a durable outbox/stream for important events. Test
> duplicate/reconnect/outage. Do not introduce another Redis use case.

#### Prompt 30 --- Queue scaling decision

> Determine whether the current MySQL outbox is insufficient at measured
> throughput. If Redis-backed queueing is approved, specify durability,
> retries, idempotency, worker claims, dead-letter handling and
> migration first. Do not replace the outbox merely for convenience.

### Phase 7 --- SSE live updates

#### Prompt 31 --- Confirm hosting suitability

> Inspect actual hosting, PHP worker limits, proxy buffering/timeouts,
> persistent-process support and cross-origin setup. Compare SSE with
> simple polling for the first use case. Do not implement SSE or Redis
> during this audit.

#### Prompt 32 --- Define first SSE contract

> Design only the approved first use case, preferably payment/order
> status or admin new-order notifications. Specify event names, minimal
> payload, authentication, authorization, commit-before-publish, REST
> recovery, reconnect/heartbeat, limits and tests. Do not code.

#### Prompt 33 --- Implement first SSE slice

> Implement only the approved SSE endpoint and client for that use case.
> Authenticate and authorize subscribers, emit only after commit,
> prevent cross-customer leakage, provide REST fallback and handle
> reconnect/heartbeat. SSE must not verify payment or mutate orders.
> Test and stop.

#### Prompt 34 --- Connect post-commit event publishing

> If approved, connect the persisted state change to the SSE delivery
> path using the simplest viable design. Do not introduce Redis unless
> separately approved. Handle duplicate/out-of-order events and process
> restarts. Stop.

#### Prompt 35 --- Measure SSE load

> Test concurrent connections in isolated/staging. Measure connection
> count, memory/CPU, event latency, reconnect behavior and PHP worker
> use. Never load-test production. Report whether the host can support
> the target.

### Phase 8 --- Scaling tests

#### Prompt 36 --- Design safe load test

> Design synthetic workloads for catalog/search/product, checkout
> contention, webhook duplication, outbox backlog, object storage and
> SSE if implemented. Define ramp-up, metrics and stop conditions. Do
> not target production or live payment providers.

#### Prompt 37 --- Run approved load test

> Run only the owner-approved test in isolated/staging. Record
> concurrency, throughput, p50/p95/p99 latency, errors, CPU/memory, PHP
> worker saturation, DB locks/connections, cache hit rate, outbox age
> and SSE metrics as applicable. Do not tune mid-test.

#### Prompt 38 --- Fix one measured bottleneck

> Implement only the single approved fix based on results. Repeat the
> same load scenario and compare before/after. Do not add multiple
> technologies or change unrelated layers. Stop with measured results.

#### Prompt 39 --- Review security and failure modes

> Review authentication, authorization, cache privacy, uploads, provider
> signatures, outbox retries, Redis access, SSE subscriptions and secret
> handling for implemented features. Read-only first; wait for approval
> before fixing findings.

### Phase 9 --- Production readiness

#### Prompt 40 --- Audit deployment compatibility

> Verify frontend/backend hosting, PHP runtime, MySQL, cron/worker
> support, storage provider, Redis availability, SSE limits, HTTPS,
> CORS, webhooks and mail configuration. Document real constraints. Do
> not deploy, alter DNS or change production secrets.

#### Prompt 41 --- Backup, recovery and runbooks

> Document and, only if explicitly approved, test backups/restores in an
> isolated environment, migration rollback limits, outbox/cron
> monitoring, Redis recovery if used, email provider outage, SSE outage
> and payment reconciliation. Never overwrite production data.

#### Prompt 42 --- Final release gate

> Run the owner-approved test matrix: typecheck/lint/build, PHP/API
> tests, checkout concurrency/idempotency, payment sandbox/webhooks,
> cache invalidation, outbox retries, TanStack Query invalidation,
> Zustand persistence/merge if used, object storage if used, Redis
> outage if used, SSE auth/reconnect/load if used, and staged smoke
> tests. Report actual results and unresolved risks. Do not deploy
> unless separately prompted.

------------------------------------------------------------------------

## 6. Rollout rules

-   Implement one technology or one narrow feature at a time.
-   Use small branches and reviewable diffs.
-   Introduce adapters before replacing a provider.
-   Keep the old path until the new path is tested in staging.
-   Use flags/configuration for gradual rollout where appropriate.
-   Never change cache, queue, checkout and payment logic
    simultaneously.
-   Every technology must have an approved purpose, an operational plan
    and tests for its failure mode.

## 7. Acceptance checklist

  -----------------------------------------------------------------------
  Technology                          Proof required
  ----------------------------------- -----------------------------------
  TanStack Query                      Correct
                                      keys/invalidation/retry/user
                                      isolation; no unexplained duplicate
                                      cache

  Zustand                             Concrete shared-state need solved;
                                      no duplicate server state or
                                      sensitive persistence

  Resend                              Outbox remains durable; async
                                      delivery/retry/deduplication works;
                                      secret stays server-side

  S3-compatible storage/MinIO         Safe uploads/access; assets render;
                                      stable keys; backup and rollback
                                      documented

  Redis                               Measured need; secure
                                      configuration; failure fallback;
                                      correct TTL/durability; MySQL
                                      remains authoritative

  SSE                                 Authorized post-commit events;
                                      reconnect/REST recovery; no
                                      cross-user leakage; host handles
                                      load

  Overall scale                       Same load scenario measured
                                      before/after; latency/errors
                                      reported; no payment/stock
                                      regression
  -----------------------------------------------------------------------

## 8. Owner decisions required at the relevant phase

Do not guess: - Actual frontend/backend hosting and support for
long-running SSE connections/workers. - Target concurrency and
acceptable p95/p99 latency. - Resend approval and verified sender
domain. - Managed S3-compatible storage versus self-hosted MinIO. -
Whether Redis is available and which measured use case it should
solve. - First SSE use case. - First TanStack Query migration target. -
Whether the current cart/state architecture truly needs Zustand. -
Storage migration scope and rollback approval. - Payment sandbox
readiness and live-payment authorization. - Business rules for
shipping/tax/expiry where not already defined in code.

## 9. Owner prompt template

> **Execute Prompt \[NUMBER\] --- \[TITLE\] from
> `ECOMMERCE_IMPLEMENTATION_ROADMAP.md`.**
>
> Follow the execution contract. Work only on this prompt. Inspect
> relevant files first. Preserve existing functionality and contracts.
> Do not implement future prompts, install unrequested dependencies, run
> destructive operations, use production data/live credentials, or
> deploy. Run relevant safe tests, report exact files and observed
> results, then stop and wait for my next prompt.

## 10. Definition of done

A task is complete only when its exact scope is implemented, relevant
tests actually run, compatibility and data integrity are checked,
security/failure modes are considered, documentation is updated where
needed, and the agent stops.

The system is ready for higher traffic only after measured tests
demonstrate correct transactional checkout, no overselling under
concurrency, coordinated public caching, private-data isolation, durable
asynchronous email, recoverable storage and jobs, documented
dependency-outage behavior, reliable scheduled tasks, backup/rollback
readiness and measured performance under representative load.

**The objective is measured capacity and graceful degradation---not
simply adding technologies.**
