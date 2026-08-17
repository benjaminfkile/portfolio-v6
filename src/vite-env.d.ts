/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API origin. Empty locally (same-origin via the dev proxy — spec §10). */
  readonly VITE_API_BASE_URL?: string;
  /**
   * SignalR hub origin (REALTIME.md). Empty or unset falls back to
   * {@link VITE_API_BASE_URL} — the hub lives at `<origin>/hub`, WebSockets-only
   * with `skipNegotiation: true`, and events are hints (fetch is truth).
   */
  readonly VITE_HUB_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
