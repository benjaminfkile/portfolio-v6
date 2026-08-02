import { NavLink } from 'react-router-dom';
import { useContentDocument } from '../lib/useContentDocument';
import type { PageDocumentPage } from '../types/content';
import styles from './SiteNav.module.css';

/** The public path a page renders at: `/` for `home`, `/<slug>` otherwise (§3.10). */
function pagePath(page: PageDocumentPage): string {
  return page.slug === 'home' ? '/' : `/${page.slug}`;
}

/**
 * The site header nav, derived from the published document (spec §3.10). Lists
 * the pages with a non-null `nav_label`, ordered by `nav_position`, each linking
 * to its public path, and appends a static "Blog" link for the blog routes
 * (§3.6) which live outside the pages document. Rendered by the shared layout so
 * it appears on content pages and blog pages alike.
 *
 * It reads the same document as `ContentPage` (via `useContentDocument`), so in
 * preview mode the nav reflects the draft — including pages that exist only in
 * the draft. While the document is loading or has failed to load, only the
 * static Blog link shows; the nav never blocks the page.
 *
 * `NavLink` supplies the active state; the home link is `end` so it is active
 * only at exactly `/`, not on every child route.
 */
export default function SiteNav() {
  const { state } = useContentDocument();

  const pages =
    state.status === 'ready'
      ? (state.document.pages ?? [])
          .filter((page) => page.nav_label != null)
          .slice()
          .sort((a, b) => a.nav_position - b.nav_position)
      : [];

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    isActive ? `${styles.link} ${styles.active}` : styles.link;

  return (
    <nav className={styles.nav} aria-label="Primary">
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
  );
}
