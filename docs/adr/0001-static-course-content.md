# ADR 0001 — Course content is static, versioned code; the API is progress-only

**Status:** Accepted — 2026-07-08
**Deciders:** Allen Helton

## Context

The bootcamp is becoming a multi-course learning platform with a backend
(Cognito auth, DynamoDB progress + gamification — see `docs/BACKEND_PLAN.md`).
That forced the question every course platform hits: where does course
content live and how is it delivered?

What makes this platform unusual is that its content is **executable, not
descriptive**:

- Lessons are hand-built animated HTML/CSS sequences, not rendered markdown.
- Drills execute real reference implementations; write-it exercises run the
  learner's assembled code against real assertions in sandboxed Web Workers.
- The workers/atomics module needs a cross-origin-isolated page (COOP/COEP)
  to demo a genuine `SharedArrayBuffer` data race.
- CI executes the content: `tools/validate-content.mjs` runs every
  exercise's reference implementation against its own tests on every PR, and
  the catalog seeder computes each course's `totalItems` from the real
  content, so the progress denominator can never drift.
- The app is an offline-first PWA; the full learning experience works with
  no network and no account.

Size grounds the scalability question: the entire app today — shell plus one
full course — is **~127 KB gzipped** (content itself ~53 KB). The current
loader does bring *all* content in at boot and the service worker precaches
it, so a one-bundle approach visibly degrades somewhere around a handful of
courses (≈1 MB+ gzipped boot payload), not at any user-count threshold.

Alternatives considered:

1. **Content in a database/CMS, served by the API.** Would mean storing
   JavaScript in DynamoDB and evaluating it client-side: all the cost and
   operational surface of dynamic content, while losing CI-executed content
   validation, offline-first, works-when-API-is-down, and git
   review/rollback. Rejected.
2. **Hybrid: content manifests in the API, assets static.** The catalog (in
   DynamoDB, seeded from JSON) already *is* this — it describes which
   courses exist. Extending the API to serve lesson bodies inherits
   alternative 1's problems. Rejected beyond the catalog role.
3. **Static, versioned content packs served by CloudFront; API handles only
   identity, progress, and gamification.** Chosen.

## Decision

**The site is the textbook; the API is the gradebook.**

1. **Content lives in this repo as code** — each course is a set of
   self-contained content packs (the existing `js/packs/` mechanism is the
   seam). Authoring, review, versioning, and rollback are git; deploys are
   atomic with CDN invalidation; CI keeps executing every exercise before it
   can merge.
2. **The DynamoDB catalog stays the source of truth for what courses
   exist** (id, title, status, `totalItems`, `contentVersion`) and is what
   the UI reads to build a course picker. Catalog entries will point at
   their course's content bundles; the seeder computes `totalItems` per
   course from the content itself.
3. **Segmentation, not re-architecture, is the scaling plan**: when course
   count warrants it (trigger: ~3+ courses or a boot payload approaching
   ~300 KB gzipped), split into an app shell plus per-course pack bundles,
   lazy-loaded when a course is opened and cached per-course by the service
   worker after first visit. Until then, the single bundle is fine.
4. **The shell↔pack contract is versioned.** Packs assume the shell's
   globals, so content bundles get hash-busted filenames and a declared
   compatible shell version — a stale cached pack must never boot against an
   incompatible new shell.
5. **The API never serves lesson content.** Its surface stays identity,
   progress, and gamification (`docs/BACKEND_PLAN.md`).

## Consequences

**Positive**

- User-count scalability is unbounded and near-free: CloudFront serves
  immutable files; the API only moves small progress JSON.
- Robustness exceeds any dynamic alternative: courses work offline, work
  signed-out, and work when the API is down (localStorage-first by design).
- Content remains CI-verified executable truth — a broken exercise or a
  drifted `totalItems` cannot merge, a property a CMS cannot offer.

**Negative / obligations**

- Content updates require a deploy. Acceptable: the authors are the
  deploy pipeline's owners.
- Non-engineer authoring is unsupported. Acceptable for the foreseeable
  product.
- The shell↔pack versioning discipline (decision 4) must actually be
  enforced once segmentation lands, or cached packs will break on shell
  updates.
- Static files behind CloudFront are effectively public regardless of
  login. **This is the fork to watch:** if the product ever sells *gated
  content*, delivery of paid packs needs CloudFront signed cookies (or
  API-gated delivery) — a real, bounded piece of work. If monetization
  attaches to accounts (progress, badges, certs, coaching) rather than to
  reading the content, nothing changes.

**Revisit triggers**

- Paid/entitlement-gated course content.
- A requirement for non-engineer content authoring or no-deploy updates.
- Boot payload or precache size degrading mobile experience despite
  segmentation.
