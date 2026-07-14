# Badges — central RSC gamification

The bootcamp uses the **cross-app Ready, Set, Cloud badge chest** (one chest per
person, keyed on the shared Cognito `sub`) rather than a local badge system. The
rules engine, the catalog, and the `/badges/*` API live in
[`readysetcloud/rsc-core`](https://github.com/readysetcloud/rsc-core); the read
client and the `BadgeChest` component ship in `@readysetcloud/ui`. See
`functions/badges/AGENTS.md` in rsc-core for the full contract.

Apps only ever do two things: **emit activity** ("this happened") and **read the
chest** ("show me my badges"). This app does both:

- **Emit** — `js/app.js` announces each accomplishment as a
  `course:activity` DOM event; `js/account.js` turns those into
  `POST {coreApiBase}/badges/activity` calls (Cognito JWT), and the platform
  hub/profile emit `service.visited`.
- **Read** — the React profile (`platform/src/pages/Profile.tsx`) renders
  `<BadgeChest>` fed by `createBadgeClient(...).getChest()` (`GET /badges/me`).

`coreApiBase` defaults to `https://api.readysetcloud.io` (rsc-core SSM
`/readysetcloud/api-url`). Override it with a `coreApiBase` field in
`/auth-config.json` (course pages) or `VITE_CORE_API_URL` at platform build time.

## Activity the bootcamp emits

Every activity carries `service: "bootcamp"` and a deterministic idempotency
`id` so retries and sign-in backfills count **exactly once**.

| Action | When | Idempotency `id` | `value` |
| --- | --- | --- | --- |
| `lesson.completed` | any drill / write-it / spot-the-bug newly solved | `<courseId>#lesson.completed#<itemId>` | — |
| `bug.found` | a Spot-the-bug exercise solved | `<courseId>#bug.found#<itemId>` | — |
| `writeit.passed` | a Write-it exercise assembled & passed | `<courseId>#writeit.passed#<itemId>` | — |
| `interview.completed` | the 25-minute interview sim reaches its score screen | `<courseId>#interview.completed#<ts>` | — |
| `course.completed` | every item in a course is solved (100%) | `<courseId>#course.completed#<courseId>` | `<courseId>` |
| `service.visited` | signed-in visit to a bootcamp page | `visit#bootcamp#<yyyymmdd>` | `bootcamp` |

`course.completed` carries `value = <courseId>` so it feeds both a service-scoped
`count` (Race Condition Survivor) **and** the `unique` distinct-course counter
(Polymath). On sign-in, the engine replays every already-completed item through
these actions — the stable ids make the replay a no-op for anything already
counted, so existing local progress lights the chest up without double-counting.

## Badges this app feeds

`catalog-additions.json` in this folder holds the **new** entries to append to
rsc-core's `functions/badges/catalog.json` (then bump its `version`):

| Badge | Criteria |
| --- | --- |
| 🐛 Bug Hunter | `count bug.found ≥ 10` (bootcamp) |
| ✍️ From Scratch | `count writeit.passed ≥ 5` (bootcamp) |
| ⏱️ Interview Ready | `count interview.completed ≥ 1` (bootcamp) |
| 🏁 Race Condition Survivor | `count course.completed ≥ 1` (bootcamp) |
| 🧠 Polymath | `unique course.completed ≥ 3` (distinct courses) |
| 🏆 Concurrency Master | `meta` of the four count/gold badges above (platinum capstone) |

Two bootcamp badges already exist in the central catalog and light up
automatically now that the app emits `lesson.completed`:
**Getting Started** (`count lesson.completed ≥ 1`) and **Scholar**
(`count lesson.completed ≥ 10`). Emitting `service.visited` also contributes to
the ecosystem-wide **Ecosystem Explorer** badge.

## Cross-origin note

The chest lives on the Core API (`api.readysetcloud.io`), a different origin
from the app (`bootcamp.readysetcloud.io`), and the course pages are
cross-origin isolated (COOP/COEP `require-corp`). The `fetch` calls use CORS, so
the Core API must return `Access-Control-Allow-Origin` (and allow the
`Authorization` header) for `/badges/*` — which it already does for the other
apps in the ecosystem. No change is needed here; it's a Core-API-side contract.

## Deploying the new badges

1. Append the entries from `catalog-additions.json` to
   `readysetcloud/rsc-core/functions/badges/catalog.json` and bump its
   `version`. (This repo cannot push to rsc-core; the file here is the
   ready-to-merge source.)
2. Deploy rsc-core. `GET /badges/catalog` now advertises them.
3. **No automatic backfill** (per rsc-core's AGENTS.md): a badge added after a
   user already crossed its threshold is awarded on their *next* matching
   activity, not retroactively. The sign-in replay in `js/app.js` re-emits every
   completed item, so a returning signed-in user re-triggers evaluation and
   earns anything they already qualify for the next time they open the app.
