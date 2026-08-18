import { useEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import type { PageDocumentPage } from '../types/content';
import styles from './NavOverlay.module.css';

export interface NavOverlayProps {
  /** Page links to show, already filtered and ordered by the caller. */
  pages: PageDocumentPage[];
  /** The public path for a page (`/` for home) — shared with {@link SiteNav}. */
  pagePath: (page: PageDocumentPage) => string;
  /** Close the overlay (Esc, backdrop, close button, or navigating a link). */
  onClose: () => void;
}

/** Interactive descendants, in DOM order, used for the focus trap. */
const FOCUSABLE =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The mobile full-screen navigation overlay (DESIGN.md §3). It is a modal
 * dialog: focus is trapped inside it, `Esc` and a backdrop click close it, each
 * link closes it on navigate, and the body is scroll-locked while it is open.
 * Rendered by {@link SiteNav} only when the menu is open, so its links never
 * duplicate the inline "Primary" nav in the DOM.
 */
export default function NavOverlay({ pages, pagePath, onClose }: NavOverlayProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Lock body scroll while open; restore the previous value on close.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Move focus into the overlay on open (the close button, first in the DOM).
  useEffect(() => {
    const first = dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusables = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
    );
    if (focusables.length === 0) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;

    // Wrap the tab order so focus never escapes the open overlay.
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    isActive ? `${styles.link} ${styles.active}` : styles.link;

  return (
    <div
      ref={dialogRef}
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-label="Navigation menu"
      onKeyDown={handleKeyDown}
      onClick={(event) => {
        // Backdrop click (the panel stops it) closes the overlay.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={styles.panel}>
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
          aria-label="Close menu"
        >
          <span aria-hidden="true">✕</span>
        </button>
        <nav aria-label="Site menu" className={styles.nav}>
          <ul className={styles.list}>
            {pages.map((page) => (
              <li key={page.id}>
                <NavLink
                  to={pagePath(page)}
                  end={page.slug === 'home'}
                  className={linkClass}
                  onClick={onClose}
                >
                  {page.nav_label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}
