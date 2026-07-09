/* Runtime deployment config. /auth-config.json is published by the deploy
   pipeline only when the backend is enabled — the same dormancy contract
   js/account.js uses. Absent, malformed, or unreachable config resolves to
   null: the app still renders (hub works; profile explains that accounts
   aren't enabled). The pool id is never hard-coded. */

export interface AuthConfig {
  clientId: string;
  region: string;
  apiBase: string;
}

let configPromise: Promise<AuthConfig | null> | null = null;

export function getConfig(): Promise<AuthConfig | null> {
  if (!configPromise) {
    configPromise = fetch("/auth-config.json", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return null;
        const raw: unknown = await res.json();
        if (!raw || typeof raw !== "object") return null;
        const { clientId, region, apiBase } = raw as Record<string, unknown>;
        if (typeof clientId !== "string" || !clientId) return null;
        if (typeof region !== "string" || !region) return null;
        return {
          clientId,
          region,
          apiBase: typeof apiBase === "string" && apiBase ? apiBase : "/api"
        };
      })
      .catch(() => null);
  }
  return configPromise;
}

/** Test hook: forget the memoized fetch so each test can stub its own. */
export function resetConfigForTests(): void {
  configPromise = null;
}
