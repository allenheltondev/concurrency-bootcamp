# Concurrency Bootcamp

A mobile-first, dependency-free web app for learning and practicing JavaScript
concurrency. It opens with an illustrated **Lessons** primer (23 stepped
chapters with animated HTML/CSS diagrams — tap ▶ replay to watch each sequence
step through — one animated lesson for **every** concept the drills test: the
event loop and task ordering, the await-race hazard, each primitive (mutex,
semaphore, latch/barrier, condition variable, atomic/CAS lock, read-write lock,
run-once), workers/atomics, the problem patterns (producer-consumer &
backpressure, ordering, bounded concurrency, deadlock & lock ordering, rate
limiting, select), the async toolkit (debounce/throttle, Promise.all, retry,
memoize, cancellation), durable replay, and blocking vs non-blocking vs async),
then seven hands-on modules: the event-loop model
(predict-output quiz), building
synchronization primitives — mutex, semaphore, latch, barrier, async queue,
sequencer, condition variable, atomic lock (CAS), read/write lock, run-once
(tap-to-choose drills that run real reference code), a workers/atomics
data-race demo, trade-off flashcards, a problem bank (print-in-order,
concurrency pool, dining philosophers, token bucket, bounded blocking queue,
select / first-ready, and the concurrent log processor with fault tolerance),
an interview kit (debounce, throttle, `Promise.all` from scratch,
retry-with-backoff, async memoize / dedup, cancel-the-loser timeout, and
cancel-on-first-error / errgroup), and a durable-execution module modeling
workflow-engine (Temporal-style) concurrency hazards: deterministic replay,
durable timeouts, serializing concurrent signals, and waiting on a signal
predicate. A **Test mode** then quizzes you across everything — shuffled
options, first answer counts, scored — as a real readiness check.

Drill and quiz modules step one card at a time (prev · n/total · next) for
one-handed mobile use; every tapped answer — right or wrong — explains itself.

Everything is tap-driven so it works one-handed on a phone. No accounts, no
backend, no third-party scripts, no tracking.

## Files

| File            | What it is                                                                 |
| --------------- | ------------------------------------------------------------------------- |
| `index.html`        | The whole app — inline CSS + JS, no build step.                        |
| `worker.js`         | Same-origin Web Worker for the real SharedArrayBuffer data race.       |
| `sw.js`             | Service worker — precaches the app shell so it runs fully offline.     |
| `manifest.webmanifest`| Web app manifest — makes the site installable to a home screen.      |
| `icon.svg`          | App / home-screen icon (the event loop, with ordered + racing tasks). |
| `workers-atomics.js`| Node (`worker_threads`) logic reference — run it to see the race.      |
| `template.yaml`     | SAM/CloudFormation: S3 + CloudFront + OAC + COOP/COEP + ACM + Route53. |

## Progress & offline

Progress is saved to `localStorage` — solved drills, answered quiz questions, and
your place in every module (lessons, quizzes, drills) — so you resume exactly where
you left off. **Reset progress** in the footer clears it all. No accounts, no sync.

The app is an installable PWA. A service worker (`sw.js`) precaches the app shell on
first visit, so after that it loads instantly and works with **no network** — open
it on a flight or a subway. It uses stale-while-revalidate, so it's offline-first but
still pulls the latest build in the background when you're online; caching the real
CDN responses preserves the COOP/COEP headers, so the workers/atomics module keeps
its cross-origin isolation even offline. The service worker needs a secure context
(HTTPS or `localhost`); opening `index.html` from `file://` skips it (the app still
runs, just without offline caching).

## The cross-origin-isolation unlock

The workers/atomics module runs a **real** data race — actual `Worker` threads
incrementing a shared `Int32Array` over a `SharedArrayBuffer`, losing updates with
`view[0] = view[0] + 1` and staying exact with `Atomics.add`.

Real `SharedArrayBuffer` requires the page to be **cross-origin isolated**, which
needs two response headers on the HTML:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

S3 object metadata can't set these, so they come from a CloudFront **Response
Headers Policy** (`IsolationHeadersPolicy` in `template.yaml`). The app has zero
cross-origin resources, so COEP `require-corp` is painless — `worker.js` is
same-origin and needs no CORP header.

If isolation is unavailable (e.g. opening `index.html` from `file://`), the module
**falls back** to a stepwise interleaving simulation and shows a note — the page
never breaks. Confirm the real path with `crossOriginIsolated === true` in the
console on the deployed origin.

## Deploy

Deployment is fully automated by GitHub Actions (`.github/workflows/deploy.yml`):
every push to `main` (or a manual **Run workflow**) runs `sam deploy`, uploads the
site, and invalidates `/*`. It authenticates to AWS via OIDC (`AWS_DEPLOY_ROLE_ARN`)
and deploys in `us-east-1` — where CloudFront's ACM certificate must live.

To add or rename a deployed file, update the **Upload site to S3** step in that
workflow — it's the single source of truth for what ships.

### Architecture

- **S3** bucket, Block Public Access on, no ACLs — holds `index.html` + `worker.js`.
- **CloudFront** with Origin Access Control (bucket stays private), HTTPS
  redirect, `DefaultRootObject: index.html`, HTTP/2+3.
- **Response Headers Policy** adds COOP/COEP on every response.
- **ACM** certificate, DNS-validated automatically via Route53.
- **Route53** A + AAAA aliases for the custom domain.

## Local development

Open `index.html` directly, or serve the folder. A plain static server is **not**
cross-origin isolated, so the workers module uses the simulation fallback locally.
To exercise the real threaded path locally, serve with the two isolation headers,
e.g.:

```bash
npx http-server -p 8080 \
  --header "Cross-Origin-Opener-Policy: same-origin" \
  --header "Cross-Origin-Embedder-Policy: require-corp"
```

(then open http://localhost:8080 — `crossOriginIsolated` should be `true`).

To see the race on the command line (no browser needed):

```bash
node workers-atomics.js 4 5   # 4 threads, 5,000,000 increments each
```
