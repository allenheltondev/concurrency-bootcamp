/* The deployment-dormancy flag the old AuthContext carried: null while
   /auth-config.json loads, false when accounts are disabled on this
   deployment, true when they're live. The package's useAuth doesn't know
   about dormancy — that contract is this app's alone. */

import { useEffect, useState } from "react";
import { getConfig } from "./config";

export function useConfigured(): boolean | null {
  const [configured, setConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    let live = true;
    getConfig().then((config) => {
      if (live) setConfigured(!!config);
    });
    return () => {
      live = false;
    };
  }, []);

  return configured;
}
