import { useRevealOnce } from '../../lib/useRevealOnce';
import styles from './Meter.module.css';

export interface MeterProps {
  /** Fill level as a percentage, 0–100 (clamped). */
  value: number;
  /**
   * Accessible name for the measurement (e.g. a skill name). Becomes the
   * meter's `aria-label`; also rendered as a visible mono label when `showLabel`.
   */
  label?: string;
  /** Render `label` as a visible mono caption above the track. */
  showLabel?: boolean;
  /** Render the numeric percent as a mono, tabular-nums readout (DESIGN.md §2.3). */
  showValue?: boolean;
  className?: string;
}

const clampPercent = (value: number): number =>
  Math.max(0, Math.min(100, Math.round(value)));

/**
 * Meter — a 4px `--line` track with an `--amber` fill at a given percent
 * (DESIGN.md §4). The fill animates its width up from zero the first time the
 * meter scrolls into view (via useRevealOnce); under `prefers-reduced-motion`
 * the reveal resolves immediately and the CSS transition is disabled, so it
 * renders fully filled and static (DESIGN.md §6). Numeric labels use
 * tabular-nums so live values don't jitter (DESIGN.md §2.3).
 */
export default function Meter({
  value,
  label,
  showLabel = false,
  showValue = false,
  className,
}: MeterProps) {
  const [ref, revealed] = useRevealOnce<HTMLDivElement>();
  const percent = clampPercent(value);
  const classes = [styles.meter, className].filter(Boolean).join(' ');

  return (
    <div ref={ref} className={classes}>
      {(showLabel || showValue) && (
        <div className={styles.caption}>
          {showLabel && label != null && (
            <span className={styles.label}>{label}</span>
          )}
          {showValue && (
            <span className={styles.value}>{percent}%</span>
          )}
        </div>
      )}
      <div
        className={styles.track}
        role="meter"
        aria-label={label}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={`${percent}%`}
      >
        <div
          className={styles.fill}
          style={{ width: `${revealed ? percent : 0}%` }}
        />
      </div>
    </div>
  );
}
