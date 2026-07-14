/* Read/emit for the shared Ready, Set, Cloud badge chest. One chest spans every
   app, keyed on the Cognito `sub`; the rules engine, catalog, and API live in
   rsc-core, and @readysetcloud/ui ships the client + the <BadgeChest> component.
   This app only reads the chest (profile) and emits a visit — course
   accomplishments are emitted by the vanilla course pages (js/account.js). */

import { createBadgeClient } from "@readysetcloud/ui";
import { getFreshIdToken } from "@readysetcloud/ui/auth";
import { CORE_API_DEFAULT, getConfig } from "./config";

/* The chest payload is whatever GET /badges/me returns — spread straight onto
   <BadgeChest {...chest} />. Derive its type from the client so we never drift
   from the package. */
export type Chest = Awaited<ReturnType<ReturnType<typeof createBadgeClient>["getChest"]>>;

let clientPromise: Promise<ReturnType<typeof createBadgeClient>> | null = null;

async function badgeClient() {
  if (!clientPromise) {
    clientPromise = getConfig().then((cfg) =>
      createBadgeClient({
        baseUrl: import.meta.env.VITE_CORE_API_URL || cfg?.coreApiBase || CORE_API_DEFAULT,
        getToken: getFreshIdToken
      })
    );
  }
  return clientPromise;
}

export async function getChest(): Promise<Chest> {
  return (await badgeClient()).getChest();
}

/* A signed-in visit to the hub/profile contributes to the ecosystem
   "explorer" badge; one per UTC day is plenty. Fire-and-forget. */
export async function recordVisit(): Promise<void> {
  try {
    const client = await badgeClient();
    await client.recordActivity({
      action: "service.visited",
      value: "bootcamp",
      service: "bootcamp",
      id: `visit#bootcamp#${new Date().toISOString().slice(0, 10)}`
    });
  } catch {
    /* offline / 5xx — the next visit re-sends it (the engine dedupes by id) */
  }
}

/** Test hook: forget the memoized client so each test can stub its own. */
export function resetBadgeClientForTests(): void {
  clientPromise = null;
}
