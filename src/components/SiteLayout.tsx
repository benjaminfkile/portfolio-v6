import { Outlet } from 'react-router-dom';
import SiteNav from './SiteNav';
import SiteFooter from './SiteFooter';
import Beacon from './Beacon';
import styles from './SiteLayout.module.css';

/**
 * The shared chrome around every page (DESIGN.md §3, §7): a skip-to-content link
 * (the first focusable element, visually hidden until focused, targeting the
 * `main` landmark), the site header/nav, the routed page's own `<main>`, and the
 * footer. Semantic landmarks — `header` (`SiteNav`), `main` (each page), and
 * `footer` (`SiteFooter`) — bracket the `Outlet` so the nav and footer render on
 * content pages and blog pages alike. The invisible {@link Beacon} mounts here
 * too, once, so first-party analytics (spec §4.8) see every route.
 */
export default function SiteLayout() {
  return (
    <>
      <a className={styles.skipLink} href="#main-content">
        Skip to content
      </a>
      <Beacon />
      <SiteNav />
      <Outlet />
      <SiteFooter />
    </>
  );
}
