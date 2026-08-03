import type { ReactNode } from 'react';
import styles from './Instrument.module.css';

export interface InstrumentProps {
  /** Mono, uppercase, dim label naming the readout (DESIGN.md §4). */
  label: ReactNode;
  /** The value line; may also be supplied as children. */
  value?: ReactNode;
  /** Render the value in amber (a live/active reading) instead of --text. */
  accent?: boolean;
  /** Optional leading slot — a StatusDot, album art, or other art. */
  leading?: ReactNode;
  /**
   * aria-live region politeness for values that update at runtime (e.g. the
   * now-playing instrument, DESIGN.md §7). Omit for static readouts.
   */
  live?: 'off' | 'polite' | 'assertive';
  className?: string;
  children?: ReactNode;
}

/**
 * Instrument — the signature Control Room readout: a mono uppercase label over
 * a mono value line, with an optional leading slot for a StatusDot or art. Used
 * by status, now-playing, and the hero strip (DESIGN.md §4, §5).
 */
export default function Instrument({
  label,
  value,
  accent = false,
  leading,
  live,
  className,
  children,
}: InstrumentProps) {
  const classes = [styles.instrument, className].filter(Boolean).join(' ');
  const valueClasses = [styles.value, accent && styles.accent]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes}>
      {leading != null && leading !== '' && (
        <span className={styles.leading}>{leading}</span>
      )}
      <span className={styles.readout}>
        <span className={styles.label}>{label}</span>
        <span className={valueClasses} aria-live={live}>
          {value ?? children}
        </span>
      </span>
    </div>
  );
}
