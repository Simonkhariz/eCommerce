# Release gate (roadmap Prompt 42)

30 October 2026, branch `scalability-phase1` (not merged, not pushed; the owner tests before
merging). Nothing was deployed. Live checks ran on an isolated copy only: a temporary Apache on
:8150 with the throw-away `shopco_load` database (4,000 products), the production build of the
storefront on :3100, and made-up provider keys with local stand-ins. Raw output:
`backend/storage/loadtest/2026-10-30-gate/` (git-ignored).

## Results

| Check | Result |
|---|---|
| PHP syntax, every backend file (105) | Pass |
| Typecheck (`npm run typecheck`) | Pass |
| Lint (`npm run lint`) | Pass, 0 problems (after excluding a downloaded, git-ignored site bundle that held all 1,093 reported problems) |
| Web unit tests (`npm run test:web`) | 13 / 13 |
| API test suite (`php backend/tests/run.php`) | 837 / 837 in 16 suites |
| Production build (`next build`) | Pass, 0 warnings |
| Storefront smoke test through the production build (`smoke.mjs`) | 30 / 30. Every page, 404s, old admin links, the API through the storefront proxy (caching headers, 304, no-store for accounts, CSRF refusal, a made-up X-Forwarded-For), pictures, WebP from the optimiser, other sites' pictures refused. Product pages p95 27 ms |
| Admin in a real browser (`admincheck.mjs`, `reqcount.mjs`) | 9 / 9. Sign-in, bell counts loaded once, in-app moves load the screen's own data without asking for the bell again, sign-out sends admin screens to sign-in, no page errors |
| Checkout concurrency: 100 buyers at once for 20 units | Pass: exactly 20 orders, 80 refused, stock 0, every refusal says "Available: 0", p95 1.4 s |
| Payment webhooks: 990 notices (each Kora notice 5 times, each Monnify notice 3 times, late "failed" notices, bad signatures) | Pass: 200 orders paid exactly once with 200 emails; under- and overpaid handled; 20 bad signatures refused (401); 0 server errors |
| Cache invalidation (admin change → shop) | Pass (`CacheRefreshTest`, 40) |
| Email outbox retries, pacing, rate limits | Pass (`MailAsyncTest`, `MailOutboxTest`, `ResendTransportTest`: 102) |
| Picture storage (bucket driver, migration, rollback) | Pass against a stand-in S3 (`S3StorageTest`, `MediaMigrationTest`: 87) |
| Backups and restores (mysqldump and PHP-only) | Pass (`UploadsTest`, 43) |
| Integrity after the live checks | 0 negative stock, 0 orders paid twice, 0 duplicate payment emails, 0 emails sent twice, no deadlocks |
| Zustand, Redis, SSE | Not used (owner decisions); nothing to test |

Fixed during the gate: `npm run lint` failed because ESLint also read a downloaded copy of
another site's bundle (`kravio-dashboard.vercel.app`, git-ignored); it is now excluded.
The other failures found were mistakes in the new check scripts (a `/checkout` page that does not
exist: checkout is on the cart page; sign-out called without `?scope=admin`) and an incomplete
copy of `node_modules` in the isolated build folder; corrected and re-run.

## Not tested (needs the owner)

| What | Why not | What it needs |
|---|---|---|
| Payment sandboxes (real Kora and Monnify test calls and webhooks) | Never use or read the real keys from here; webhooks need a public address | Sandbox keys in the server's `backend/.env` and a public `https://` `APP_URL`, then one test payment per gateway |
| Real email delivery | Resend not set up | Resend domain and key (`docs/EMAIL_SETUP.md`) |
| Staging smoke test | No host yet | Run `smoke.mjs`-style checks and the load-test plan on the chosen host before launch |

## Unresolved risks

1. **Hosting not chosen.** Free options checked do not fit a shop that takes payments: Vercel's
   free plan forbids it, free cPanel hosts block webhooks and API calls, Oracle's free server may
   be reclaimed when idle (`docs/DEPLOYMENT.md`). Storefront on Vercel with the API elsewhere
   also needs a signed storefront header (not built) or customers share rate limits.
2. **Payments not tested against the real gateways** (stand-ins only; see above).
3. **Email** is in log-only mode until Resend is set up. At Resend's default of 10 emails a second
   per account, a 20,000-subscriber newsletter takes about 42 minutes.
4. **Scheduled jobs** (email, unpaid orders, database check, backup) are not set up anywhere yet.
5. **Capacity** was measured on a 4-core PC: 50 shoppers p95 about 0.1 s; at 150 the storefront
   reached p95 0.4-0.8 s. Re-measure on the real host.
6. **One server only:** the API's file cache and the storefront's page cache live on one
   server; several servers need shared caching first.
7. **Pictures** are on the server's disk; Cloudflare R2 is chosen but not set up. Off-server
   backup copies are the owner's step (`docs/BACKUPS.md`).
8. **OPcache** must be turned on at the host (halved response times in the load test).
9. **Redis and live updates (SSE)** were deferred (roadmap Prompts 27-30 and 32-35), not dropped.
10. Hero banners are 1200 px wide (soft on high-resolution screens); re-upload at 1800 px or more.
11. `AGENTS.md` (written by `next dev`) is untracked; commit it or leave it.

**Verdict:** the code passes every check that can run without a host and real provider keys.
It is ready for staging on the chosen host, not yet for customers: items 1-4 come first.
