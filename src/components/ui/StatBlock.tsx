import type { ReactNode } from 'react';
import styles from './StatBlock.module.css';

export interface StatBlockProps {
  /** The headline reading — a mono, tabular-nums number (DESIGN.md §2.3). */
  value: ReactNode;
  /** Optional unit suffix (e.g. `%`, `ms`, `req/s`), dimmed beside the value. */
  unit?: ReactNode;
  /** Mono, uppercase, dim caption naming the reading (DESIGN.md §4). */
  label: ReactNode;
  /**
   * Optional small secondary line — a delta ("+12% vs. 3h") or sub-note,
   * rendered in `--text-dim` beneath the value (DESIGN.md §4).
   */
  delta?: ReactNode;
  className?: string;
}

/**
 * StatBlock — a big tabular-nums value + unit over a mono uppercase label, with
 * an optional small delta/sub line (DESIGN.md §4). The dashboard's plain-number
 * readout, paired with a `Gauge` or `AreaChart` in the ops widgets (DESIGN.md
 * §5). Tokens only; no motion.
 */
export default function StatBlock({
  value,
  unit,
  label,
  delta,
  className,
}: StatBlockProps) {
  const classes = [styles.stat, className].filter(Boolean).join(' ');

  return (
    <div className={classes}>
      <span className={styles.value}>
        {value}
        {unit != null && unit !== '' && (
          <span className={styles.unit}>{unit}</span>
        )}
      </span>
      <span className={styles.label}>{label}</span>
      {delta != null && delta !== '' && (
        <span className={styles.delta}>{delta}</span>
      )}
    </div>
  );
}
