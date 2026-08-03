import type { ReactNode } from 'react';
import styles from './EmptyState.module.css';

export interface EmptyStateProps {
  /** The page heading — the single `h1` for a 404 or empty page (DESIGN.md §7). */
  heading: string;
  /** Plain-language explanation beneath the instrument label. */
  message: ReactNode;
  /**
   * The mono "instrument voice" label above the heading (DESIGN.md §5). Defaults
   * to `NO SIGNAL`; decorative, so it is hidden from assistive tech.
   */
  label?: string;
  /** Optional action row — e.g. a `LinkButton` home. */
  action?: ReactNode;
}

/**
 * The shared 404 / empty-state block, rendered in the Control Room "instrument
 * voice" (DESIGN.md §5): a mono `NO SIGNAL` label, the page heading, a
 * plain-language line, and an optional action. Reused by the public 404
 * ({@link ../pages/NotFound}) and the "nothing published" home state.
 */
export default function EmptyState({
  heading,
  message,
  label = 'NO SIGNAL',
  action,
}: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      <p className={styles.signal} aria-hidden="true">
        {label}
      </p>
      <h1 className={styles.heading}>{heading}</h1>
      <p className={styles.message}>{message}</p>
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
