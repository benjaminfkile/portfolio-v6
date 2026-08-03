import type { CSSProperties, ReactNode } from 'react';
import styles from './Ticker.module.css';

export interface TickerProps {
  /** Seconds for one full loop of the content (default 30). */
  duration?: number;
  /** Accessible name for the marquee region. */
  'aria-label'?: string;
  className?: string;
  children: ReactNode;
}

/**
 * Ticker — a horizontal marquee for dense live data (DESIGN.md §4). The content
 * is rendered twice and the pair is translated left continuously; when the first
 * copy has fully scrolled, the second sits exactly where it began, so the loop is
 * seamless. The duplicate copy is `aria-hidden` so assistive tech reads the row
 * once. The whole animation is disabled under `prefers-reduced-motion`, leaving
 * the content static (DESIGN.md §6).
 */
export default function Ticker({
  duration = 30,
  'aria-label': ariaLabel,
  className,
  children,
}: TickerProps) {
  const classes = [styles.ticker, className].filter(Boolean).join(' ');
  // Duration is dynamic, so it travels as a custom property inline (§14.1 r4).
  const style = { '--ticker-duration': `${duration}s` } as CSSProperties;

  return (
    <div className={classes} aria-label={ariaLabel} style={style}>
      <div className={styles.track}>
        <div className={styles.group}>{children}</div>
        <div className={styles.group} aria-hidden="true">
          {children}
        </div>
      </div>
    </div>
  );
}
