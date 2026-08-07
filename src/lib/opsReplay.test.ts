import { describe, expect, it } from 'vitest';
import {
  DAY_SLOTS,
  GRAIN_MS,
  clampSlot,
  dayEndMs,
  dayStartMs,
  formatGeneratedAt,
  formatLocalDateTime,
  formatWindowLabel,
  indexBySlot,
  latestSlot,
  normalizePoints,
  pointTimeMs,
  slotOf,
  slotTimeMs,
  valueAtSlot,
} from './opsReplay';
import { fixtureOpsReport } from '../test/fixtures';
import type { OpsWidget } from './api';

describe('opsReplay — grid math', () => {
  it('spans a full UTC day in 288 five-minute slots', () => {
    expect(DAY_SLOTS).toBe(288);
    expect(dayEndMs('2026-08-06') - dayStartMs('2026-08-06')).toBe(
      DAY_SLOTS * GRAIN_MS,
    );
  });

  it('anchors the day start at 00:00 UTC regardless of the host timezone', () => {
    expect(dayStartMs('2026-08-06')).toBe(Date.UTC(2026, 7, 6));
    expect(new Date(dayStartMs('2026-08-06')).toISOString()).toBe(
      '2026-08-06T00:00:00.000Z',
    );
  });

  it('normalizes ISO strings, epoch seconds, and epoch ms to the same ms', () => {
    const ms = Date.UTC(2023, 6, 22, 4, 26, 40); // 1_690_000_000 s
    expect(pointTimeMs('2023-07-22T04:26:40.000Z')).toBe(ms);
    expect(pointTimeMs(1_690_000_000)).toBe(ms); // seconds
    expect(pointTimeMs(ms)).toBe(ms); // already ms
  });

  it('maps a timestamp to its slot and back', () => {
    const start = dayStartMs('2026-08-06');
    expect(slotOf(start, start)).toBe(0);
    expect(slotOf(start + 30 * 60 * 1000, start)).toBe(6); // 00:30 → slot 6
    expect(slotOf(dayEndMs('2026-08-06') - GRAIN_MS, start)).toBe(287);
    expect(slotTimeMs(start, 287)).toBe(start + 287 * GRAIN_MS);
  });

  it('clamps slots into range', () => {
    expect(clampSlot(-5)).toBe(0);
    expect(clampSlot(999)).toBe(287);
    expect(clampSlot(6.4)).toBe(6);
    expect(clampSlot(Number.NaN)).toBe(0);
  });
});

describe('opsReplay — playhead → readout mapping', () => {
  const start = dayStartMs('2026-08-06');
  const cpu = fixtureOpsReport.widgets[0].series[0];
  const bySlot = indexBySlot(normalizePoints(cpu.points), start);

  it('reads the exact value at a slot that has a datapoint', () => {
    expect(valueAtSlot(bySlot, 0)).toBe(40); // 00:00Z
    expect(valueAtSlot(bySlot, 6)).toBe(55); // 00:30Z
    expect(valueAtSlot(bySlot, 287)).toBe(42); // 23:55Z
  });

  it('returns null at a slot with no datapoint — a gap, never a zero', () => {
    expect(valueAtSlot(bySlot, 3)).toBeNull();
    expect(valueAtSlot(bySlot, 100)).toBeNull();
  });

  it('defaults the playhead to the newest datapoint across all widgets', () => {
    expect(latestSlot(fixtureOpsReport.widgets as OpsWidget[], start)).toBe(287);
  });

  it('falls back to the final slot for an entirely empty report', () => {
    const empty: OpsWidget[] = [
      { title: 'x', kind: 'chart', unit: null, latest: null, series: [] },
    ];
    expect(latestSlot(empty, start)).toBe(DAY_SLOTS - 1);
  });
});

describe('opsReplay — local-time formatting (explicit tz, runner-independent)', () => {
  const end = dayEndMs('2026-08-06'); // 2026-08-07T00:00:00Z

  it('labels the window in UTC when the viewer is in UTC', () => {
    expect(formatWindowLabel('2026-08-06', 'UTC')).toBe('24h ending Aug 7, 00:00');
  });

  it('converts the 00:00 UTC window end into the viewer local zone', () => {
    // New York is UTC−4 in August (EDT): 00:00Z → the previous evening, 20:00.
    expect(formatWindowLabel('2026-08-06', 'America/New_York')).toBe(
      '24h ending Aug 6, 20:00',
    );
  });

  it('spans two local calendar days and does not pretend otherwise', () => {
    // Tokyo (UTC+9): the UTC day 2026-08-06 runs 09:00 Aug 6 → 08:55 Aug 7 local.
    const start = dayStartMs('2026-08-06');
    expect(formatLocalDateTime(slotTimeMs(start, 0), 'Asia/Tokyo')).toBe(
      'Aug 6, 09:00',
    );
    expect(formatLocalDateTime(slotTimeMs(start, 287), 'Asia/Tokyo')).toBe(
      'Aug 7, 08:55',
    );
    expect(end).toBe(Date.UTC(2026, 7, 7));
  });

  it('formats generated_at in UTC by default', () => {
    expect(formatGeneratedAt('2026-08-07T00:17:00Z')).toBe('Aug 7, 2026, 00:17');
    expect(formatGeneratedAt('not-a-date')).toBe('not-a-date');
  });
});
