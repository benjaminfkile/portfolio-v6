import { useEffect, useState } from 'react';
import type { SectionProps } from './types';
import type { OpsSectionData } from '../types/content';
import { getOps } from '../lib/api';
import type { OpsResponse, OpsSeries, OpsWidget } from '../lib/api';
import SectionShell from '../components/ui/SectionShell';
import Panel from '../components/ui/Panel';
import StatusDot from '../components/ui/StatusDot';
import Gauge from '../components/ui/Gauge';
import AreaChart from '../components/ui/AreaChart';
import StatBlock from '../components/ui/StatBlock';
import styles from './OpsSection.module.css';

/**
 * The live `ops` section (spec §3.5, DESIGN.md §5, v1.3) — the owner's CloudWatch
 * dashboard rendered through the site's own instruments: a responsive grid of
 * `Panel`s (1-col → 2-col ≥900 → 3-col ≥1200), each a mono widget title above a
 * `Gauge` (kind `gauge`) or an `AreaChart` + `StatBlock` readout (kind `chart`),
 * with the `latest` value shown prominently either way. A mono strip above the
 * grid carries the window label ("LAST 3H", from `window_hours`), the last-
 * refresh time (mono `tabular-nums`), and a `StatusDot`.
 *
 * Its *config* is published (`window_hours`, header copy); its *data* is fetched
 * at runtime from `GET /api/ops?window_hours=<n>`. Like the other live sections
 * it refetches on a ~60s interval, but only while the tab is visible — a hidden
 * tab must not poll (§3.5) — and refetches immediately on returning to the
 * foreground. The `StatusDot` reads `ok` while fetches succeed and flips to
 * `warn` when a later poll degrades (keeping the last good reading rather than
 * blanking the grid).
 *
 * Standard degrade rules: an `{ available: false }` payload or a failed *first*
 * fetch renders **nothing** (§3.5); while the first fetch is in flight the
 * section renders nothing too (a quiet placeholder, matching the degrade path so
 * an unavailable dashboard never flashes a shell). Each instrument's SVG is
 * decorative (`aria-hidden`) with a visually-hidden summary carrying the reading
 * to assistive tech (§7).
 */
/** Re-poll to match the endpoint's ~5m cache without going stale (DESIGN.md §5). */
const POLL_INTERVAL_MS = 60_000;
const DEFAULT_WINDOW_HOURS = 3;

type ReadyData = Extract<OpsResponse, { available: true }>;

type LoadState =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'ready'; data: ReadyData; refreshedAt: number; healthy: boolean };

/** Clamp the configured lookback to the endpoint's validated 1–24h range. */
function clampWindowHours(hours: number | undefined): number {
  if (hours == null || !Number.isFinite(hours)) return DEFAULT_WINDOW_HOURS;
  return Math.min(24, Math.max(1, Math.trunc(hours)));
}

/**
 * Compact, unit-aware number formatting for readouts and axis labels.
 *
 * Unitless metrics are counts (connections, requests, credits) — a 5-minute
 * `Average` produces values like 12.4 connections, which is statistically real
 * but reads absurd, so counts display as whole numbers. Percent readings get
 * one decimal; other units two; anything ≥100 drops decimals entirely.
 */
function formatValue(value: number, unit: string | null): string {
  const digits =
    unit == null || Math.abs(value) >= 100 ? 0 : unit === '%' ? 1 : 2;
  return value.toLocaleString('en-US', { maximumFractionDigits: digits });
}

