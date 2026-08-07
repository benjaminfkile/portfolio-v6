import { useEffect, useMemo, useState } from 'react';
import type { SectionProps } from './types';
import type { OpsSectionData } from '../types/content';
import { getOps } from '../lib/api';
import type { OpsReport, OpsSeries, OpsWidget } from '../lib/api';
import {
  DAY_SLOTS,
  dayEndMs,
  dayStartMs,
  formatGeneratedAt,
  formatLocalDateTime,
  formatWindowLabel,
  indexBySlot,
  latestSlot,
  normalizePoints,
  slotTimeMs,
  valueAtSlot,
} from '../lib/opsReplay';
import SectionShell from '../components/ui/SectionShell';
import Panel from '../components/ui/Panel';
import StatusDot from '../components/ui/StatusDot';
import Gauge from '../components/ui/Gauge';
import AreaChart from '../components/ui/AreaChart';
import StatBlock from '../components/ui/StatBlock';
import Scrubber from '../components/ui/Scrubber';
import styles from './OpsSection.module.css';

/**
 * The `ops` section (spec §3.5, DESIGN.md §5, v1.7) — a DAILY REPLAY of the
 * owner's curated CloudWatch dashboard. `GET /api/ops` returns one immutable
 * report per UTC day (built once, server-side, from the curated public
 * dashboard); the section replays it entirely client-side. There is no live
 * feedback loop and no polling — the report is fetched once.
 *
 * Every series covers the FULL UTC day at a fixed 5-minute grain. A draggable
 * playhead (`Scrubber`, mouse + touch + keyboard) selects a moment within the
 * day; the instrument readouts (`Gauge`s / `StatBlock`s) show the value at that
 * moment and the `AreaChart`s draw a cursor line there. Times along the scrubber
 * and readouts are shown in the VIEWER'S local zone, and the header labels the
 * window honestly ("24h ending <local datetime of 00:00 UTC>") — a UTC-day report
 * spans two local calendar days for most viewers.
 *
 * States: while the first fetch is in flight the section renders nothing; a 404
 * (no report built yet) or absent report renders a calm placeholder panel rather
 * than vanishing; a transport failure degrades the same way. Missing datapoints
 * within the day render as gaps (fewer samples), never zeros. Each instrument's
 * SVG is decorative (`aria-hidden`) with a visually-hidden summary (§7).
 */

const EYEBROW = '// daily replay';

type LoadState =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'ready'; report: OpsReport };

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

/** Series carrying at least one point, in payload order (primary first). */
function withPoints(widget: OpsWidget): OpsSeries[] {
  return widget.series.filter((s) => s.points.length > 0);
}

/** The value of a series at the playhead slot, or `null` (a gap at that moment). */
function seriesValueAtSlot(
  series: OpsSeries,
  dayStart: number,
  slot: number,
): number | null {
  return valueAtSlot(indexBySlot(normalizePoints(series.points), dayStart), slot);
}

interface WidgetProps {
  widget: OpsWidget;
  dayStart: number;
  dayEnd: number;
  slot: number;
}

