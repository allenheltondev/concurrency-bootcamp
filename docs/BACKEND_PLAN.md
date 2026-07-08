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
Browser ──(later)── HTTPS ──► API Gateway HTTP API ──► Lambda (Node 22, esbuild) ──► DynamoDB
                    api.bootcamp.readysetcloud.io        one function per route      single table
```

- **Auth**: the existing shared Cognito user pool is *not* created by this
  stack. Its id arrives as a deployment variable. The stack **does** create
  its own `AWS::Cognito::UserPoolClient` against that pool — shared pool,
  app-specific client — and wires an API Gateway **JWT authorizer** to the
  pool's issuer URL. Every route requires a valid token; the user identity is
  the token's `sub` claim, never anything client-supplied.
- **API**: API Gateway **HTTP API** (cheaper, native JWT authorizer) at
  `api.bootcamp.readysetcloud.io` (regional ACM cert + Route53 alias, both in
  the template — we already deploy in us-east-1). CORS locked to the site
  origin.
- **Compute**: Node.js 22 Lambda functions in `backend/functions/`, one
  handler per route, bundled with esbuild via `sam build` `Metadata`. AWS SDK
  v3 only, no other runtime deps.
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
| Course catalog entry | `COURSE#<courseId>` | `METADATA` | title, description, `totalItems`, `contentVersion`, `status` (active/draft/retired) |
| User profile | `USER#<sub>` | `PROFILE` | createdAt, lastSeenAt, display prefs later |
| Course progress | `USER#<sub>` | `COURSE#<courseId>` | summary **and** detail in one item, below |

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
| What courses exist? | `Query pk begins_with COURSE#` — no. Catalog is small: `Scan` with a filter now, or a `GSI1: type=course` if/when the table grows. Start with the simple thing. |
| All my courses + status ("what have I done?") | `Query pk = USER#<sub>, sk begins_with COURSE#` |
| My progress in one course | `GetItem (USER#<sub>, COURSE#<courseId>)` |
| Course metadata | `GetItem (COURSE#<courseId>, METADATA)` |

**Write concurrency** (fitting, for this app): `PUT` progress uses optimistic
locking — the item carries a `version` number; the client sends the version it
read, the write is conditional on it matching, and a mismatch returns `409`
with the current item so the client can merge and retry. Last-write-wins is
what silently eats progress when the same account has the app open on a phone
and a laptop; a conditional write is one expression and makes a great future
lesson anecdote.

## API surface (v1)

All routes JWT-protected; user comes from `sub`.

| Method + path | Purpose |
| --- | --- |
| `GET /courses` | Catalog: id, title, description, totalItems, status |
| `GET /courses/{courseId}` | One course's metadata |
| `GET /me/courses` | My cross-course summary list (the "what have I done" view) |
| `GET /me/courses/{courseId}` | Full progress doc (summary + detail + version) for one course |
| `PUT /me/courses/{courseId}` | Upsert progress: body is `{ detail, version }`; server recomputes summary, bumps version, sets timestamps; `409` on version conflict |
| `DELETE /me/courses/{courseId}` | Reset my progress in a course (the backend twin of the footer's Reset button) |

Deliberately **not** in v1: per-item progress endpoints (the detail blob
covers it), admin/course-authoring endpoints (catalog is seeded at deploy),
and any content delivery (course content stays static in `js/content.js` /
`js/packs/` — the backend tracks progress, it doesn't serve lessons).

## Catalog seeding

Courses are declared in `backend/data/courses.json` (starting with the single
`js-concurrency` entry — `totalItems` matches the app's `TOTAL`). A small
idempotent script (`backend/tools/seed-courses.mjs`, plain `PutItem`s) runs as
a post-deploy step in the workflow. Editing the JSON and merging is how a new
course appears. No console clicking, no custom resource.

## Deployment & config changes

- **New template parameters**: `UserPoolId` (the shared pool — the deployment
  variable you asked for), `ApiDomainName` (default
  `api.bootcamp.readysetcloud.io`). Issuer URL is derived:
  `https://cognito-idp.${AWS::Region}.amazonaws.com/${UserPoolId}`.
- **New GitHub repo variable**: `COGNITO_USER_POOL_ID`, passed through
  `--parameter-overrides` in `deploy.yml` exactly like `DOMAIN_NAME` is today.
- **Workflow updates** (`deploy.yml`): add `sam build` before `sam deploy`
  (first Lambda in the stack), add the catalog seed step, and extend the smoke
  test: unauthenticated `GET /courses` must return `401`, proving the
  authorizer is actually in front of the API.
- **CI updates** (`ci.yml`): run the new backend unit tests; `node --check`
  already sweeps `js/`, extend the sweep to `backend/`.
- **Outputs**: `ApiUrl`, `UserPoolClientId` — everything the UI phase will
  need to configure Amplify/oauth later, with zero rework.

## Work breakdown (each phase = one PR, independently mergeable, site untouched)

**Phase 1 — Infra skeleton.** Template additions: DynamoDB table, user-pool
client against the shared pool, HTTP API + JWT authorizer + custom domain +
CORS, template parameters, one placeholder route. Workflow: `sam build`,
`COGNITO_USER_POOL_ID` variable, 401 smoke test. *Proves end-to-end: a real
token from the shared pool passes the authorizer; no token gets 401.*

**Phase 2 — Courses.** `courses.json` + seed script + seed step;
`GET /courses`, `GET /courses/{courseId}`. Small, mostly mechanical.

**Phase 3 — Progress.** The core: `GET/PUT/DELETE /me/courses*`, summary
computation from `detail.solved`, versioned conditional writes with `409`
merge semantics, profile item upsert on first write.

**Phase 4 — Tests & hardening.** Handler unit tests (mocked DynamoDB client)
wired into CI; an integration smoke script that exercises the deployed API
with a real test-user token; request validation (payload size cap, shape
check on `detail`); structured logs + basic alarms (4xx/5xx, throttles).

Phases 2 and 3 can proceed in parallel once phase 1 merges — they share
nothing but the table.

**Phase 5 — UI integration (explicitly out of scope for now).** Parked until
you're done using the app for learning. The design above pre-decides the hard
parts so this phase is purely client work: Hosted UI login (client id comes
from stack outputs), `localStorage` remains the write-through cache and
offline store, a sync layer pushes the existing `{solved, position, misses}`
blob via `PUT` and merges on `409` (union `solved`, newest `position`, union
`misses` capped at 50). First login migrates existing local progress up.
Signed-out users keep today's experience forever — accounts stay optional.

## Open items to confirm

1. Course id for the current app: proposing `js-concurrency`.
2. API host: proposing `api.bootcamp.readysetcloud.io` under the existing
   hosted zone.
3. Shared-pool assumption: this stack creates its **own app client** in the
   shared pool (standard multi-app pattern, no interference with other Ready
   Set Cloud apps). If you'd rather share a client too, the client id becomes
   a second deployment variable instead.