/** `HH:MM:SS` local time for the last-refresh readout. */
function formatRefresh(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** Series carrying at least one point, in payload order (primary first). */
function withPoints(widget: OpsWidget): OpsSeries[] {
  return widget.series.filter((s) => s.points.length > 0);
}

function OpsWidgetPanel({ widget }: { widget: OpsWidget }) {
  const unit = widget.unit ?? undefined;
  const unitText = widget.unit ?? '';

  if (widget.kind === 'gauge') {
    // Gauge carries the latest reading big-and-centred; the mono title is the
    // gauge label, which also feeds its visually-hidden summary (§7).
    return (
      <Panel as="li" className={styles.widget}>
        <h3 className={styles.title}>{widget.title}</h3>
        <Gauge
          value={widget.latest ?? 0}
          unit={unit}
          label={widget.title}
          format={(v) => formatValue(v, widget.unit)}
        />
      </Panel>
    );
  }

  // Chart. Single-series: the latest value is emphasised as a StatBlock
  // readout. Multi-series: a single "Latest" is MISLEADING — the payload's
  // `latest` is only the first series, and on a widget like CPU credits
  // (SurplusCharged≈0, Usage≈0, Balance=500+) it reads as the wrong line — so
  // each series gets its own latest in the legend instead.
  const series = withPoints(widget);
  const primary = series[0]?.points ?? [];
  const overlays = series.slice(1).map((s) => s.points);
  const multi = series.length > 1;

  const seriesLatest = (s: OpsSeries): number | null =>
    s.points.length > 0 ? s.points[s.points.length - 1].v : null;

  const latestText =
    widget.latest != null
      ? `${formatValue(widget.latest, widget.unit)}${unitText}`
      : 'no data';
  const summary = multi
    ? `${widget.title}: ${series
        .map(
          (s, i) =>
            `${s.label ?? `series ${i + 1}`} ${
              seriesLatest(s) != null
                ? `${formatValue(seriesLatest(s)!, widget.unit)}${unitText}`
                : 'no data'
            }`,
        )
        .join(', ')}`
    : `${widget.title}: latest ${latestText}`;

  return (
    <Panel as="li" className={styles.widget}>
      <h3 className={styles.title}>{widget.title}</h3>
      <div className={styles.chartBody}>
        {!multi && (
          <StatBlock
            className={styles.readout}
            value={widget.latest != null ? formatValue(widget.latest, widget.unit) : '—'}
            unit={widget.latest != null ? unit : undefined}
            label="Latest"
          />
        )}
        <AreaChart
          className={styles.chart}
          points={primary}
          series={overlays.length > 0 ? overlays : undefined}
          summary={summary}
          format={(v) => formatValue(v, widget.unit)}
        />
        {/* Multi-series: per-series latest readouts (labels fall back to the
            metric name server-side; scrubbed identifier labels arrive null and
            render as "series N"). */}
        {multi && (
          <ul className={styles.legend}>
            {series.map((s, i) => (
              <li key={i} className={styles.legendItem} data-series={i}>
                {s.label ?? `series ${i + 1}`}{' '}
                <span className={styles.legendValue}>
                  {seriesLatest(s) != null
                    ? `${formatValue(seriesLatest(s)!, widget.unit)}${unitText}`
                    : '—'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}

export default function OpsSection({ section }: SectionProps) {
  const config = section.data as OpsSectionData;
  const windowHours = clampWindowHours(config.window_hours);
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    const load = () => {
      getOps(windowHours)
        .then((data) => {
          if (cancelled) return;
          if (data.available) {
            setState({
              status: 'ready',
              data,
              refreshedAt: Date.now(),
              healthy: true,
            });
          } else {
            degrade();
          }
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          degrade();
          console.error('Failed to load ops telemetry', error);
        });
    };

    // Degrade: nothing before the first good reading; a later poll failure keeps
    // the last data and flips the StatusDot rather than blanking the grid (§3.5).
    const degrade = () => {
      setState((prev) =>
        prev.status === 'ready'
          ? { ...prev, healthy: false }
          : { status: 'unavailable' },
      );
    };

    load(); // initial fetch on mount

    // Poll on the interval, but each tick only fetches while the tab is visible;
    // a hidden tab's ticks are no-ops, so a backgrounded tab never polls (§3.5).
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, POLL_INTERVAL_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [windowHours]);

  // Degrade to nothing: an unavailable dashboard (or the pre-first-fetch state)
  // removes the section entirely rather than showing a shell (§3.5).
  if (state.status !== 'ready') return null;

  const { data, refreshedAt, healthy } = state;

  return (
    <SectionShell
      title={config.heading ?? 'Ops'}
      eyebrow={config.eyebrow ?? '// live telemetry'}
      intro={config.intro}
      className={styles.ops}
    >
      <div className={styles.strip}>
        <span className={styles.window}>LAST {windowHours}H</span>
        <span className={styles.refresh}>{formatRefresh(refreshedAt)}</span>
        <StatusDot
          variant={healthy ? 'ok' : 'warn'}
          label={healthy ? 'Live data up to date' : 'Live data stale'}
        />
      </div>
      <ul className={styles.grid}>
        {data.widgets.map((widget, i) => (
          <OpsWidgetPanel key={i} widget={widget} />
        ))}
      </ul>
    </SectionShell>
  );
}
