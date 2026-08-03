import styles from './AreaChart.module.css';

/** A single time-series sample: `t` (time/x, monotonic) and `v` (value/y). */
export interface AreaPoint {
  t: number;
  v: number;
}

export interface AreaChartProps {
  /** Primary series, oldest → newest. The latest point is emphasised. */
  points: AreaPoint[];
  /** Optional second series — drawn in `--text-dim`, no area fill (DESIGN.md §4). */
  series?: AreaPoint[];
  /**
   * One-sentence description of the chart for assistive tech; the SVG itself is
   * decorative (`aria-hidden`) so this carries the information (Chart rules, §7).
   */
  summary: string;
  /** Formats the min/max readout labels. Defaults to `String(v)`. */
  format?: (value: number) => string;
  className?: string;
}

/* viewBox is fixed; the SVG scales to its container width (width:100%,
   height:auto) so it never overflows (DESIGN.md §3, Chart rules). Strokes use
   vector-effect non-scaling so the line stays 1.5px at any rendered width. */
const VB_W = 100;
const VB_H = 40;
const PAD_X = 3;
const PAD_Y = 4;
/** Horizontal grid rules across the plot area (DESIGN.md §4: 3–4 faint rules). */
const GRID_LINES = 4;

/** X for sample `i` of `n`; a lone sample sits at the right (latest) edge. */
function xFor(i: number, n: number): number {
  if (n <= 1) return VB_W - PAD_X;
  return PAD_X + (i / (n - 1)) * (VB_W - 2 * PAD_X);
}

/** Y for value `v` within `[min, max]`; a flat series rides the vertical middle. */
function yFor(v: number, min: number, max: number): number {
  const span = max - min;
  const frac = span === 0 ? 0.5 : (v - min) / span;
  return PAD_Y + (1 - frac) * (VB_H - 2 * PAD_Y);
}

/** `M x y L x y …` through every sample. */
function linePath(pts: AreaPoint[], min: number, max: number): string {
  return pts
    .map((p, i) => {
      const x = xFor(i, pts.length).toFixed(2);
      const y = yFor(p.v, min, max).toFixed(2);
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');
}

/**
 * AreaChart — a hand-rolled SVG time series (no chart library, DESIGN.md §4): an
 * amber 1.5px line over an `--amber-soft` area fill, 3–4 faint `--line` grid
 * rules, an emphasised amber dot on the latest point, and min/max as small mono
 * labels — no axes or tooltips. An optional second `series` draws in `--text-dim`
 * with no fill. It scales to its container via the viewBox and never overflows;
 * `≤1` point renders just the latest value's dot. The SVG is decorative
 * (`aria-hidden`); the `summary` sentence carries the data (Chart rules, §7).
 */
export default function AreaChart({
  points,
  series,
  summary,
  format = String,
  className,
}: AreaChartProps) {
  const classes = [styles.chart, className].filter(Boolean).join(' ');

  // Domain spans every sample across both series so both fit the same box.
  const allValues = [
    ...points.map((p) => p.v),
    ...(series ?? []).map((p) => p.v),
  ];
  const hasData = allValues.length > 0;
  const min = hasData ? Math.min(...allValues) : 0;
  const max = hasData ? Math.max(...allValues) : 0;

  const primaryLine = points.length >= 2 ? linePath(points, min, max) : '';
  const seriesLine =
    series && series.length >= 2 ? linePath(series, min, max) : '';

  // Area fill closes the primary line down to the baseline and back.
  const baseline = VB_H - PAD_Y;
  const areaPath =
    points.length >= 2
      ? `${primaryLine} L ${xFor(points.length - 1, points.length).toFixed(2)} ${baseline} L ${xFor(0, points.length).toFixed(2)} ${baseline} Z`
      : '';

  const latest = points.length > 0 ? points[points.length - 1] : null;

  return (
    <div className={classes}>
      <svg
        className={styles.svg}
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {Array.from({ length: GRID_LINES }, (_, i) => {
          const y = PAD_Y + (i / (GRID_LINES - 1)) * (VB_H - 2 * PAD_Y);
          return (
            <line
              key={i}
              className={styles.grid}
              data-role="grid"
              x1={PAD_X}
              y1={y.toFixed(2)}
              x2={VB_W - PAD_X}
              y2={y.toFixed(2)}
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
        {areaPath !== '' && (
          <path
            className={styles.area}
            data-role="area"
            d={areaPath}
            vectorEffect="non-scaling-stroke"
          />
        )}
        {seriesLine !== '' && (
          <path
            className={styles.series}
            data-role="series"
            d={seriesLine}
            fill="none"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {primaryLine !== '' && (
          <path
            className={styles.line}
            data-role="line"
            d={primaryLine}
            fill="none"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {latest && (
          <circle
            className={styles.dot}
            data-role="dot"
            cx={xFor(points.length - 1, points.length).toFixed(2)}
            cy={yFor(latest.v, min, max).toFixed(2)}
            r={1.6}
          />
        )}
      </svg>
      {hasData && (
        <>
          <span className={`${styles.axisLabel} ${styles.axisMax}`}>
            {format(max)}
          </span>
          <span className={`${styles.axisLabel} ${styles.axisMin}`}>
            {format(min)}
          </span>
        </>
      )}
      <span className={styles.summary}>{summary}</span>
    </div>
  );
}