function OpsWidgetPanel({ widget, dayStart, dayEnd, slot }: WidgetProps) {
  const unitText = widget.unit ?? '';
  const domain: [number, number] = [dayStart, dayEnd];
  const cursorTime = slotTimeMs(dayStart, slot);

  if (widget.kind === 'gauge') {
    // Gauge shows the reading at the playhead; a gap there reads as "—" (never a
    // fabricated zero). The format closure detects the gap since the arc value
    // itself falls back to 0 only to keep the geometry valid.
    const value = seriesValueAtSlot(widget.series[0] ?? { label: null, points: [] }, dayStart, slot);
    return (
      <Panel as="li" className={styles.widget}>
        <h3 className={styles.title}>{widget.title}</h3>
        <Gauge
          value={value ?? 0}
          unit={value == null ? undefined : (widget.unit ?? undefined)}
          label={widget.title}
          format={() => (value == null ? '—' : formatValue(value, widget.unit))}
        />
      </Panel>
    );
  }

  // Chart. Single-series: the playhead value is emphasised as a StatBlock
  // readout. Multi-series: a single readout is MISLEADING (it would silently be
  // the first series), so each series gets its own playhead value in the legend.
  const series = withPoints(widget);
  const primaryNorm = normalizePoints(series[0]?.points ?? []);
  const overlays = series.slice(1).map((s) => normalizePoints(s.points));
  const multi = series.length > 1;

  const valueAt = (s: OpsSeries): number | null =>
    seriesValueAtSlot(s, dayStart, slot);

  const primaryValue = series.length > 0 ? valueAt(series[0]) : null;

  const readoutText =
    primaryValue != null
      ? `${formatValue(primaryValue, widget.unit)}${unitText}`
      : 'no data';
  const summary = multi
    ? `${widget.title}: ${series
        .map((s, i) => {
          const v = valueAt(s);
          return `${s.label ?? `series ${i + 1}`} ${
            v != null ? `${formatValue(v, widget.unit)}${unitText}` : 'no data'
          }`;
        })
        .join(', ')}`
    : `${widget.title}: ${readoutText}`;

  return (
    <Panel as="li" className={styles.widget}>
      <h3 className={styles.title}>{widget.title}</h3>
      <div className={styles.chartBody}>
        {!multi && (
          <StatBlock
            className={styles.readout}
            value={primaryValue != null ? formatValue(primaryValue, widget.unit) : '—'}
            unit={primaryValue != null ? (widget.unit ?? undefined) : undefined}
            label="At playhead"
          />
        )}
        <AreaChart
          className={styles.chart}
          points={primaryNorm}
          series={overlays.length > 0 ? overlays : undefined}
          summary={summary}
          format={(v) => formatValue(v, widget.unit)}
          domain={domain}
          cursor={{ t: cursorTime, v: primaryValue }}
        />
        {/* Multi-series: per-series playhead readouts (scrubbed identifier labels
            arrive null and render as "series N"). */}
        {multi && (
          <ul className={styles.legend}>
            {series.map((s, i) => {
              const v = valueAt(s);
              return (
                <li key={i} className={styles.legendItem} data-series={i}>
                  {s.label ?? `series ${i + 1}`}{' '}
                  <span className={styles.legendValue}>
                    {v != null ? `${formatValue(v, widget.unit)}${unitText}` : '—'}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Panel>
  );
}

export default function OpsSection({ section }: SectionProps) {
  const config = section.data as OpsSectionData;
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  // The viewer's own IANA zone — the scrubber, readouts and window label all read
  // in local time (the helpers stay tz-injectable for tests).
  const timeZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    [],
  );

  useEffect(() => {
    let cancelled = false;
    getOps()
      .then((report) => {
        if (cancelled) return;
        setState(report ? { status: 'ready', report } : { status: 'empty' });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        // A transport failure degrades the same calm way as "no report yet".
        setState({ status: 'empty' });
        console.error('Failed to load ops report', error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === 'loading') return null;

  if (state.status === 'empty') {
    return (
      <SectionShell
        title={config.heading ?? 'Ops'}
        eyebrow={EYEBROW}
        intro={config.intro}
        className={styles.ops}
      >
        <Panel className={styles.placeholder}>
          <p className={styles.signal} aria-hidden="true">
            NO REPORT YET
          </p>
          <p className={styles.placeholderText}>
            The daily flight recorder builds one report per UTC day, shortly after
            midnight UTC. Check back once the first day is on the record.
          </p>
        </Panel>
      </SectionShell>
    );
  }

  return <OpsReplay report={state.report} config={config} timeZone={timeZone} />;
}

interface ReplayProps {
  report: OpsReport;
  config: OpsSectionData;
  timeZone: string;
}

function OpsReplay({ report, config, timeZone }: ReplayProps) {
  const dayStart = dayStartMs(report.report_date);
  const dayEnd = dayEndMs(report.report_date);

  // The playhead defaults to the day's last real reading (mirroring the old
  // "latest") and is re-seeded if a different report loads.
  const [slot, setSlot] = useState(() => latestSlot(report.widgets, dayStart));
  useEffect(() => {
    setSlot(latestSlot(report.widgets, dayStart));
  }, [report, dayStart]);

  const playheadTime = slotTimeMs(dayStart, slot);
  const playheadLabel = formatLocalDateTime(playheadTime, timeZone);

  return (
    <SectionShell
      title={config.heading ?? 'Ops'}
      eyebrow={EYEBROW}
      intro={config.intro}
      className={styles.ops}
    >
      <div className={styles.strip}>
        <span className={styles.window}>{formatWindowLabel(report.report_date, timeZone)}</span>
        <span className={styles.meta}>
          {report.report_date} · GEN {formatGeneratedAt(report.generated_at)} UTC
        </span>
        <StatusDot variant="ok" label="Report on the record" />
      </div>

      <div className={styles.scrub}>
        <span className={styles.playheadLabel} aria-live="polite">
          {playheadLabel}
        </span>
        <Scrubber
          min={0}
          max={DAY_SLOTS - 1}
          value={slot}
          onChange={setSlot}
          pageStep={12 /* one hour */}
          label="Playhead — scrub the day's telemetry"
          valueText={playheadLabel}
        />
      </div>

      <ul className={styles.grid}>
        {report.widgets.map((widget, i) => (
          <OpsWidgetPanel
            key={i}
            widget={widget}
            dayStart={dayStart}
            dayEnd={dayEnd}
            slot={slot}
          />
        ))}
      </ul>
    </SectionShell>
  );
}
