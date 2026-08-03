import { useEffect, useState } from 'react';
import type { SectionProps } from './types';
import type { DuolingoSectionData } from '../types/content';
import { getDuolingo } from '../lib/api';
import type { DuolingoResponse } from '../lib/api';
import SectionShell from '../components/ui/SectionShell';
import Panel from '../components/ui/Panel';
import Instrument from '../components/ui/Instrument';
import TagChip from '../components/ui/TagChip';
import styles from './DuolingoSection.module.css';

/**
 * The live `duolingo` section (spec §3.5, DESIGN.md §5, v1.2) — an `Instrument`
 * pair: STREAK (a mono amber count with a `days` label) and the course readout
 * (course title, XP in `tabular-nums`, crowns dim). Its *config* is published in
 * the snapshot (`language`, an optional manual `score_label`); its *data* is
 * fetched at runtime from `GET /api/duolingo?language=<language>`.
 *
 * The optional `score_label` — the hand-maintained official "Duolingo Score" the
 * endpoint does not expose — renders as a {@link TagChip}, deliberately distinct
 * from the live mono values (§3.5): live data is always mono, manual data wears a
 * chip.
 *
 * Standard live-section rules apply, and this section leans on the degrade path
 * hard: an `{ available: false }` payload — which is what the API returns on any
 * upstream failure or shape drift — *or* a failed fetch renders **nothing**
 * (§3.5). The unofficial endpoint may break without notice; by construction that
 * is a section that quietly disappears, never a broken page. The data changes
 * over days, not seconds, so it is fetched once on mount (no polling).
 */
const DEFAULT_LANGUAGE = 'es';

type LoadState =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'ready'; data: Extract<DuolingoResponse, { available: true }> };

export default function DuolingoSection({ section }: SectionProps) {
  const config = section.data as DuolingoSectionData;
  const language = config.language ?? DEFAULT_LANGUAGE;
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    getDuolingo(language)
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
        console.error('Failed to load Duolingo', error);
      });

    return () => {
      cancelled = true;
    };
  }, [language]);

  // Loading and the degrade path both render nothing: the unofficial endpoint is
  // low-stakes by construction, so an unavailable section simply isn't there.
  if (state.status !== 'ready') return null;

  const { streak, course } = state.data;

  return (
    <SectionShell
      title={config.heading ?? 'Duolingo'}
      eyebrow={config.eyebrow ?? '// language practice'}
      intro={config.intro}
      className={styles.duolingo}
    >
      <Panel className={styles.panel}>
        <div className={styles.instruments}>
          <Instrument
            className={styles.streak}
            label="Streak"
            value={
              <span className={styles.streakValue}>
                <span className={styles.count}>{streak}</span>
                <span className={styles.unit}>days</span>
              </span>
            }
          />
          <Instrument
            className={styles.course}
            label={course.title}
            value={
              <span className={styles.courseValue}>
                <span className={styles.xp}>
                  {course.xp.toLocaleString('en-US')} XP
                </span>
                <span className={styles.crowns}>{course.crowns} crowns</span>
              </span>
            }
          />
        </div>
        {config.score_label && (
          // Manual data (§3.5): a chip, visually distinct from the live mono
          // values above.
          <p className={styles.score}>
            <TagChip className={styles.scoreChip}>{config.score_label}</TagChip>
          </p>
        )}
      </Panel>
    </SectionShell>
  );
}
