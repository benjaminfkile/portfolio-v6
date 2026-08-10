import { useEffect, useState } from 'react';
import Instrument from '../components/ui/Instrument';
import { getDuolingo } from '../lib/api';
import type { DuolingoResponse, NowPlayingResponse } from '../lib/api';
import { useNowPlaying } from '../lib/useNowPlaying';
import styles from './HeroInstrumentStrip.module.css';

/**
 * The hero **instrument strip** (DESIGN.md §5): three `Instrument` readouts —
 * NOW PLAYING, DUOLINGO, and SITE vN — sitting below the hero header. NOW
 * PLAYING subscribes to the shared {@link useNowPlaying} store (one app-wide
 * ~5s poller, shared with the `now_playing` section) so it updates live on
 * track changes, and falls back to `Last: …` when idle with a known
 * last-played track; DUOLINGO is the owner's streak from a single
 * `GET /api/duolingo` fetch on mount (streaks move over days, not seconds —
 * the full `duolingo` section owns its own fetch, §3.5); SITE is the published
 * document's version, threaded in via props from the already-fetched document
 * (no extra request).
 *
 * Each live instrument **degrades independently and silently** (§3.5 spirit): a
 * loading tick shows "…", any failure shows a dim "—", and neither ever throws
 * or blocks the hero.
 */
export interface HeroInstrumentStripProps {
  /** Published document version → the SITE vN readout. Omitted renders no SITE. */
  siteVersion?: number;
}

/** A live readout is loading, failed (degrade), or has data. */
type Live<T> =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: T };

const PLACEHOLDER_LOADING = '…';
const PLACEHOLDER_DEGRADED = '—';

function trackLine(track: { title: string; artists: string[] }): string {
  const artists = track.artists.join(', ');
  return artists ? `${track.title} — ${artists}` : track.title;
}

function nowPlayingValue(state: Live<NowPlayingResponse>): string {
  if (state.status === 'loading') return PLACEHOLDER_LOADING;
  if (state.status === 'error') return PLACEHOLDER_DEGRADED;
  if (state.data.playing) return trackLine(state.data.track);
  // Idle: show the last-played track when the API knows it (§4.6 fallback).
  const last = state.data.last_played;
  return last ? `Last: ${trackLine(last.track)}` : 'Not playing';
}

/** The streak day count in the instrument voice; degrades to a dim "—". */
function duolingoValue(state: Live<DuolingoResponse>): string {
  if (state.status === 'loading') return PLACEHOLDER_LOADING;
  if (state.status === 'error' || !state.data.available) {
    return PLACEHOLDER_DEGRADED;
  }
  const { streak } = state.data;
  return `${streak} ${streak === 1 ? 'day' : 'days'}`;
}

export default function HeroInstrumentStrip({
  siteVersion,
}: HeroInstrumentStripProps) {
  const now = useNowPlaying();
  const [duolingo, setDuolingo] = useState<Live<DuolingoResponse>>({
    status: 'loading',
  });

  useEffect(() => {
    const controller = new AbortController();

    getDuolingo('', { signal: controller.signal })
      .then((data) => setDuolingo({ status: 'ready', data }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setDuolingo({ status: 'error' });
        console.error('Hero strip: duolingo unavailable', error);
      });

    return () => controller.abort();
  }, []);

  return (
    <div className={styles.strip} role="group" aria-label="Live system readouts">
      {/*
        aria-live sits ONLY on the now-playing instrument (DESIGN.md §7): its
        value is the one readout worth announcing as it changes. The Duolingo
        and Site readouts update silently — a streak is static for the visit.
      */}
      <Instrument
        className={styles.instrument}
        label="Now playing"
        value={nowPlayingValue(now)}
        accent={now.status === 'ready' && now.data.playing}
        live="polite"
      />
      <Instrument
        className={styles.instrument}
        label="Duolingo"
        value={duolingoValue(duolingo)}
        accent={
          duolingo.status === 'ready' && duolingo.data.available
        }
      />
      {siteVersion != null && (
        <Instrument
          className={styles.instrument}
          label="Site"
          value={`v${siteVersion}`}
          accent
        />
      )}
    </div>
  );
}
