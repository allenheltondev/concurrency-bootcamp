# Backend Plan — Accounts, Courses, and Progress

Turn the bootcamp from a single static PWA into the first course of a
multi-course learning platform. All of this work is **backend only**: the API
gets built, tested, and deployed dark, while the live site keeps working
exactly as it does today (localStorage progress, no login). UI integration is
a deliberately separate, final phase.

## Where we are today

- One SAM stack (`template.yaml`): private S3 origin + CloudFront + OAC +
  COOP/COEP headers policy + ACM + Route53. Pure infra — no Lambda, so the
  deploy workflow doesn't even run `sam build`.
- All progress lives in three localStorage keys (`js/app.js`):
  - `cbootcamp:solved` — map of solved drill/exercise keys
  - `cbootcamp:position` — module + per-module indexes (resume point)
  - `cbootcamp:misses` — capped list (50) of missed questions/failed builds
- Everything in the app today is, conceptually, **one course**:
  `js-concurrency` (working id).

## Target architecture

```
                    shared Ready Set Cloud user pool (external, referenced by id)
                                        │ JWT (issuer/audience)
Browser ──(later)──► CloudFront ──► API Gateway HTTP API ──► Lambda (Node 22 lambdalith) ──► DynamoDB
   bootcamp.readysetcloud.io/api/*      ANY /api/{proxy+}        Powertools Router             single table
   (existing distribution, new behavior)                         resolves paths internally
```

- **Auth**: the existing shared Cognito user pool is *not* created by this
  stack. Its id arrives as a deployment variable. The stack **does** create
  its own `AWS::Cognito::UserPoolClient` against that pool — shared pool,
  app-specific client — and wires an API Gateway **JWT authorizer** to the
  pool's issuer URL. Every route requires a valid token; the user identity is
  the token's `sub` claim, never anything client-supplied.
- **API**: API Gateway **HTTP API** (cheaper, native JWT authorizer), reached
  through the **existing CloudFront distribution** at
  `bootcamp.readysetcloud.io/api/*` — a second origin plus an `/api/*` cache
  behavior, no new domain, cert, or DNS record. Because CloudFront can't
  strip a path prefix, the HTTP API's route keys simply include it
  (`GET /api/courses`, …). The `/api/*` behavior uses the managed
  `CachingDisabled` cache policy and `AllViewerExceptHostHeader` origin
  request policy (forwards `Authorization`, withholds `Host` so the
  execute-api endpoint resolves), allows all HTTP methods, and skips the
  COOP/COEP headers policy. The API is same-origin with the site, so the UI
  phase needs **no CORS at all**; the execute-api URL stays reachable as a
  debugging back door but isn't part of the contract.
- **Compute**: a single **lambdalith** (`backend/src/api.mjs`) behind
  `ANY /api/{proxy+}` — the Powertools event-handler `Router` resolves paths
  internally (prefix `/api`, path params, per-route zod validation). One
  function means one cold-start profile, one set of alarms, and adding a
  route is code, not infrastructure. esbuild-bundled by `sam build`; the AWS
  SDK stays external because the runtime ships it.
- **Hexagonal layout** with `api.mjs` as the composition root:
  - `src/adapters/http/` — driving adapter: routes, request schemas, and the
    only place domain errors meet status codes
  - `src/domain/` — the core: progress/catalog services, gamification rules,
    domain errors. Imports nothing from AWS, HTTP, or Powertools;
    repositories and the clock are injected as ports. **Enforced by lint**:
    an ESLint boundary rule fails CI if `src/domain` imports infrastructure.
  - `src/adapters/dynamodb/` — driven adapter (the DAL): owns the key
    scheme, item mapping (pk/sk/type never leak out), and conditional-write
    expressions; storage failures surface as domain errors
    (`OptimisticLockError`), never AWS exception types.
