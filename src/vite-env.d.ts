/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API origin. Empty locally (same-origin via the dev proxy — spec §10). */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
