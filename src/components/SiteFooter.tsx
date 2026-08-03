import styles from './SiteFooter.module.css';

/**
 * The site footer landmark (DESIGN.md §7 — semantic `header/nav/main/footer`).
 * A quiet console footer: the brand in the mono "instrument voice" and a
 * plain-language line. Rendered once by {@link SiteLayout} beneath every page.
 */
export default function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <span className={styles.brand}>ben kile</span>
        <span className={styles.line}>Built and running as a live system.</span>
      </div>
    </footer>
  );
}
