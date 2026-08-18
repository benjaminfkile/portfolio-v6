import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import type { SectionProps } from './types';
import type { GithubSectionData } from '../types/content';
import { getGithub } from '../lib/api';
import type { GithubDay, GithubResponse, GithubWeek } from '../lib/api';
import SectionShell from '../components/ui/SectionShell';
import Panel from '../components/ui/Panel';
import Instrument from '../components/ui/Instrument';
import styles from './GithubSection.module.css';

/**
 * The live `github` section (spec §3.5, DESIGN.md §5, v1.10) — a fully browsable
 * contribution calendar. A compact instrument-styled `<select>` picks the window
 * ("LAST 12 MONTHS" by default, or one entry per calendar year from the payload's
 * newest-first `years`); the day-grid renders seven rows with month labels along
 * the top and sparse weekday labels down the left, each cell shaded by the
 * server's quantized `level` (0–4) on a 5-step amber ramp built from the tokens.
 *
 * The counts match Ben's PUBLIC profile exactly — the API serves public-only
 * contribution data — WITHOUT cloning GitHub's look: amber, not green, and an
 * instrument voice rather than GitHub's exact geometry (DESIGN.md §1/§2/§5).
 *
 * The grid lives in its own `overflow-x: auto` container, so a calendar wider
 * than the phone scrolls sideways *inside the section* — the page body never
 * does (DESIGN.md §3) — and it scrolls to its end on mount for the default
 * trailing window so the current week shows first. The grid is decorative to
 * assistive tech (`aria-hidden`); a visually-hidden summary sentence and an
 * aria-live day readout carry the information instead (§7).
 *
 * Live-section rules (§3.5): the initial load renders nothing until it arrives,
 * and an `{ available: false }` payload or a failed fetch degrades to nothing.
 * Once a window has loaded, a later failure keeps the picker so a bad `?year=`
 * fetch degrades in place rather than removing the whole section.
 */

/** The trailing-12-months window — the default, an empty `<select>` value. */
const TRAILING = '';

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Sparse left-edge weekday labels — Mon/Wed/Fri, GitHub's convention (§3.5). */
const WEEKDAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

type Ready = Extract<GithubResponse, { available: true }>;

/**
 * The section's phases. `loading`/`unavailable` render nothing (the initial load
 * and its failure). `ready` shows the calendar; `busy` re-fetches a new window
 * with the picker kept and the grid dimmed; `degraded` keeps the picker after a
 * re-fetch fails so a bad `?year=` never tears the whole section down (§3.5).
 */
type Phase = 'loading' | 'unavailable' | 'busy' | 'ready' | 'degraded';

/** Clamp a server intensity to the ramp's 0–4 steps, defaulting to 0. */
function clampLevel(level: number): number {
  if (!Number.isFinite(level)) return 0;
  return Math.min(4, Math.max(0, Math.round(level)));
}

/**
 * Derive the month labels for the grid's top edge: one label at each column
 * where the month changes from the previous column (including the first). Reads
 * the month from each week's first day's `date` (`YYYY-MM-DD`), timezone-free.
 * Exported for unit test (task §8 "month label derivation").
 */
export function monthColumns(
  weeks: GithubWeek[],
): Array<{ col: number; label: string }> {
  const out: Array<{ col: number; label: string }> = [];
  let last = -1;
  weeks.forEach((week, col) => {
    const first = week.days[0];
    if (!first) return;
    const month = Number(first.date.slice(5, 7)) - 1;
    if (month < 0 || month > 11 || month === last) return;
    out.push({ col, label: MONTHS[month] });
    last = month;
  });
  return out;
}

