import { useRevealOnce } from '../../lib/useRevealOnce';
import styles from './Gauge.module.css';

export interface GaugeProps {
  /** Current reading; clamped to `[0, max]` for both the arc and the readout. */
  value: number;
  /** Full-scale value the arc fills to. Defaults to 100 (a percentage). */
  max?: number;
  /** Optional unit suffix shown beside the value (e.g. `%`, `ms`). */
  unit?: string;
  /**
   * What the gauge measures — rendered as the mono label beneath the dial and,
   * combined with the value, as the visually-hidden reading ("CPU utilization
   * 12%") that stands in for the decorative SVG (DESIGN.md §4, Chart rules).
   */
  label: string;
  className?: string;
}

/* Dial geometry: a 240° arc with the gap centred at the bottom, drawn over the
   top from the lower-left endpoint (−120°) clockwise to the lower-right (120°).
   Angles are measured clockwise from 12 o'clock. */
const CENTER = 50;
const RADIUS = 42;
const START_ANGLE = -120;
const END_ANGLE = 120;
const SWEEP_DEGREES = END_ANGLE - START_ANGLE; // 240
/** Geometric length of the full track arc; the dash budget for the sweep. */
const ARC_LENGTH = (RADIUS * SWEEP_DEGREES * Math.PI) / 180;

/** Point on the dial circle at a clock-angle (0° = top, clockwise positive). */
function polar(angleDeg: number): { x: number; y: number } {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return { x: CENTER + RADIUS * Math.cos(a), y: CENTER + RADIUS * Math.sin(a) };
}

/** SVG path for the full 240° dial arc (track and value share this geometry). */
function arcPath(): string {
  const start = polar(START_ANGLE);
  const end = polar(END_ANGLE);
  const largeArc = SWEEP_DEGREES > 180 ? 1 : 0;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

const clamp = (value: number, max: number): number =>
  Math.max(0, Math.min(max, value));

/**
 * Gauge — an SVG arc gauge (DESIGN.md §4): a `--line` track under an `--amber`
 * value arc proportional to `value / max`, with a big centred tabular-nums value
 * + unit and a mono label beneath. The value arc sweeps up from empty the first
 * time it scrolls into view (stroke-dashoffset via useRevealOnce); under
 * `prefers-reduced-motion` the reveal resolves immediately and the transition is
 * disabled, so it renders at its final angle, static (DESIGN.md §6).
 *
 * Out-of-range values are clamped to `[0, max]`. The SVG is decorative
 * (`aria-hidden`); a visually-hidden sentence built from the label, value and
 * unit carries the reading to assistive tech (Chart rules, §7).
 */
export default function Gauge({
  value,
  max = 100,
  unit,
  label,
  className,
}: GaugeProps) {
  const [ref, revealed] = useRevealOnce<HTMLDivElement>();
  const safeMax = max > 0 ? max : 1;
  const shown = clamp(value, safeMax);
  const fraction = shown / safeMax;

  // Reveal the leading `fraction` of the arc by shrinking the dash gap. Before
  // reveal the whole arc is hidden (offset === length), so the sweep animates in.
  const offset = revealed ? ARC_LENGTH * (1 - fraction) : ARC_LENGTH;
  const path = arcPath();

  const classes = [styles.gauge, className].filter(Boolean).join(' ');
  const unitText = unit ?? '';
  const summary = `${label} ${shown}${unitText}`;

  return (
    <div ref={ref} className={classes}>
      <div className={styles.dial}>
        <svg
          className={styles.svg}
          viewBox="0 0 100 80"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
        >
          <path
            className={styles.track}
            data-role="track"
            d={path}
            fill="none"
          />
          <path
            className={styles.arc}
            data-role="value"
            d={path}
            fill="none"
            style={{
              strokeDasharray: ARC_LENGTH,
              strokeDashoffset: offset,
            }}
          />
        </svg>
        <div className={styles.readout}>
          <span className={styles.value}>
            {shown}
            {unitText !== '' && <span className={styles.unit}>{unitText}</span>}
          </span>
        </div>
      </div>
      <span className={styles.label}>{label}</span>
      <span className={styles.summary}>{summary}</span>
    </div>
  );
}
