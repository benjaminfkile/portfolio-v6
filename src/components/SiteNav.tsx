import { useEffect, useRef, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useContentDocument } from '../lib/useContentDocument';
import { getStatus } from '../lib/api';
import type { StatusResponse } from '../lib/api';
import type { PageDocumentPage } from '../types/content';
import StatusDot from './ui/StatusDot';
import type { StatusVariant } from './ui/StatusDot';
import ThemeToggle from './ThemeToggle';
import NavOverlay from './NavOverlay';
import styles from './SiteNav.module.css';

/** The public path a page renders at: `/` for `home`, `/<slug>` otherwise (§3.10). */
function pagePath(page: PageDocumentPage): string {
  return page.slug === 'home' ? '/' : `/${page.slug}`;
}

/** Human-readable labels for the top-bar live status LED (DESIGN.md §7). */
const STATUS_LABEL: Record<StatusVariant, string> = {
  ok: 'All systems operational',
  warn: 'Some services degraded',
  err: 'Service outage',
};

/**
 * Collapse the curated `/api/status` payload into a single top-bar indicator: a
 * red dot if any service is down, amber if the API reports itself degraded,
 * green otherwise (DESIGN.md §5, §7).
 */
function deriveStatus(data: StatusResponse): StatusVariant {
  if (data.services?.some((service) => !service.ok)) return 'err';
  if (data.degraded) return 'warn';
  return 'ok';
}

/**
 * The site header (DESIGN.md §3): a top bar with the brand, the document-driven
 * page links, a live status LED fed by `GET /api/status`, and the theme toggle.
 * At ≥900px the page links sit inline; below that a 44px hamburger opens the
 * full-screen {@link NavOverlay}.
 *
 * The page links are derived from the published document (spec §3.10) — the
 * pages with a non-null `nav_label`, ordered by `nav_position` — plus a static
 * "Blog" link for the blog routes (§3.6). It reads the same document as
 * `ContentPage` (via `useContentDocument`), so preview mode reflects the draft.
 * While the document is loading or failed, only the static Blog link shows; the
 * nav never blocks the page.
 *
 * The status LED degrades silently: a failed `/api/status` fetch simply renders
 * no dot (DESIGN.md §5) — it never blocks the header. `NavLink` supplies the
 * active state; the home link is `end` so it is active only at exactly `/`.
 */
export default function SiteNav() {
  const { state } = useContentDocument();
  const [menuOpen, setMenuOpen] = useState(false);
  const [status, setStatus] = useState<StatusVariant | null>(null);
  const hamburgerRef = useRef<HTMLButtonElement>(null);

  // Live status LED — degrade to no dot on failure, never block the header (§5).
  useEffect(() => {
    const controller = new AbortController();
    getStatus({ signal: controller.signal })
      .then((data) => setStatus(deriveStatus(data)))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setStatus(null);
        console.error('Failed to load service status', error);
      });
    return () => controller.abort();
  }, []);

  const pages =
    state.status === 'ready'
      ? (state.document.pages ?? [])
          .filter((page) => page.nav_label != null)
          .slice()
          .sort((a, b) => a.nav_position - b.nav_position)
      : [];

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    isActive ? `${styles.link} ${styles.active}` : styles.link;

  const closeMenu = () => {
    setMenuOpen(false);
    // Return focus to the control that opened the overlay (DESIGN.md §7).
    hamburgerRef.current?.focus();
  };

  return (
    <header className={styles.header}>
      <div className={styles.bar}>
        <Link to="/" className={styles.brand}>
          <span className={styles.mark} aria-hidden="true" />
          <span className={styles.brandText}>ben kile</span>
        </Link>

        <nav aria-label="Primary" className={styles.primary}>
          <ul className={styles.list}>
            {pages.map((page) => (
              <li key={page.id}>
                <NavLink
                  to={pagePath(page)}
                  end={page.slug === 'home'}
                  className={linkClass}
                >
                  {page.nav_label}
                </NavLink>
              </li>
            ))}
            <li>
              <NavLink to="/blog" className={linkClass}>
                Blog
              </NavLink>
            </li>
          </ul>
        </nav>

        <div className={styles.actions}>
          {status && (
            <StatusDot
              variant={status}
              label={STATUS_LABEL[status]}
              className={styles.statusDot}
            />
          )}
          <ThemeToggle />
          <button
            ref={hamburgerRef}
            type="button"
            className={styles.hamburger}
            aria-label="Open menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <span aria-hidden="true" className={styles.hamburgerBars} />
          </button>
        </div>
      </div>

      {menuOpen && (
        <NavOverlay pages={pages} pagePath={pagePath} onClose={closeMenu} />
      )}
    </header>
  );
}
