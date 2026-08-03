import { useEffect, useRef, useState } from 'react';
import type { SectionProps } from './types';
import { getNowPlaying } from '../lib/api';
import type { NowPlayingResponse } from '../lib/api';
import { usePrefersReducedMotion } from '../lib/prefersReducedMotion';
import SectionShell from '../components/ui/SectionShell';
import Panel from '../components/ui/Panel';
import MediaFrame from '../components/ui/MediaFrame';
import Meter from '../components/ui/Meter';
import styles from './NowPlayingSection.module.css';

/**
 * The live `now_playing` section (spec §3.5, §4.6, DESIGN.md §5) — the owner's
 * current Spotify track rendered as an Instrument: a small album-art
 * {@link MediaFrame}, the track title + artists, and a thin amber progress
 * {@link Meter} that creeps between polls. Config is published (idle behaviour,
 * whether to show album art); the track itself is fetched at runtime from
 * `GET /api/now-playing`.
 *
 * This is the one live section whose data changes *while the visitor is on the
 * page*, so it refetches on a ~30s interval (matching the API cache) — but only
 * while mounted **and** `document.visibilityState` is visible: a backgrounded
 * tab must not poll (§3.5). We also refetch immediately when the tab becomes
 * visible again.
 *
 * Between polls the progress bar is interpolated locally from `progress_ms` →
 * `duration_ms`; under `prefers-reduced-motion` the interpolation is disabled
 * and the bar renders static (DESIGN.md §6). The readout is `aria-live="polite"`
 * so a track change is announced (DESIGN.md §7).
 *
 * Standard live-section rules apply: a loading state, and **degrade rather than
 * error** — any failed fetch renders as idle, never a broken section. Idle
 * itself is config, not accident: `hide` removes the section entirely; `message`
 * renders a short "not listening" line.
 */
interface NowPlayingData {
  idle?: 'hide' | 'message';
  idle_message?: string;
  show_album_art?: boolean;
  /** Optional header copy; defaults to a mono eyebrow + "Now playing" heading. */
  title?: string;
  eyebrow?: string;
}

/** Re-poll to match the endpoint's ~30s server-side cache (DESIGN.md §5). */
const POLL_INTERVAL_MS = 30_000;
/** Local progress interpolation tick between polls. */
const CREEP_INTERVAL_MS = 1_000;

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; data: NowPlayingResponse };

export default function NowPlayingSection({ section }: SectionProps) {
  const config = section.data as NowPlayingData;
  const reduced = usePrefersReducedMotion();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  // Local progress interpolation: remember the last reported progress + the
  // wall-clock moment it arrived, then advance `progressMs` each tick.
  const anchor = useRef<{ base: number; at: number } | null>(null);
  const [progressMs, setProgressMs] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const load = () => {
      getNowPlaying()
        .then((data) => {
          if (cancelled) return;
          if (data.playing) {
            anchor.current = { base: data.track.progress_ms ?? 0, at: Date.now() };
            setProgressMs(data.track.progress_ms ?? 0);
          } else {
            anchor.current = null;
          }
          setState({ status: 'ready', data });
        })
        .catch((error: unknown) => {
          // Degrade to idle — a failed fetch is "not listening", not an error.
          if (cancelled) return;
          anchor.current = null;
          setState({ status: 'ready', data: { playing: false } });
          console.error('Failed to load now-playing', error);
        });
    };

    load(); // initial fetch on mount

    // Poll on an interval, but each tick only fetches while the tab is visible;
    // a hidden tab's ticks are no-ops, so a backgrounded tab never polls (§3.5).
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, POLL_INTERVAL_MS);

    // Refetch immediately when the tab returns to the foreground, so a visitor
    // coming back sees a fresh track rather than a stale one.
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  // Creep the progress bar between polls. Static under reduced motion (§6), and
  // only while an actual track with a known duration is playing.
  const playingTrack =
    state.status === 'ready' && state.data.playing ? state.data.track : null;
  const durationMs = playingTrack?.duration_ms ?? 0;

  useEffect(() => {
    if (reduced || !playingTrack || durationMs <= 0) return;
    const id = window.setInterval(() => {
      const a = anchor.current;
      if (!a) return;
      setProgressMs(Math.min(durationMs, a.base + (Date.now() - a.at)));
    }, CREEP_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [reduced, playingTrack, durationMs]);

  if (state.status === 'loading') {
    return (
      <SectionShell
        title={config.title ?? 'Now playing'}
        eyebrow={config.eyebrow ?? '// on the decks'}
        className={styles.nowPlaying}
      >
        <Panel className={styles.panel}>
          <p className={styles.muted}>Loading…</p>
        </Panel>
      </SectionShell>
    );
  }

  const { data } = state;

  if (!data.playing) {
    // Idle is config (§3.5): `hide` removes the section; `message` renders a line.
    if (config.idle !== 'message') return null;
    return (
      <SectionShell
        title={config.title ?? 'Now playing'}
        eyebrow={config.eyebrow ?? '// on the decks'}
        className={styles.nowPlaying}
      >
        <Panel className={styles.panel}>
          <p className={styles.muted} aria-live="polite">
            {config.idle_message ?? 'Not listening to anything right now.'}
          </p>
        </Panel>
      </SectionShell>
    );
  }

  const { track } = data;
  const percent =
    durationMs > 0 ? Math.min(100, (progressMs / durationMs) * 100) : 0;

  return (
    <SectionShell
      title={config.title ?? 'Now playing'}
      eyebrow={config.eyebrow ?? '// on the decks'}
      className={styles.nowPlaying}
    >
      <Panel className={styles.panel}>
        <div className={styles.track}>
          {config.show_album_art && track.art_url && (
            <MediaFrame
              className={styles.art}
              src={track.art_url}
              alt={`${track.album} album art`}
              aspectRatio="1 / 1"
            />
          )}
          <div className={styles.body}>
            {/* aria-live so a track change is announced without moving focus (§7). */}
            <div className={styles.readout} aria-live="polite">
              <a
                className={styles.trackTitle}
                href={track.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {track.title}
              </a>
              <p className={styles.artists}>{track.artists.join(', ')}</p>
              {track.album && <p className={styles.album}>{track.album}</p>}
            </div>
            {durationMs > 0 && (
              <Meter
                className={styles.progress}
                value={percent}
                label="Track progress"
              />
            )}
          </div>
        </div>
      </Panel>
    </SectionShell>
  );
}
