# Platform Plan — Hub, Profile, and the React Surface

The follow-on effort to `docs/BACKEND_PLAN.md` (complete): give the growing
multi-course product its account-centric surface — a public course hub and a
profile page — built as a Vite + React app alongside the untouched vanilla
course engine. The architectural decision and its boundary live in
**`docs/adr/0002-react-platform-surface.md`**; this doc is the build plan.

## Goals

- A **public hub**: the front door of bootcamp.readysetcloud.io — every
  course as a card (title, description, size, status), with the visitor's
  own progress woven in when signed in. Works signed-out; nothing is gated.
- A **profile page** (signed-in): XP, current/longest streak, the badge
  case (earned + locked), and per-course progress cards with resume links.
- The **RSC look**: the newsletter dashboard's Tailwind token system,
  typography, and component patterns, applied 1:1.
- **Zero disruption to learning**: course apps keep working exactly as they
  do, offline included, signed-in or not.

## Architecture

```
platform/                     Vite + React + TypeScript + Tailwind
  src/
    pages/   Hub, Profile
    components/               ported newsletter patterns (cards, stats, badges)
    lib/auth.ts               the shared session contract (rsc:auth + cognito-idp)
    lib/api.ts                typed /api client
  dist/  ->  s3://<bucket>/<platform paths>, same CloudFront distribution
```

- **Same origin, same bucket, same distribution.** The platform app is
  static build output — per ADR 0001 it's still just "more textbook", even
  though it renders the gradebook.
- **Auth**: reads/writes the same `rsc:auth` localStorage document the
  course pages use, so a sign-in anywhere is a sign-in everywhere. The
  platform app ships its own React auth screens (the newsletter forms,
  nearly verbatim) driven by the same Cognito user pool API calls; the
  course pages keep the `js/account.js` modal.
- **SPA routing**: platform routes need a CloudFront viewer-request rewrite
  to the app's `index.html` (extend the existing directory-index function).
- **No service worker** for the platform app at launch (online-first
  account UI; ADR 0002).

## Backend prerequisite: a public catalog

Every API route today sits behind the JWT authorizer — but the hub is
public. One small backend change: `GET /api/courses` and
`GET /api/courses/{courseId}` (and `GET /api/badges`, so locked badges can
render for visitors) become **public routes** via per-route authorizer
overrides (`Auth: { Authorizer: NONE }` on those events). They serve
catalog data only — nothing user-scoped — and CloudFront's `CachingDisabled`
on `/api/*` can graduate to a short-TTL cache policy for these paths later
if traffic ever warrants it. Everything under `/api/me` stays authenticated.

## URL strategy (decided ✅)

**The hub takes the root URL** — the site's home page, where you pick a
course — **and the JS concurrency course relocates to `/js-concurrency/`**:
one deliberate migration, done once.
`/distributed-systems/` already proves the subdirectory-course pattern; the
relocation makes the root course a peer rather than a special case, and
`bootcamp.readysetcloud.io` becomes the platform's front door.

The migration is the sensitive part, owned by phase 3 as a checklist:

- Copy the root course to `/js-concurrency/` (index.html, sw, manifest,
  worker.js, js/) using the same pattern `distributed-systems/` follows;
  the shared engine stays at `/js/app.js`.
- **Progress survives untouched**: localStorage is origin-scoped, and the
  engine keys by `COURSE.storagePrefix` (`cbootcamp:*`), not by path.
- **Service-worker handover**: the old root-scoped course worker would
  otherwise keep serving the cached course at `/`. The hub deploy ships a
  new root `sw.js` (same filename, max-age=0 already) that deletes the old
  caches and takes over — effectively a self-replacing worker. The course's
  new worker registers at `/js-concurrency/` scope.
- **Installed PWAs**: existing installs have `start_url: /` — they open the
  hub after migration, one tap from the course. The relocated course gets
  its own manifest/scope/start_url so fresh installs pin the course itself.
- Old hash-routed links keep working (`/#...` has no deep paths to break);
  the CloudFront function already rewrites directory URIs.



## Design system

