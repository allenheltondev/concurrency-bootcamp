# Concurrency Bootcamp

A mobile-first, dependency-free web app for learning and practicing JavaScript
concurrency. Six modules: the event-loop model (predict-output quiz), building
synchronization primitives (tap-to-choose drills that run real reference code), a
workers/atomics data-race demo, trade-off flashcards, a problem bank, and an
interview kit (debounce, throttle, `Promise.all` from scratch, retry-with-backoff).

Everything is tap-driven so it works one-handed on a phone. No accounts, no
backend, no third-party scripts, no tracking.

## Files

| File            | What it is                                                                 |
| --------------- | ------------------------------------------------------------------------- |
| `index.html`        | The whole app — inline CSS + JS, no build step.                        |
| `worker.js`         | Same-origin Web Worker for the real SharedArrayBuffer data race.       |
| `workers-atomics.js`| Node (`worker_threads`) logic reference — run it to see the race.      |
| `template.yaml`     | SAM/CloudFormation: S3 + CloudFront + OAC + COOP/COEP + ACM + Route53. |
| `deploy.sh`         | One-shot: `sam deploy`, upload the site, invalidate the CDN cache.     |

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

Requires AWS credentials and the SAM CLI. **Must deploy in `us-east-1`** —
CloudFront's ACM certificate must live there.

```bash
./deploy.sh
```

That provisions/updates the stack, uploads `index.html` + `worker.js`, and
invalidates `/*`. Re-run it any time you change the site.

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
