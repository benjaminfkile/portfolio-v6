import styles from './PreviewIndicator.module.css';

/**
 * A small, unobtrusive "preview" indicator shown while the site is rendering
 * draft content inside the admin's preview iframe (spec §7). It exists so it is
 * always obvious that what is on screen is not the published page.
 */
export default function PreviewIndicator() {
  return (
    <div className={styles.indicator} role="status" aria-label="Preview mode">
      Preview
    </div>
  );
}