Port the newsletter dashboard's system directly: the CSS-variable token
triplets (light `:root`, auto dark via `prefers-color-scheme`, explicit
`[data-theme]` override), Tailwind config mapping semantic scales
(`primary`/`success`/`warning`/`error` + neutrals) to those variables,
Inter/JetBrains Mono stacks, the soft/medium/large shadows, and the form
and card anatomy already replicated in the auth modal. `platform/`'s
Tailwind config becomes the **canonical** home of the tokens; the
hand-written copy in `js/account.js` is documented as a mirror (ADR 0002
obligation) until the modal retires.

## Work breakdown (each phase = one PR, courses untouched throughout)

**Phase P0 — Scaffold + pipeline. ✅** `platform/` app (Vite, React, TS,
Tailwind, vitest, ESLint) with the ported token system and a placeholder
hub page; CI steps (lint, test, `tsc --noEmit` + build); deploy builds and
uploads (`/platform/assets/` immutable, index.html revalidating); the
CloudFront directory-index function gained the `/platform/*` SPA rewrite.
Ships dark at `/platform/` — deployed but unlinked; `vite.config.ts` flips
`base` to `/` in P3.

**Phase P1 — Public catalog. ✅** Added per-route `Auth: { Authorizer: NONE }`
overrides on `GET /api/courses`, `GET /api/courses/{courseId}`, and
`GET /api/badges` (explicit HttpApi events beat the `ANY /api/{proxy+}`
catch-all's default JWT authorizer); no handler changes needed since those
routes never read caller identity. `integration-smoke.mjs` now checks
signed-out 200s for `/courses` and `/badges` and confirms `/me` still 401s;
the unit suite adds a no-authorizer-block invocation of the same three
routes to prove the handler doesn't assume `requestContext.authorizer`
exists. Small and independent.

**Phase P2 — Profile. ✅** `/profile` plus the full auth surface: `/login`
(with the new-password challenge inline), `/signup` (two-step wizard with
the 6-digit confirm), and `/forgot-password` — React ports of the
newsletter forms, driven by runtime `/auth-config.json` (dormant without
it, like the modal). The session contract lives in `lib/auth.ts` (same
`rsc:auth` document + cognito-idp calls as `js/account.js`, with refresh,
friendly error copy, and cross-tab change notification), the typed `/api`
client in `lib/api.ts`, and `<RequireAuth>` gates the profile with a
return-to. The page itself: XP/streak stat tiles, badge case (earned vs
locked from the two badge endpoints), per-course progress cards from
`GET /api/me/courses` joined with the catalog — with loading skeletons,
error, and empty states. Course pages' account menus gained the
"view profile" link — the one (additive) course-page touch in this plan.

**Phase P3 — Hub + root migration.** The hub page; the URL-strategy
migration checklist above; course headers link back to the hub. The
riskiest phase, shipped last on purpose — P0–P2 deliver value even if P3
waits.

**Phase P4 — Polish + hardening.** Loading/empty/error states everywhere,
Playwright end-to-end pass (signed-out hub, sign-in, profile renders real
API shapes, course round-trip), Lighthouse/a11y sweep, docs (README,
COURSE_PATTERN pointer to the hub).

## Verification bar (matching the repo's standard)

- Unit: vitest on `lib/auth.ts` (session contract, refresh, error
  translation — mirroring `tools/validate-account.mjs`'s coverage) and on
  API/data mapping.
- End-to-end: the existing Chromium harness pattern against mocked
  `cognito-idp` + `/api` — dormancy equivalents don't apply (the platform
  is never dormant), but signed-out/signed-in/expired-token paths all get
  driven for real.
- CI gates: platform lint + tests + build must pass alongside every
  existing gate; the backend change in P1 extends the smoke script.

## Open items

1. Badge art direction for the profile badge case (emoji-as-icon is the
   current catalog format; fine to ship, easy to upgrade later).
2. Whether the course pages' `js/account.js` modal eventually retires in
   favor of linking to the platform's auth pages (ADR 0002 revisit trigger;
   no rush — it works and is tested).
