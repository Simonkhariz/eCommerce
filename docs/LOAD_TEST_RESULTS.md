# Load test results (roadmap Prompt 37)

Run of `docs/LOAD_TEST_PLAN.md`, option A chosen by the owner: OPcache on, 1-minute browsing
steps, all five scenarios. 29 October 2026, on the development PC (4 cores, 16 GB RAM) with the
throw-away `shopco_load` database (50 categories, 4,000 products, 8,500 variants, 2,000 customers,
5,000 past orders). API on a temporary Apache (mod_php, 150 threads), storefront `next start`,
made-up provider keys and local stand-ins only. Raw results: `backend/storage/loadtest/2026-10-29-optionA/`
(git-ignored).

The load generator, storefront, API and MySQL shared the same 4 cores, so these are a baseline
for finding limits, not the production maximum. Repeat on staging once hosting is chosen.

**How the run went:** two earlier attempts were invalid (the PC went to sleep, then low memory).
Option A ran S1-S3 from 22:08, was interrupted by a session restart at the start of S4, and S4-S5
plus a clean S2a re-run completed at 23:52. Integrity checks passed after every scenario, and no
deadlocks were recorded.

## Against the targets

| Target (plan section 6) | Measured | Result |
|---|---|---|
| 50 shoppers: catalogue API p95 < 300 ms, pages p95 < 1 s | API p95 36-77 ms, pages p95 68-144 ms, 0 errors | Pass |
| 30 checkouts at once: order p95 < 1.5 s, zero oversell | Order p95 316 ms, 0 errors; oversell test: exactly 20 of 100 sold | Pass |
| Errors (excluding designed 429s) < 0.5% | 0% in every scenario except the cold image burst (below) | Pass |
| Webhooks: 0 double payments, 0 duplicate emails | 200 orders paid once, 200 emails; under/overpaid handled | Pass |
| 20,000-email backlog drained < 10 min with 4 workers | 141 s with 4 workers (265 s with 1) | Pass |
| Browsing p95 rises < 20% during the backlog | 91 ms → 142 ms (1 worker), 168 ms (4 workers): +56% / +85% | Fail (still far below 300 ms); **passes after the fixes: +19%** (see "Fixes and re-test") |

## S1 Browsing (requests mixed 60/40 storefront pages / API)

| Shoppers | Cache on: req/s, p95 (p99) | Cache off: p95 (p99) | Apache busy (on / off) |
|---|---|---|---|
| 5 | 2.3, 80 ms (92) | 118 ms (169) | 6 / 5 |
| 10 | 4.8, 83 ms (157) | 114 ms (169) | 7 / 7 |
| 25 | 12.3, 101 ms (278) | 110 ms (185) | 14 / 14 |
| 50 | 24.4, 104 ms (183) | 112 ms (196) | 17 / 26 |
| 100 | 48.7, 216 ms (621) | 161 ms (716) | 38 / 41 |
| 150 | 71.3, 434 ms (946) | 364 ms (1,274) | 32 / 91 |

No errors at any step. At 150 shoppers the API stayed at p95 35-59 ms (cache on) while storefront
pages rose to p95 321-696 ms: page rendering in the storefront grows first. With the cache off,
API p95 rose to 80-350 ms and Apache needed up to 91 workers.

## S2 Checkout

- **S2a, 100 buyers at once for one item with 20 in stock (clean re-run):** 20 orders, 80 "insufficient
  stock" answers, stock 0, 20 units in the new orders. p95 2.66 s, because all 100 wait on the same
  stock row. All 80 refusals showed an out-of-date "Available: N" number (see findings).
  The first S2a attempt sold 46: older test orders for the same item expired during the test and
  correctly returned 26 units (20 + 26 = 46, exact, never below 0).
- **S2b, 30 buyers for 3 minutes alongside 25 shoppers:** 3,481 orders, 13,924 requests (76 req/s),
  0 errors. p95: cart check 247 ms, delivery quote 191 ms, order 316 ms, WhatsApp payment start
  220 ms. 2 database lock waits (2 ms in total). Browsing alongside: p95 198 ms.

## S3 Payment webhooks

