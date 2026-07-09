# ADR 0002 — Platform surface in Vite + React; course engine stays vanilla

**Status:** Accepted — 2026-07-09
**Deciders:** Allen Helton

## Context

With the backend live-able (accounts, progress, gamification — phases 1–6 of
`docs/BACKEND_PLAN.md` merged) the product grows a second kind of UI. The two
kinds have nothing in common:

- **Courses** — the learning experience itself. ~5,000 lines of proven,
  dependency-free vanilla JS shipping two courses today. Its oddest features
  are load-bearing: content packs are plain scripts pushing into shared
  globals; the write-it grader executes learner code in sandboxed Web
  Workers; the atomics demo requires a cross-origin-isolated page; the app
  runs fully offline from a service worker with **no build step**; and CI
  validators load the actual page scripts in a Node VM to execute every
  exercise. Content is code (ADR 0001), and the authoring contract
  (`docs/COURSE_PATTERN.md`) is proven across two courses.
- **Platform** — the account-centric surface now on the roadmap: a public
  course hub, a profile page (XP, streaks, badge case, per-course progress),
  and whatever grows next to them. API-driven, stateful, component-shaped —
  and visually it should match the Ready, Set, Cloud identity already
  established by the newsletter dashboard (React 18 + Vite + Tailwind, token
  system already ported by hand into `js/account.js`'s auth modal).

Alternatives considered:

1. **Migrate everything to Vite + React.** Weeks of porting 36+ animated
   HTML/CSS lessons, redesigning the pack authoring contract, rebuilding the
   VM validators, and re-verifying grading semantics — to arrive at the same
   app. Kills "no build step" content authoring for zero user-visible gain.
   Rejected.
2. **Build the platform surface in vanilla too.** Consistent stack, but
   hand-rolled DOM strings for badge cases, progress cards, and future
   dashboards — slower to build, worse to maintain, and it forfeits the
   newsletter dashboard's existing component vocabulary and Tailwind config.
   Rejected.
3. **Hybrid: React for the platform surface, vanilla for the course
   engine.** Chosen.

## Decision

**Two stacks, one deliberate seam: the course engine (vanilla, ADR 0001) and
the platform surface (Vite + React), split at "learning experience" vs
"account experience".**

1. A new **`platform/`** app: Vite + React + TypeScript + Tailwind, mirroring
   the newsletter dashboard's setup — its CSS-variable token system, fonts,
   and component patterns are the design source of truth. Static build
   output, uploaded to the same S3 bucket behind the same CloudFront
   distribution. No new infrastructure kind: it is still "the site is the
   textbook" — the platform pages are just more static files.
2. **The seam is a contract, not a framework bridge.** The two stacks share
   exactly three things, all already defined:
   - the origin (so cookies never enter the picture and CORS stays absent),
   - the **auth session contract**: the `rsc:auth` localStorage document
     (`{idToken, refreshToken, expiresAt}`) plus the Cognito user pool API
     calls, and
   - the **backend API** (`/api/*`).
   No runtime imports cross the seam in either direction.
3. **Courses stay vanilla** until the engine itself resists a change we
   want to make. `js/account.js` (chip, modal, sync) continues to serve the
   course pages; the platform app renders its own React equivalents from the
   same session contract.
4. The platform app is **online-first**: no service worker of its own at
   launch. Offline is a course-experience feature; an account dashboard
   without a network has nothing truthful to show.

## Consequences

**Positive**

- Platform features build at newsletter-dashboard speed, with its components
  and tokens, and look like one product family.
- The course engine — the actual product — keeps its zero-dependency,
  no-build, offline-first, CI-executed properties untouched.
- The seam is honest: the boundary between "engine" and "platform" is a real
  product boundary, so the two-stack cost lands where a boundary would exist
  anyway.

**Negative / obligations**

- A build step enters the repo (CI + deploy grow a `platform/` build), and
  two UI stacks must be maintained.
- The RSC design tokens now exist in two places: `platform/`'s Tailwind
  config (canonical) and the hand-written CSS block in `js/account.js`.
  Changes must be mirrored — or the modal eventually retires in favor of
  redirecting course pages to the platform's auth screens.
- The auth session contract is now shared API surface between two codebases:
  changing the `rsc:auth` shape or the token semantics requires touching
  both, deliberately.
- SPA routing needs CloudFront support (rewrite of platform routes to the
  app's `index.html`) and, when the hub takes the root URL, a careful
  service-worker handover from the old root-scoped course worker
  (`docs/PLATFORM_PLAN.md` owns that migration).

**Revisit triggers**

- The vanilla engine starts resisting changes the roadmap needs (that is
  the moment to consider migrating *it*, with this ADR superseded).
- The platform surface grows to the point of subsuming course chrome
  (headers, navigation), making the duplicated account UI a real burden.
- Course authoring itself moves to tooling that wants a build step anyway.
