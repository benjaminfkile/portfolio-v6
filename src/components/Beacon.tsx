import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { sendEvent } from '../lib/beacon';

/**
 * The single, invisible analytics mount (spec §4.8, v1.4). Rendered once inside
 * {@link SiteLayout} so it lives for the whole session and sees every route.
 * It owns the three page-level events; the two element-level events fire from
 * where their element renders (`theme_toggle` in {@link ThemeToggle},
 * `video_play` via {@link MediaFrame}'s `onFirstPlay`). All suppression — Do Not
 * Track, GPC, preview mode — lives in {@link sendEvent}, so this component never
 * decides whether to beacon, only when.
 *
 *  - **pageview** on every route change.
 *  - **scroll_depth** once per pageview, the first time the visitor scrolls past
 *    75% of the document; re-armed on navigation, and skipped entirely on pages
 *    shorter than the viewport (there is nothing to scroll).
 *  - **link_out** on a captured click of an external `http(s)` anchor.
 */
const SCROLL_THRESHOLD = 0.75;

export default function Beacon() {
  const location = useLocation();

  // Pageview + scroll_depth: keyed on pathname so both reset on every route
  // change. `fired` re-arms with the effect, giving one scroll_depth per page.
  useEffect(() => {
    sendEvent('pageview');

    let fired = false;
    const onScroll = () => {
      if (fired) return;
      const viewport = window.innerHeight;
      const full = document.documentElement.scrollHeight;
      // Nothing to scroll when the page is no taller than the viewport.
      if (full <= viewport) return;
      const progress = (window.scrollY + viewport) / full;
      if (progress >= SCROLL_THRESHOLD) {
        fired = true;
        sendEvent('scroll_depth');
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [location.pathname]);

  // link_out: one capture-phase listener for the whole document. An anchor whose
  // resolved href is http(s) and points at a different origin is an outbound
  // click; internal navigation and non-web schemes (mailto:, tel:, #anchors) are
  // ignored. The stored href is origin-stripped (host + path) and capped.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const start = event.target as Element | null;
      const anchor = start?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor) return;

      let url: URL;
      try {
        url = new URL(anchor.getAttribute('href') || '', window.location.href);
      } catch {
        return;
      }
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
      if (url.origin === window.location.origin) return;

      const href = (url.hostname + url.pathname).slice(0, 200);
      sendEvent('link_out', { href });
    };

    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  return null;
}