210 orders, 990 webhooks in 13 s (each Kora notice 5 times, each Monnify notice 3 times, random
order, plus late "failed" notices and bad signatures). 200 orders paid exactly once with exactly
200 payment emails; 5 underpaid stayed unpaid and flagged; 5 overpaid were paid and flagged for a
refund; late "failed" notices changed nothing; 20 bad signatures answered 401. 0 server errors,
p95 663 ms.

## S4 Email backlog (log transport, 25 shoppers browsing throughout)

| Phase | Duration | Browsing p95 (p99) |
|---|---|---|
| Before backlog | 60 s | 91 ms (1,174) |
| Queueing 20,000 | 97 s (206 emails/s) | 125 ms (416) |
| Draining, 1 worker | 265 s (75 emails/s) | 142 ms (856) |
| Queueing 20,000 again | 97 s | 106 ms (196) |
| Draining, 4 workers | 141 s (142 emails/s) | 168 ms (488) |
| After backlog | 30 s | 66 ms (93) |

All 20,000 sent exactly once (attempt count 1). These are back-to-back worker runs. In production
each `process_outbox.php` run sends at most 500, so a once-a-minute scheduled worker delivers at
most 500 emails a minute (20,000 takes 40 minutes with one, 10 with four).

## S5 Pictures

- **50 uploads at once:** to disk 50/50, p95 889 ms; to the stand-in S3 bucket 50/50, p95 928 ms.
  GPS removed from all 26 photos that carried it.
- **200 first-time image requests at once (`/_next/image`, AVIF):** all 200 hit the test's 30 s limit
  before any image finished. The repeat burst took 4.5-5.1 s because the optimiser was still busy
  with the abandoned first burst. `/uploads` revalidation answers 304.

## Findings (candidates for Prompt 38, one fix at a time)

1. **Out-of-stock message shows a stale number.** `CheckoutService` reads the remaining stock for
   the message inside the same transaction as the failed reservation, so it sees the value from
   the start of the request. Customers can read "Available: 9" when none is left. Nothing is ever
   oversold; only the message is wrong.
2. **A burst of never-seen image sizes stalls every image.** The optimiser works on all of them
   at once (AVIF encoding is CPU-heavy) and none finishes early. Matters after a deploy or cache
   clear on a busy page.
3. **Storefront page rendering is the first part to slow** (p95 0.3-0.7 s at 150 shoppers while the
   API stays under 0.1 s). Within target; worth re-measuring on real hosting.
4. **Email backlog slows browsing by 50-85%** in relative terms (still under 170 ms p95).
5. **Scheduled email throughput is 500 per minute per worker** by design (`--limit` is capped at 500).

## Why the backlog target failed

Measured per phase (CPU per process, per request type):

- Only the slow tail moved. The median request stayed at 24-29 ms in every phase; p95 rose mostly on
  database-heavy calls (category API 90 → 313 ms, search API 103 → 412 ms).
- The workers ran flat out with no pacing: 75 emails/s for one worker, 142/s for four. Each run
  sends up to 500 and the test started the next run at once. Total CPU went from 45% to 78% (one
  worker) and 92% (four workers, peaks at 98%) on the 4 cores shared with the shop.
- Four workers fought over the same emails: each took the same oldest 500 and claimed them in
  the same order, giving 3,282 row-lock waits and 1,018 queries/s in 141 s.
- The biggest cost was outside the shop: the test used the "write emails to a log file" mode,
  and Windows Defender rescanned the growing log (178 MB) after every write. At only 10 emails a
  second Defender used 97% of a core, against 8-13% for MySQL and about 2% for the worker itself
  (1.2 CPU seconds per 500 emails). A live shop sends through Resend over HTTPS and writes no file.
- The queueing phase was also unrealistic: the test queued 20,000 emails one at a time (97 s);
  the admin newsletter queues them in one transaction (11 s for 20,000).

## Fixes and re-test (30 October 2026)

Same PC and settings (OPcache on, 1-minute steps). Raw files: `results/b-*` and `results/c-*`
next to the option A files. Run B tested the fixes with the log-file mail mode; run C repeated
S1 after one change was withdrawn and ran S4 through a local stand-in for Resend (100 ms per
email, nothing written to disk).

