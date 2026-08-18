import { useContentDocument } from '../lib/useContentDocument';
import styles from './SiteFooter.module.css';

/**
 * The site footer landmark (DESIGN.md §7 — semantic `header/nav/main/footer`).
 * A quiet console footer: the brand in the mono "instrument voice" and the
 * published document's SITE vN readout. Rendered once by {@link SiteLayout}
 * beneath every page.
 *
 * The version comes from the same {@link useContentDocument} the nav and
 * pages already share — no extra request. While loading or on a failed fetch
 * the readout is simply omitted (§3.5 degrade spirit).
 */
export default function SiteFooter() {
  const { state } = useContentDocument();
  const version = state.status === 'ready' ? state.document.version : undefined;

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <span className={styles.brand}>ben kile</span>
        {version != null && (
          <span className={styles.version} aria-label={`Site version ${version}`}>
            SITE v{version}
          </span>
        )}
      </div>
    </footer>
  );
}