- **Powertools for AWS Lambda** everywhere it earns its keep:
  - **Event Handler (http)**: routing, validation middleware, structured
    4xx/5xx error bodies, body-size-limit middleware (`413`)
  - **Logger**: structured JSON logs, Lambda context + API Gateway request id
    as correlation id (via middy). Every request logs one access line
    (method, path, matched route, status, duration, sub); route misses log a
    `no route matched` warn; rejected requests (validation, body limit) log
    a warn with the failure details; unexpected errors log at error level
    with name/message/stack. **Responses never carry internals**: unexpected
    failures return a generic 500 body — the details live only in the logs
    (asserted by tests, including a leak check).
  - **Tracer**: X-Ray handler segment (middy) + per-route subsegments and
    ColdStart annotation (router middleware) + captured DynamoDB client
  - **Metrics** (EMF): per-request latency/error/fault dimensioned by matched
    route (router middleware), plus business metrics on the write path:
    `ProgressSynced`, `VersionConflict`, `BadgeAwarded`, `CourseCompleted`,
    `CourseReset`
  - Deliberately skipped: **Idempotency** (optimistic locking already makes
    retries safe, and it would add a second table), **Parameters** (no
    SSM/secrets — config is env vars), **Batch** (no queues yet), **Parser**
    (the router's zod validation covers request parsing).
- **Data**: one DynamoDB table (`PAY_PER_REQUEST`, PITR on), single-table
  design below.
- **Same stack** (`template.yaml`), new resources. One stack, one deploy
  pipeline, one gate — the existing workflow already serializes deploys. The
  new resources are purely additive, so a bad backend change can't take the
  site down (worst case is a failed changeset that rolls back).

## Data model (single table)

Identity is the Cognito `sub` (stable per user in the shared pool).

| Entity | pk | sk | Notes |
| --- | --- | --- | --- |
| Course catalog entry | `COURSES` | `COURSE#<courseId>` | title, description, `totalItems`, `contentVersion`, `status` (active/draft/retired) |
| Badge catalog entry | `BADGES` | `BADGE#<badgeId>` | name, description, icon, declarative `criteria` (below; a `courseId` inside the criteria makes a badge course-scoped) |
| User profile | `USER#<sub>` | `PROFILE` | createdAt, lastSeenAt, plus gamification stats: `xp`, `currentStreak`, `longestStreak`, `lastActivityDate` |
| Course progress | `USER#<sub>` | `COURSE#<courseId>` | summary **and** detail in one item, below |
| Earned badge | `USER#<sub>` | `BADGE#<badgeId>` | `earnedAt`, `courseId` if course-scoped; write is conditional on `attribute_not_exists(pk)` so awards are idempotent and `earnedAt` never moves |

Everything about a user shares one partition on purpose: profile, per-course
summaries, and earned badges all come back from a single
`Query pk = USER#<sub>` — the whole "me" screen in one round trip.

The course-progress item carries both granularities the requirements ask for:

- **Summary attributes** (cross-course view): `status`
  (`in-progress` / `completed`), `solvedCount`, `totalItems`, `percentComplete`,
  `startedAt`, `completedAt`, `lastAccessedAt`.
- **Detail blob** (within-course view): the same shape the app already
  persists — `{ solved, position, misses }` — stored as a `detail` map
  attribute. The app remains the source of truth for its own progress
  structure; the backend treats it as an opaque-ish document but computes the
  summary fields server-side from `solved` at write time so the summary can't
  drift from the detail. Misses are capped at 50 in the app, so the item
  stays far under DynamoDB's 400 KB limit.

Access patterns, all satisfied without a GSI:

| Question | Operation |
| --- | --- |
| What courses / badges exist? | `Query pk = COURSES` / `Query pk = BADGES` — each catalog is one small partition, so listing is a Query, never a Scan over user data. |
| All my courses + status ("what have I done?") | `Query pk = USER#<sub>, sk begins_with COURSE#` |
| My progress in one course | `GetItem (USER#<sub>, COURSE#<courseId>)` |
| My badges | `Query pk = USER#<sub>, sk begins_with BADGE#` |
| My profile + stats | `GetItem (USER#<sub>, PROFILE)` |
| Everything about me at once | `Query pk = USER#<sub>` |
| Course metadata | `GetItem (COURSES, COURSE#<courseId>)` |

**Write concurrency** (fitting, for this app): `PUT` progress uses optimistic
locking — the item carries a `version` number; the client sends the version it
read, the write is conditional on it matching, and a mismatch returns `409`
with the current item so the client can merge and retry. Last-write-wins is
what silently eats progress when the same account has the app open on a phone
and a laptop; a conditional write is one expression and makes a great future
lesson anecdote.

## Gamification

Design rule: **the server computes everything, on the progress write path.**
The client never says "give me a badge" or "add 50 XP" — it only submits
progress, and the `PUT` handler derives the rest. That keeps gamification
tamper-resistant (to the degree the progress data itself is honest — this is
a learning tool, not a competition, so client-reported `solved` is an
acceptable trust root) and means the UI phase gets badge/XP moments for free
in the `PUT` response.

- **XP**: derived, not accumulated — recomputed from summary counts (solved
  items, completed courses, completed modules) on every write and stored on
  the profile item. Derived XP can't drift, survives progress resets
  coherently, and lets us re-balance point values later by changing the
  formula, not the data.
- **Streaks**: on every progress write, compare `lastActivityDate` (UTC day)
  on the profile: same day → no-op, yesterday → `currentStreak+1`, older →
  reset to 1; maintain `longestStreak`. UTC-day granularity is a known
  simplification; a timezone preference on the profile can refine it later
  without a model change.
- **Badges**: the catalog entry carries a small declarative `criteria`
  object rather than code — e.g. `{type: "course-completed"}`,
  `{type: "percent-complete", courseId, threshold}`,
  `{type: "total-solved", count}`, `{type: "streak", days}`,
  `{type: "courses-completed", count}`. The `PUT` handler evaluates all
  active criteria against the fresh summary + profile stats and
  conditionally writes any newly earned badge items. Adding a badge type =
  one evaluator function; adding a badge = a JSON entry.
- **Awards are permanent**: resetting or deleting course progress never
  claws back an earned badge (the `attribute_not_exists` write plus never
  deleting `BADGE#` items on `DELETE /api/me/courses/...`).
- **Future escape hatch**: if criteria ever get expensive or we want awards
  to trigger side effects (emails, notifications), the `PUT` handler starts
  emitting a `progress.updated` EventBridge event and evaluation moves to an
  async awarder Lambda. The data model doesn't change — only where the
  evaluator runs.
- **Explicitly out of scope for v1**: leaderboards and any cross-user
  visibility (needs a GSI on XP plus privacy decisions — the model above
  doesn't block it), daily quests, and badge revocation.

## API surface (v1)

All routes JWT-protected; user comes from `sub`.

All paths are as the browser sees them (CloudFront forwards them verbatim, so
they're also the HTTP API route keys).

| Method + path | Purpose |
| --- | --- |
| `GET /api/courses` | Catalog: id, title, description, totalItems, status |
| `GET /api/courses/{courseId}` | One course's metadata |
| `GET /api/me/courses` | My cross-course summary list (the "what have I done" view) |
| `GET /api/me/courses/{courseId}` | Full progress doc (summary + detail + version) for one course |
| `PUT /api/me/courses/{courseId}` | Upsert progress: body is `{ detail, version }`; server recomputes summary, bumps version, sets timestamps, updates XP/streak, evaluates badges; `409` on version conflict. Response includes `newBadges` + updated stats so a future UI can toast them |
| `DELETE /api/me/courses/{courseId}` | Reset my progress in a course (the backend twin of the footer's Reset button). Earned badges stay |
| `DELETE /api/me` | Full account-data erasure: profile, all progress, all badges — batched deletes over the user's partition |
| `GET /api/badges` | Badge catalog (name, description, icon, criteria) |
| `GET /api/me` | My profile + gamification stats (XP, streaks) |
| `GET /api/me/badges` | Badges I've earned, with `earnedAt` |

Deliberately **not** in v1: per-item progress endpoints (the detail blob
covers it), admin/course-authoring endpoints (catalog is seeded at deploy),
and any content delivery — course content is static, versioned code served
by CloudFront, and the API never serves lessons. That split ("the site is
the textbook, the API is the gradebook"), including the per-course pack
segmentation plan and the shell↔pack versioning rule, is recorded in
**`docs/adr/0001-static-course-content.md`**.

## Catalog seeding

Courses are declared in `backend/data/courses.json` and badges in
`backend/data/badges.json` (launch set: first solve, 25/100 solved, course
50% / completed, 3- and 7-day streaks, first course completed).
`backend/tools/seed-catalog.mjs` validates both files (ids, criteria types,
course references), emits `BatchWriteItem` payloads, and the deploy workflow
feeds them to the AWS CLI — idempotent, catalog partitions only, no SDK
install, no custom resource. The `js-concurrency` entry declares
`"totalItems": "auto"`: the seeder loads the app content in a Node VM (same
strategy as `tools/validate-content.mjs`) and applies `js/app.js`'s exact
`TOTAL` formula, so the catalog count can never drift from what the app
counts. CI runs the seeder as a dry run, so a bad catalog entry cannot
merge. Editing the JSON and merging is how a new course or badge appears.

## Deployment & config changes

- **New template parameter**: `UserPoolId` (the shared pool — the deployment
  variable you asked for). Issuer URL is derived:
  `https://cognito-idp.${AWS::Region}.amazonaws.com/${UserPoolId}`. No API
  domain parameter needed — the API rides the existing site domain.
- **Dark until configured**: `UserPoolId` defaults to empty, and every
  backend resource (table, app client, API, functions, the CloudFront
  `/api/*` origin + behavior) sits behind a `BackendEnabled` condition. With
  `COGNITO_USER_POOL_ID` unset the stack deploys the static site exactly as
  before; setting the variable materializes the whole backend on the next
  deploy. Backend phases can merge before the pool id is available.
- **New GitHub repo variable**: `COGNITO_USER_POOL_ID`, passed through
  `--parameter-overrides` in `deploy.yml` exactly like `DOMAIN_NAME` is today.
- **Workflow updates** (`deploy.yml`): add `sam build` before `sam deploy`
  (first Lambda in the stack), add the catalog seed step, and extend the smoke
  test: unauthenticated `GET https://bootcamp.readysetcloud.io/api/health`
  must return `401`, proving both the CloudFront routing and the authorizer
  in one probe (skipped while `COGNITO_USER_POOL_ID` is unset). Note the
  `/api/*` behavior is a distribution config change — it deploys in the same
  stack update, and the existing `/*` invalidation step already covers any
  edge staleness.
- **CI updates** (`ci.yml`): run the new backend unit tests; `node --check`
  already sweeps `js/`, extend the sweep to `backend/`.
- **Outputs**: `ApiUrl`, `UserPoolClientId` — everything the UI phase will
  need to configure Amplify/oauth later, with zero rework.

## Work breakdown (each phase = one PR, independently mergeable, site untouched)

Status: phases 1–5 are implemented (dark — nothing deploys until
`COGNITO_USER_POOL_ID` is set) except CloudWatch alarms, which are
deliberately deferred. Phase 5 delivered:

- **Unit tests in CI**: `backend/test/` drives the exported handler with
  synthetic API Gateway events through the full middy → Powertools → router
  chain against an in-memory DynamoDB fake — 50 checks including the
  log-contract and no-leaky-500 assertions.
- **Integration smoke script** (`backend/tools/integration-smoke.mjs`):
  hits the deployed API through CloudFront with a real Cognito token —
  verifies the 401 boundary, issuer/audience config, routing, catalogs, and
  (opt-in via `SMOKE_MUTATE=1`, dedicated test user only) the full
  PUT → 409 → DELETE write cycle. Sign-in uses `USER_PASSWORD_AUTH` (enabled
  on the app client for exactly this) or a pre-minted `TOKEN`. Run manually
  post-deploy; wiring it into the deploy workflow just needs the test-user
  secrets.
- **Hardening**: request validation + body-size cap (earlier), API stage
  throttling (50 rps / 100 burst), 30-day log retention via an explicit log
  group, DynamoDB deletion protection, esbuild sourcemaps +
  `--enable-source-maps` so minified stack traces in error logs stay
  readable, and `DELETE /api/me` for full account-data erasure.

Remaining from phase 5: CloudWatch alarms (deferred by choice — the metrics
they'd alarm on are already emitted). Phase 6 (UI integration) is
implemented — see its section below. Going live now takes exactly one repo
setting: `COGNITO_USER_POOL_ID`. The deploy derives everything else (the
auth config ships client id + region from stack outputs), plus optionally
the smoke-test user secrets.

**Phase 1 — Infra skeleton. ✅** Template additions: DynamoDB table, user-pool
client against the shared pool, HTTP API + JWT authorizer, the CloudFront
`/api/*` origin + behavior, the `UserPoolId` parameter, one placeholder
route. Workflow: `sam build`, `COGNITO_USER_POOL_ID` variable, 401 smoke
test. *Proves end-to-end: `bootcamp.readysetcloud.io/api/*` reaches the API,
a real token from the shared pool passes the authorizer, and no token gets
401.*

**Phase 2 — Catalogs. ✅** `courses.json` + `badges.json` + seed script + seed
step; `GET /api/courses`, `GET /api/courses/{courseId}`, `GET /api/badges`.
Small, mostly mechanical.

**Phase 3 — Progress. ✅** The core: `GET/PUT/DELETE /api/me/courses*`,
`GET /api/me`, summary computation from `detail.solved`, versioned
conditional writes with `409` merge semantics, profile item upsert on first
write with XP + streak updates.

**Phase 4 — Badges. ✅** Criteria evaluators, award writes in the `PUT` path,
`newBadges` in the response, `GET /api/me/badges`. Depends on phase 3's
write path.

**Phase 5 — Tests & hardening.** Handler unit tests (mocked DynamoDB client)
wired into CI; an integration smoke script that exercises the deployed API
with a real test-user token; request validation (payload size cap, shape
check on `detail`); structured logs + basic alarms (4xx/5xx, throttles).

Phases 2 and 3 can proceed in parallel once phase 1 merges — they share
nothing but the table.

**Phase 6 — UI integration. ✅** Implemented as a shared, additive account
layer (`js/account.js`), loaded after the engine by every course page:

- **Dormant by default**: activates only if `/auth-config.json` exists —
  published by the deploy pipeline (client id + region, straight from stack
  outputs) once the backend is enabled. Local dev, file://, and backend-less
  deploys keep today's exact experience; signed-out users keep it forever.
- **Auth**: fully custom, in-app screens — sign in, sign up (first/last
  name + email, matching the shared pool's required attributes), 6-digit
  email verification with resend cooldown, forgot password, and the
  NEW_PASSWORD_REQUIRED challenge — calling the Cognito user pool API
  directly (`USER_PASSWORD_AUTH` over TLS, dependency-free). No Hosted UI,
  no domain, no redirects: the modal matches the RSC newsletter dashboard's
  auth styling (surface card, primary-600 buttons, ring focus states,
  error-50 alert boxes, light + dark via `prefers-color-scheme`). Cognito
  exception types translate to friendly copy; tokens are origin-wide (one
  sign-in covers every course); the id token refreshes via the refresh
  grant; sign-out revokes the refresh token.
- **Sync**: localStorage stays the source of truth; the engine dispatches
  `course:progress-changed` / `course:progress-reset` events and knows
  nothing else. Debounced `PUT` per course, version tracked per course,
  `409` → merge (union solved, keep local position, union misses capped at
  50) → re-push. Sign-in pulls and merges both ways; first sign-in migrates
  existing local progress. Reset also deletes the cloud copy.
- **Gamification surfaces**: badge toasts straight from the `PUT` response;
  an account chip in the header with a menu showing live XP + streak.
- **Service workers** (both courses): `/api/` and `auth-config.json` are
  never cached — the offline `index.html` fallback must never impersonate a
  JSON response.
- **Verified**: `tools/validate-account.mjs` (CI) proves the dormancy
  contract and the merge rules; a Chromium end-to-end pass exercised
  dormant boot, the PKCE redirect, pull-merge into the live progress bar,
  versioned push, badge toast, and menu stats against a mocked API. Parked until
you're done using the app for learning. The design above pre-decides the hard
parts so this phase is purely client work: Hosted UI login (client id comes
from stack outputs), `localStorage` remains the write-through cache and
offline store, a sync layer pushes the existing `{solved, position, misses}`
blob via `PUT` and merges on `409` (union `solved`, newest `position`, union
`misses` capped at 50). First login migrates existing local progress up.
Signed-out users keep today's experience forever — accounts stay optional.

## Decisions

1. Course id for the current app: `js-concurrency`. ✅
2. API routing: through the existing CloudFront distribution at
   `bootcamp.readysetcloud.io/api/*` — no separate API subdomain. ✅
3. App client: this stack creates its **own app client** in the shared pool
   (dedicated `aud`, so the JWT authorizer rejects tokens minted for other
   Ready Set Cloud apps; own callback URLs and token lifetimes; same users
   and same `sub` everywhere). ✅
4. Gamification (badges, XP, streaks) is in scope for the data model and API
   from day one: server-computed on the progress write path, catalogs seeded
   from JSON, awards permanent. Leaderboards deferred. ✅
5. The API is a **lambdalith**: one function resolves and routes every
   `/api/*` path internally via the Powertools event-handler Router. ✅
6. **Powertools** is the observability and routing backbone (Logger, Tracer,
   Metrics, Event Handler); utilities that don't fit yet (Idempotency,
   Parameters, Batch, Parser) are consciously skipped, not forgotten. ✅
7. **Hexagonal architecture** with a proper DAL: http adapter → domain
   services (pure, ports-injected) → DynamoDB repositories. The
   domain-purity boundary is lint-enforced in CI. ✅
8. **ESLint** (default `@eslint/js` recommended rules) runs in CI for the
   backend, alongside the tests. ✅
9. **Content delivery**: course content stays static, versioned code (packs
   on CloudFront); the API is progress-only. Scaling plan is per-course
   lazy-loaded packs, not a platform change. Full rationale, consequences,
   and revisit triggers: `docs/adr/0001-static-course-content.md`. ✅
10. **Custom auth UI, no Hosted UI**: sign in / sign up / verify / forgot
    password / new-password challenge are in-app screens styled after the
    RSC newsletter dashboard, calling the Cognito user pool API directly.
    Sign-up sends the shared pool's required attributes (`given_name`,
    `family_name`, `email`); its PostConfirmation triggers (newsletter
    onboarding pipeline) fire for bootcamp sign-ups too — accepted, one RSC
    account is the point. ✅
