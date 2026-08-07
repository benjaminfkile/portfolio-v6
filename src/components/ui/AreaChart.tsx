import styles from './AreaChart.module.css';

/** A single time-series sample: `t` (time/x, monotonic) and `v` (value/y). */
export interface AreaPoint {
  t: number;
  v: number;
}

export interface AreaChartProps {
  /** Primary series, oldest → newest. The latest point is emphasised. */
  points: AreaPoint[];
  /**
   * Optional overlay series — each drawn in `--text-dim`, no area fill
   * (DESIGN.md §4). A single series may be passed bare for convenience.
   */
  series?: AreaPoint[] | AreaPoint[][];
  /**
   * One-sentence description of the chart for assistive tech; the SVG itself is
   * decorative (`aria-hidden`) so this carries the information (Chart rules, §7).
   */
  summary: string;
  /** Formats the min/max readout labels. Defaults to `String(v)`. */
  format?: (value: number) => string;
  /**
   * Optional time domain `[tMin, tMax]` (same units as `point.t`). When set, x is
   * mapped by *time* rather than by sample index — so a fixed-grid day plots on a
   * true time axis and missing samples read as gaps, not compressed spacing.
   * Absent → the default even-by-index spacing (§4).
   */
  domain?: [number, number];
  /**
   * Optional playhead cursor (§5, v1.7). Draws a vertical rule at time `t`
   * (positioned via `domain`) and, when `v` is non-null, an emphasised dot at the
   * reading there. When set it replaces the "latest" dot — the emphasis follows
   * the scrubber, not the newest sample.
   */
  cursor?: { t: number; v: number | null };
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

/** X for a time `t` mapped across a `[tMin, tMax]` domain, clamped to the plot. */
function xForTime(t: number, tMin: number, tMax: number): number {
  const span = tMax - tMin;
  const frac = span === 0 ? 1 : (t - tMin) / span;
  const clamped = Math.max(0, Math.min(1, frac));
  return PAD_X + clamped * (VB_W - 2 * PAD_X);
}

/** Y for value `v` within `[min, max]`; a flat series rides the vertical middle. */
function yFor(v: number, min: number, max: number): number {
  const span = max - min;
  const frac = span === 0 ? 0.5 : (v - min) / span;
  return PAD_Y + (1 - frac) * (VB_H - 2 * PAD_Y);
}

/** `M x y L x y …` through every sample, with a caller-supplied x-accessor. */
function linePath(
  pts: AreaPoint[],
  min: number,
  max: number,
  x: (i: number, p: AreaPoint) => number,
): string {
  return pts
    .map((p, i) => {
      const px = x(i, p).toFixed(2);
      const y = yFor(p.v, min, max).toFixed(2);
      return `${i === 0 ? 'M' : 'L'} ${px} ${y}`;
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
  domain,
  cursor,
  className,
}: AreaChartProps) {
  const classes = [styles.chart, className].filter(Boolean).join(' ');

  // Normalize: a bare second series becomes a one-entry overlay list.
  const overlays: AreaPoint[][] =
    series == null ? [] : Array.isArray(series[0]) ? (series as AreaPoint[][]) : [series as AreaPoint[]];

  // Domain spans every sample across every series so all fit the same box.
  const allValues = [
    ...points.map((p) => p.v),
    ...overlays.flat().map((p) => p.v),
  ];
  const hasData = allValues.length > 0;
  const min = hasData ? Math.min(...allValues) : 0;
  const max = hasData ? Math.max(...allValues) : 0;

  // X-accessor: by *time* across `domain` when given (true time axis, gaps show
  // as gaps), else the default even-by-index spacing.
  const xAt = (n: number): ((i: number, p: AreaPoint) => number) =>
    domain ? (_i, p) => xForTime(p.t, domain[0], domain[1]) : (i) => xFor(i, n);

  const primaryLine =
    points.length >= 2 ? linePath(points, min, max, xAt(points.length)) : '';
  const overlayLines = overlays
    .filter((o) => o.length >= 2)
    .map((o) => linePath(o, min, max, xAt(o.length)));

  // Area fill closes the primary line down to the baseline and back.
  const baseline = VB_H - PAD_Y;
  const firstX = domain
    ? xForTime(points[0]?.t ?? domain[0], domain[0], domain[1])
    : xFor(0, points.length);
  const lastX = domain
    ? xForTime(points[points.length - 1]?.t ?? domain[1], domain[0], domain[1])
    : xFor(points.length - 1, points.length);
  const areaPath =
    points.length >= 2
      ? `${primaryLine} L ${lastX.toFixed(2)} ${baseline} L ${firstX.toFixed(2)} ${baseline} Z`
      : '';

  // The "latest" dot yields to the playhead when a cursor is present.
  const latest = !cursor && points.length > 0 ? points[points.length - 1] : null;
  const cursorX =
    cursor && domain ? xForTime(cursor.t, domain[0], domain[1]) : null;

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
        {overlayLines.map((d, i) => (
          <path
            key={i}
            className={styles.series}
            data-role="series"
            data-series={(i % 2) + 1}
            d={d}
            fill="none"
            vectorEffect="non-scaling-stroke"
          />
        ))}
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
            cx={lastX.toFixed(2)}
            cy={yFor(latest.v, min, max).toFixed(2)}
            r={1.6}
          />
        )}
        {cursorX !== null && (
          <line
            className={styles.cursor}
            data-role="cursor"
            x1={cursorX.toFixed(2)}
            y1={PAD_Y}
            x2={cursorX.toFixed(2)}
            y2={baseline}
            vectorEffect="non-scaling-stroke"
          />
        )}
        {cursorX !== null && cursor?.v != null && (
          <circle
            className={styles.dot}
            data-role="cursor-dot"
            cx={cursorX.toFixed(2)}
            cy={yFor(cursor.v, min, max).toFixed(2)}
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
