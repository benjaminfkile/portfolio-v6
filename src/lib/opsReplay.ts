/**
 * Ops replay helpers (spec §3.5, DESIGN.md §5, v1.7) — the pure, tz-independent
 * math behind the flight-recorder scrubber. Kept out of the component so the
 * playhead → readout mapping and the local-time labels are unit-testable without
 * a DOM, and — critically — without depending on the test runner's own timezone:
 * every formatter takes an explicit IANA `timeZone`.
 *
 * A report covers one FULL UTC day at a fixed 5-minute grain, so the day is a
 * grid of {@link DAY_SLOTS} slots (00:00, 00:05 … 23:55 UTC). The playhead is an
 * index into that grid; a readout is that slot's value in a given series (or
 * `null` where the day held no datapoint — a gap, never a zero).
 */

import type { OpsPoint, OpsWidget } from './api';

/** The report's fixed sample grain, in minutes (§3.5). */
export const GRAIN_MINUTES = 5;
/** The grain in milliseconds. */
export const GRAIN_MS = GRAIN_MINUTES * 60 * 1000;
/** Slots in a full UTC day at the fixed grain (288). */
export const DAY_SLOTS = (24 * 60) / GRAIN_MINUTES;

/**
 * Normalize a sample timestamp to epoch milliseconds. The curated payload can
 * carry `t` as an ISO-8601 string (the report builder's spelling) or a number;
 * a numeric value is treated as epoch *seconds* below ~1e12 and epoch *ms*
 * otherwise (a seconds value for any realistic date is ~1e9, an ms value ~1e12).
 */
export function pointTimeMs(t: number | string): number {
  if (typeof t === 'number') return t < 1e12 ? t * 1000 : t;
  return Date.parse(t);
}

/** Epoch ms of 00:00:00 UTC on `reportDate` (`YYYY-MM-DD`). */
export function dayStartMs(reportDate: string): number {
  const [y, m, d] = reportDate.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Epoch ms of the window's end — 00:00 UTC the day *after* `reportDate`. */
export function dayEndMs(reportDate: string): number {
  return dayStartMs(reportDate) + DAY_SLOTS * GRAIN_MS;
}

/** Clamp/round an arbitrary number into a valid slot index `[0, DAY_SLOTS-1]`. */
export function clampSlot(slot: number): number {
  if (!Number.isFinite(slot)) return 0;
  return Math.max(0, Math.min(DAY_SLOTS - 1, Math.round(slot)));
}

/** The slot a timestamp (epoch ms) falls in, relative to the UTC day start. */
export function slotOf(tMs: number, dayStart: number): number {
  return Math.round((tMs - dayStart) / GRAIN_MS);
}

/** Epoch ms at the start of `slot` within the UTC day. */
export function slotTimeMs(dayStart: number, slot: number): number {
  return dayStart + slot * GRAIN_MS;
}

/** A normalized `{ t (ms), v }` sample. */
export interface NormalPoint {
  t: number;
  v: number;
}

/** Normalize a curated series' points to `{ t (ms), v }`, oldest → newest. */
export function normalizePoints(points: OpsPoint[]): NormalPoint[] {
  return points.map((p) => ({ t: pointTimeMs(p.t), v: p.v }));
}

/**
 * Index a series' points by day slot for O(1) playhead lookup. Points outside
 * the day are dropped; a duplicate slot keeps the last sample.
 */
export function indexBySlot(
  points: NormalPoint[],
  dayStart: number,
): Map<number, number> {
  const bySlot = new Map<number, number>();
  for (const p of points) {
    const slot = slotOf(p.t, dayStart);
    if (slot >= 0 && slot < DAY_SLOTS) bySlot.set(slot, p.v);
  }
  return bySlot;
}

/**
 * The value at the playhead slot, or `null` when that slot held no datapoint (a
 * gap). Exact by construction — the report grid and the slot index share the
 * same 5-minute cadence — so a reading is never invented for a missing sample.
 */
export function valueAtSlot(
  bySlot: Map<number, number>,
  slot: number,
): number | null {
  return bySlot.has(slot) ? (bySlot.get(slot) as number) : null;
}

/**
 * The slot of the newest datapoint across every widget/series — the sensible
 * default playhead so the section opens on the last real reading of the day
 * (mirroring the old "latest"). Falls back to the final slot when the report is
 * entirely empty.
 */
export function latestSlot(widgets: OpsWidget[], dayStart: number): number {
  let best = -1;
  for (const w of widgets) {
    for (const s of w.series) {
      for (const p of s.points) {
        const slot = slotOf(pointTimeMs(p.t), dayStart);
        if (slot >= 0 && slot < DAY_SLOTS && slot > best) best = slot;
      }
    }
  }
  return best >= 0 ? best : DAY_SLOTS - 1;
}

/**
 * A moment's local wall-clock label in an explicit IANA `timeZone` — e.g.
 * `Aug 7, 01:00`. Explicit tz (never the runner's) keeps this deterministic in
 * tests and honest for viewers: a UTC-day report spans two local calendar days
 * for most of the world.
 */
export function formatLocalDateTime(tMs: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    // h23 so midnight is 00:00, never ICU's "24:00" (the window end IS 00:00 UTC).
    hourCycle: 'h23',
  }).format(new Date(tMs));
}

/**
 * The plain window label for the section header — `24h ending <local datetime of
 * the window's 00:00 UTC end>`. It names the honest close of the UTC day in the
 * viewer's own zone rather than pretending the window is a single local day.
 */
export function formatWindowLabel(
  reportDate: string,
  timeZone: string,
): string {
  return `24h ending ${formatLocalDateTime(dayEndMs(reportDate), timeZone)}`;
}

/**
 * The `generated_at` stamp in the mono instrument voice, kept in UTC (with an
 * explicit `UTC` suffix at the call site) so it stays tied to the UTC day the
 * report covers rather than drifting with the viewer's zone.
 */
export function formatGeneratedAt(iso: string, timeZone = 'UTC'): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(ms));
}
