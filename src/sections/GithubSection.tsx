import { useEffect, useState } from 'react';
import type { SectionProps } from './types';
import type { GithubSectionData } from '../types/content';
import { getGithub } from '../lib/api';
import type { GithubResponse, GithubWeek } from '../lib/api';
import SectionShell from '../components/ui/SectionShell';
import Panel from '../components/ui/Panel';
import Instrument from '../components/ui/Instrument';
import styles from './GithubSection.module.css';

/**
 * The live `github` section (spec §3.5, DESIGN.md §5, v1.2) — the total
 * contributions as a mono `Instrument`, and the contribution calendar as an
 * amber heat grid: a 5-step intensity ramp from `--panel-2` through
 * `--amber-soft` to `--amber`, defined as preset classes off the tokens (no raw
 * hex). Its *config* is published (`weeks`, default 52); its *data* is fetched at
 * runtime from `GET /api/github`.
 *
 * The grid lives in its own `overflow-x: auto` container, so a calendar wider
 * than the phone scrolls sideways *inside the section* — the page body never
 * does (DESIGN.md §3). Per §3.5 the calendar is decorative to assistive tech:
 * the grid is `aria-hidden`, and a single visually-hidden summary sentence
 * ("N contributions in the last year") stands in for 365 labelled cells (§7).
 *
 * Standard live-section rules: loading and the degrade path both render nothing;
 * an `{ available: false }` payload or a failed fetch simply removes the section
 * (§3.5). Contribution data changes over days, so it is fetched once on mount.
 */
const DEFAULT_WEEKS = 52;

type LoadState =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'ready'; data: Extract<GithubResponse, { available: true }> };

/** The largest single-day count in the shown window — the ramp's top anchor. */
function maxCount(weeks: GithubWeek[]): number {
  let max = 0;
  for (const week of weeks) {
    for (const count of week.days) {
      if (count > max) max = count;
    }
  }
  return max;
}

/**
 * Map a day's count to a ramp step 0–4. Zero is always the empty step; non-zero
 * counts are bucketed into quarters of the window's max so the ramp adapts to
 * whatever range the payload carries.
 */
function intensity(count: number, max: number): number {
  if (count <= 0 || max <= 0) return 0;
  const ratio = count / max;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

export default function GithubSection({ section }: SectionProps) {
  const config = section.data as GithubSectionData;
  const weeksConfig = config.weeks ?? DEFAULT_WEEKS;
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    getGithub()
      .then((data) => {
        if (cancelled) return;
        setState(
          data.available
            ? { status: 'ready', data }
            : { status: 'unavailable' },
        );
      })
      .catch((error: unknown) => {
        // Degrade to nothing — a failed fetch is not a broken section (§3.5).
        if (cancelled) return;
        setState({ status: 'unavailable' });
        console.error('Failed to load GitHub contributions', error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status !== 'ready') return null;

  const { total, weeks } = state.data;
  // Weeks arrive oldest→newest; the config selects the newest N (§3.5).
  const shown = weeksConfig > 0 ? weeks.slice(-weeksConfig) : weeks;
  const max = maxCount(shown);
  const summary = `${total.toLocaleString('en-US')} contributions in the last year`;

  const levelClasses = [
    styles.l0,
    styles.l1,
    styles.l2,
    styles.l3,
    styles.l4,
  ];

  return (
    <SectionShell
      title={config.heading ?? 'GitHub'}
      eyebrow={config.eyebrow ?? '// contributions'}
      intro={config.intro}
      className={styles.github}
    >
      <Panel className={styles.panel}>
        <Instrument
          className={styles.total}
          label="Contributions"
          value={total.toLocaleString('en-US')}
          accent
        />
        {/*
          The calendar scrolls inside its own container — a wide grid never
          spills into the page body's horizontal scroll (DESIGN.md §3). The grid
          is decorative (aria-hidden); the summary sentence below carries the
          information to assistive tech (DESIGN.md §5, §7).
        */}
        <div className={styles.scroller}>
          <div className={styles.grid} aria-hidden="true">
            {shown.map((week, wi) => (
              <div key={wi} className={styles.week}>
                {week.days.map((count, di) => {
                  const level = intensity(count, max);
                  return (
                    <span
                      key={di}
                      className={`${styles.cell} ${levelClasses[level]}`}
                      data-level={level}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <p className={styles.summary}>{summary}</p>
      </Panel>
    </SectionShell>
  );
}
