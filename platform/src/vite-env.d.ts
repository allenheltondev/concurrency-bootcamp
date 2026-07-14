/// <reference types="vite/client" />

interface ImportMetaEnv {
  /* Optional build-time override for the shared Core API (badge chest) base
     URL. Runtime /auth-config.json (coreApiBase) and the prod default both
     back it up — see src/lib/badges.ts. */
  readonly VITE_CORE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
