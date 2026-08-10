import { useEffect, useState } from 'react';
import Instrument from '../components/ui/Instrument';
import StatusDot from '../components/ui/StatusDot';
import type { StatusVariant } from '../components/ui/StatusDot';
import { getStatus } from '../lib/api';
import type { NowPlayingResponse, StatusResponse } from '../lib/api';
import { useNowPlaying } from '../lib/useNowPlaying';
import styles from './HeroInstrumentStrip.module.css';

/**
 * The hero **instrument strip** (DESIGN.md §5): three `Instrument` readouts —
 * NOW PLAYING, API, and SITE vN — sitting below the hero header. NOW PLAYING
 * subscribes to the shared {@link useNowPlaying} store (one app-wide ~5s
 * poller, shared with the `now_playing` section) so it updates live on track
 * changes; API is a single `GET /api/status` fetch on mount (the full `status`
 * section owns its own polling, §3.5); SITE is the published document's
 * version, threaded in via props from the already-fetched document (no extra
 * request).
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

function nowPlayingValue(state: Live<NowPlayingResponse>): string {
  if (state.status === 'loading') return PLACEHOLDER_LOADING;
  if (state.status === 'error') return PLACEHOLDER_DEGRADED;
  if (!state.data.playing) return 'Not playing';
  const { track } = state.data;
  const artists = track.artists.join(', ');
  return artists ? `${track.title} — ${artists}` : track.title;
}

/** The API instrument's dot + text: colour is never the only carrier (§7). */
function apiReadout(
  state: Live<StatusResponse>,
): { variant: StatusVariant | null; text: string } {
  if (state.status === 'loading') return { variant: null, text: PLACEHOLDER_LOADING };
  if (state.status === 'error') return { variant: null, text: PLACEHOLDER_DEGRADED };
  return state.data.degraded
    ? { variant: 'warn', text: 'Degraded' }
    : { variant: 'ok', text: 'Operational' };
}

export default function HeroInstrumentStrip({
  siteVersion,
}: HeroInstrumentStripProps) {
  const now = useNowPlaying();
  const [status, setStatus] = useState<Live<StatusResponse>>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();

    getStatus({ signal: controller.signal })
      .then((data) => setStatus({ status: 'ready', data }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setStatus({ status: 'error' });
        console.error('Hero strip: status unavailable', error);
      });

    return () => controller.abort();
  }, []);

  const api = apiReadout(status);

  return (
    <div className={styles.strip} role="group" aria-label="Live system readouts">
      {/*
        aria-live sits ONLY on the now-playing instrument (DESIGN.md §7): its
        value is the one readout worth announcing as it changes. The API and
        Site readouts update silently — the StatusDot + text label carry the API
        state without a live region, and Site is static.
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
        label="API"
        value={api.text}
        leading={
          api.variant ? <StatusDot variant={api.variant} /> : undefined
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