/** Human day label for the tooltip / readout, e.g. "Sat, Aug 9, 2026". */
function formatDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return date;
  const weekday = WEEKDAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${weekday}, ${MONTHS[m - 1]} ${d}, ${y}`;
}

/** Mono "N contributions · date" caption for a day (tooltip + aria-live). */
function dayReadout(day: GithubDay): string {
  const noun = day.count === 1 ? 'contribution' : 'contributions';
  return `${day.count.toLocaleString('en-US')} ${noun} · ${formatDay(day.date)}`;
}

export default function GithubSection({ section }: SectionProps) {
  // Legacy `weeks` (v1.2) is ignored — only the header copy is read from config.
  const config = section.data as GithubSectionData;

  const [selected, setSelected] = useState<string>(TRAILING);
  const [phase, setPhase] = useState<Phase>('loading');
  const [data, setData] = useState<Ready | null>(null);
  const [years, setYears] = useState<number[]>([]);
  const [activeDay, setActiveDay] = useState<GithubDay | null>(null);

  // Whether a window has ever loaded — decides "degrade in place" vs "remove the
  // whole section" on a failure, and "shimmer" vs "render nothing" on a re-fetch.
  const loadedOnce = useRef(false);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    // A re-fetch keeps the picker + old grid and dims it; the first load stays
    // in `loading` (renders nothing) until the payload arrives.
    if (loadedOnce.current) setPhase('busy');

    const year = selected === TRAILING ? undefined : Number(selected);
    getGithub(year)
      .then((res) => {
        if (cancelled) return;
        if (res.available) {
          loadedOnce.current = true;
          setData(res);
          setYears(res.years);
          setActiveDay(null);
          setPhase('ready');
        } else {
          // Degrade: keep the picker if we had one, else remove the section.
          setData(null);
          setPhase(loadedOnce.current ? 'degraded' : 'unavailable');
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setData(null);
        setPhase(loadedOnce.current ? 'degraded' : 'unavailable');
        console.error('Failed to load GitHub contributions', error);
      });

    return () => {
      cancelled = true;
    };
  }, [selected]);

  // Scroll to the current week for the trailing default (grid ends at "now"),
  // or back to January for a chosen year. Layout effect so it lands pre-paint.
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el || !data) return;
    el.scrollLeft = selected === TRAILING ? el.scrollWidth : 0;
  }, [data, selected]);

  // The initial load and its failure both render nothing (§3.5) — the section is
  // simply absent until the first window arrives.
  if (phase === 'loading' || phase === 'unavailable') return null;

  const weeks = data?.weeks ?? [];
  const months = monthColumns(weeks);

  return (
    <SectionShell
      title={config.heading}
      eyebrow={config.eyebrow}
      intro={config.intro}
      className={styles.github}
    >
      <Panel className={styles.panel} aria-busy={phase === 'busy' || undefined}>
        <div className={styles.head}>
          <div className={styles.readouts}>
            <Instrument
              className={styles.total}
              label="Contributions"
              value={data ? `${data.total.toLocaleString('en-US')}` : '—'}
              accent
            />
            <Instrument
              className={styles.window}
              label="Window"
              value={
                <span className={styles.range}>
                  {data ? `${data.from} → ${data.to}` : '—'}
                </span>
              }
            />
          </div>

          <label className={styles.control}>
            <span className={styles.controlLabel}>Contribution window</span>
            <span className={styles.selectWrap}>
              <select
                className={styles.select}
                aria-label="Contribution window"
                value={selected}
                onChange={(event) => setSelected(event.target.value)}
              >
                <option value={TRAILING}>LAST 12 MONTHS</option>
                {years.map((year) => (
                  <option key={year} value={String(year)}>
                    {year}
                  </option>
                ))}
              </select>
              {/* The busy "…" — the instrument's loading voice while re-fetching. */}
              {phase === 'busy' && (
                <span className={styles.busyDot} aria-hidden="true">
                  …
                </span>
              )}
            </span>
          </label>
        </div>

        {/* A mono day readout — the tooltip's touch-friendly twin. Hover or tap a
            cell to fill it; aria-live announces it for touch + AT (§7). */}
        <p className={styles.dayReadout} aria-live="polite">
          {activeDay ? dayReadout(activeDay) : ' '}
        </p>

        {data ? (
          <div className={styles.calendar}>
            <div className={styles.weekdays} aria-hidden="true">
              {WEEKDAY_LABELS.map((label, di) => (
                <span
                  key={di}
                  className={styles.weekday}
                  style={{ gridRow: di + 2 }}
                >
                  {label}
                </span>
              ))}
            </div>

            {/*
              The calendar scrolls inside its own container — a wide grid never
              spills into the page body's horizontal scroll (DESIGN.md §3). The
              grid is decorative (aria-hidden); the summary sentence and the
              aria-live readout carry the information to assistive tech (§7).
            */}
            <div className={styles.scroller} ref={scrollerRef}>
              <div
                className={`${styles.grid} ${
                  phase === 'busy' ? styles.gridBusy : ''
                }`}
                style={{ '--weeks': weeks.length } as CSSProperties}
                aria-hidden="true"
              >
                {months.map(({ col, label }) => (
                  <span
                    key={`m-${col}`}
                    className={styles.month}
                    style={{ gridColumnStart: col + 1, gridRow: 1 }}
                  >
                    {label}
                  </span>
                ))}
                {weeks.map((week, wi) =>
                  week.days.map((day, di) => {
                    const level = clampLevel(day.level);
                    return (
                      <span
                        key={`${wi}-${di}`}
                        className={`${styles.cell} ${styles[`l${level}`]}`}
                        style={{ gridColumnStart: wi + 1, gridRow: di + 2 }}
                        data-level={level}
                        data-date={day.date}
                        title={dayReadout(day)}
                        onMouseEnter={() => setActiveDay(day)}
                        onMouseLeave={() => setActiveDay(null)}
                        onClick={() => setActiveDay(day)}
                      />
                    );
                  }),
                )}
              </div>
            </div>
          </div>
        ) : (
          // Degraded in place: the picker stays so the visitor can pick another
          // window; the grid area shows an honest, calm unavailable note (§3.5).
          <p className={styles.degraded}>Contribution data unavailable.</p>
        )}

        {data && (
          <p className={styles.summary}>
            {`${data.total.toLocaleString('en-US')} contributions between ${data.from} and ${data.to}`}
          </p>
        )}
      </Panel>
    </SectionShell>
  );
}
