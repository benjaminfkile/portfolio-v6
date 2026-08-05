import { hasPreviewToken } from './preview';

/**
 * First-party analytics beacon client (spec §4.8, v1.4).
 *
 * Fires a small allowlist of events to `POST /api/beacon`, which always answers
 * 204. Privacy rules here are load-bearing, not optional (§4.8, §7):
 *
 *  - **Do Not Track / Global Privacy Control are honored** — nothing is sent when
 *    `navigator.doNotTrack === '1'` or `navigator.globalPrivacyControl` is truthy.
 *  - **Preview mode never beacons** — a URL carrying a `?preview=` token is the
 *    admin previewing draft content in an iframe, not a real visitor.
 *
 * Delivery is fire-and-forget: `navigator.sendBeacon` with a keepalive `fetch`
 * fallback, no retries, no queue, every error swallowed. A broken beacon must
 * never surface to — or slow down — a visitor.
 */

/** The hard event allowlist the ingest accepts (§4.8); anything else is dropped. */
export type BeaconEvent =
  | 'pageview'
  | 'link_out'
  | 'video_play'
  | 'theme_toggle'
  | 'scroll_depth';

const ENDPOINT = '/api/beacon';

/**
 * Whether analytics must stay silent for this request: Do Not Track, Global
 * Privacy Control, or preview mode (§4.8, §7). Any of the three suppresses every
 * event.
 */
function suppressed(): boolean {
  if (typeof navigator === 'undefined') return true;
  if (navigator.doNotTrack === '1') return true;
  const gpc = (navigator as Navigator & { globalPrivacyControl?: unknown })
    .globalPrivacyControl;
  if (gpc) return true;
  return hasPreviewToken();
}

/**
 * Send one analytics event (§4.8). No-ops under DNT/GPC or in preview mode. The
 * body is `{ event, path, referrer?, meta? }` — `path` is the site's own
 * pathname; `referrer` is `document.referrer` (dropped when empty; the server
 * reduces it to an origin). `meta` is passed through only when provided.
 *
 * Prefers `navigator.sendBeacon` (survives page unload); falls back to a
 * keepalive `fetch` POST when `sendBeacon` is unavailable or refuses the payload.
 */
export function sendEvent(
  event: BeaconEvent,
  meta?: Record<string, unknown>,
): void {
  try {
    if (suppressed()) return;

    const body: Record<string, unknown> = {
      event,
      path: window.location.pathname,
      referrer: document.referrer || undefined,
    };
    if (meta) body.meta = meta;
    const payload = JSON.stringify(body);

    if (typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([payload], { type: 'application/json' });
      if (navigator.sendBeacon(ENDPOINT, blob)) return;
      // sendBeacon returned false (queue full / too large) — fall through.
    }

    void fetch(ENDPOINT, {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    }).catch(() => {
      /* fire-and-forget: swallow network errors, no retry (§4.8). */
    });
  } catch {
    /* Analytics must never throw into a visitor's session (§4.8). */
  }
}
