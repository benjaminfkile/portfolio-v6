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
  /**
   * Realtime channel prefix (REALTIME.md, task 88). Channels the API publishes
   * on are namespaced by the API's manifest service name — `portfolio-v6-api`
   * in prod, `portfolio-v6-api-dev` in dev — so the dev site must subscribe
   * under the dev prefix or it will never see events. Unset defaults to
   * `portfolio-v6-api` so prod needs no new config.
   */
  readonly VITE_HUB_CHANNEL_PREFIX?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
