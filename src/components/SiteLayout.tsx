import { Outlet } from 'react-router-dom';
import SiteNav from './SiteNav';
import SiteFooter from './SiteFooter';
import styles from './SiteLayout.module.css';

/**
 * The shared chrome around every page (DESIGN.md §3, §7): a skip-to-content link
 * (the first focusable element, visually hidden until focused, targeting the
 * `main` landmark), the site header/nav, the routed page's own `<main>`, and the
 * footer. Semantic landmarks — `header` (`SiteNav`), `main` (each page), and
 * `footer` (`SiteFooter`) — bracket the `Outlet` so the nav and footer render on
 * content pages and blog pages alike.
 */
export default function SiteLayout() {
  return (
    <>
      <a className={styles.skipLink} href="#main-content">
        Skip to content
      </a>
      <SiteNav />
      <Outlet />
      <SiteFooter />
    </>
  );
}