| Finding | Fix | Before | After |
|---|---|---|---|
| 1. Stale stock number in the out-of-stock message | `CheckoutService` reads the stock for the message with a locking read (the latest committed value) | 80 of 80 refusals showed "Available: N" | 0 of 80; all say "Available: 0"; still exactly 20 sold |
| 2. Burst of first-time pictures stalls | `next.config.mjs`: WebP only, no AVIF (AVIF files are ~20% smaller but far slower to make) | 200 first-time sizes: all over 30 s; repeat burst 4.5-5.1 s | All 200 in 7.5 s; repeat burst 0.1-0.4 s; 0 errors |
| 4. Email backlog slows browsing | `process_outbox.php --max-seconds --rate`, batch taken in random order so workers do not queue on the same row | +56% (1 worker), +85% (4 workers) | Recommended schedule (1 worker, 8/s): 73 → 87 ms, **+19%**. 4 workers at 8/s each: +45% |
| 5. 500 emails per scheduled run | `--max-seconds=50`: one run keeps taking batches for up to 50 s | 500 a minute, flat out | ~390 a minute at 8/s: Resend's limit, not the worker, now sets the pace |

**Found while fixing 5:** Resend allows **10 requests a second per account** by default
(resend.com/docs/api-reference/rate-limit). Before this change a "too many requests" answer
counted as a failed attempt, and an email is marked failed after 5 attempts, so a newsletter sent
faster than the limit could have lost emails. Now that answer leaves the email's attempts
untouched, retries it a minute later and stops the run (`stopped=rate-limited`). Tested in
`ResendTransportTest` (a used-up daily quota is still counted, so it cannot retry forever).

**What this means for newsletters:** at the recommended 8 a second, 1,000 subscribers take about
2 minutes and 20,000 about 42. The plan's "20,000 in under 10 minutes" needs a higher limit from
Resend (raise `--rate` and add workers after Resend raises it), or Resend's batch endpoint
(100 emails per request). That would be a new feature, not part of these fixes.

**Withdrawn after measuring (finding 3):** caching each product page for 60 s (ISR) made things
worse. With 4,000 products almost every visit was a first visit that built the page and wrote it
to disk: product page p50 41 → 61 ms at 5 shoppers, and at 100-150 shoppers the whole storefront
slowed to p95 2.8-4.3 s. Reverted. Re-run without it (run C): 50 shoppers p95 96 ms, 100 shoppers
181 ms (option A: 104 / 216 ms), 0 errors. The 150-shopper step was slower than in option A (767 ms
against 434 ms) because the owner's development servers were running this time; the PC sat at
about 29% CPU before the test started. Storefront rendering remains the first part to slow: a
rendering limit, to re-measure on real hosting.

**Checks:** integrity clean after every scenario; no deadlocks; 0 server errors. During run C the
Resend stand-in counted 10 addresses that received two emails. Cause: 240 test newsletters left
over from the Defender measurement were picked up by the API's once-a-minute retry before the
new 20,000 were queued, and the queue step then replaced them. These were two different
newsletters to the same 10 test addresses. Two clean repeats (1,500 and 2,000 emails, four
workers alongside the API's retry run) delivered every email exactly once.

## S6 Live payment status (Prompt 35, 31 October 2026)

Same rig: temporary Apache :8150, `shopco_load`, OPcache on. Live status switched on in the rig
only. Full results and the host sizing are in `docs/SSE_CONTRACT.md` §13; raw files
`results/sse35-before*.json` and `results/sse35*.json`.

| Open streams | 0 | 8 | 32 | 64 |
|---|---|---|---|---|
| Apache workers / database connections | 6 / 3 | 14 / 12 | 38 / 35 | 70 / 68 |
| Apache memory | 74 MB | 88 MB | 121 MB | 168 MB |
| Browsing p95 alongside, errors | 38 ms, 0 | 36 ms, 0 | 42 ms, 0 | 44 ms, 0 |
| "Paid" after the commit, slowest | | 1.87 s | 1.97 s | 1.75 s |

**Fixed and re-measured** (commit cb6d907):
- A closed tab held its slot for 31 s; now 7–8 s, with a 5 s heartbeat instead of 15 s.
- After a restart, live status stayed off for 117 s; now it is back as soon as Apache is, because
  slots are renewed by live streams and lapse 30 s after the last renewal.
