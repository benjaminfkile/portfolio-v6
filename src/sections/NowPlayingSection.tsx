import { useEffect, useRef, useState } from 'react';
import type { SectionProps } from './types';
import type { NowPlayingResponse } from '../lib/api';
import { useNowPlaying } from '../lib/useNowPlaying';
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
 * page*. The fetching/polling itself lives in the shared {@link useNowPlaying}
 * store (one ~5s poller for the whole app, visibility-gated per §3.5, shared
 * with the hero instrument strip); this section only renders the shared state.
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

/** Local progress interpolation tick between polls. */
const CREEP_INTERVAL_MS = 1_000;

export default function NowPlayingSection({ section }: SectionProps) {
  const config = section.data as NowPlayingData;
  const reduced = usePrefersReducedMotion();
  const state = useNowPlaying();

  // Local progress interpolation: remember the last reported progress + the
  // wall-clock moment it arrived, then advance `progressMs` each tick.
  const anchor = useRef<{ base: number; at: number } | null>(null);
  const [progressMs, setProgressMs] = useState(0);

  // Re-anchor on every payload from the store (each poll reports a fresh
  // `progress_ms`, even for the same track). A degrade clears the anchor.
  useEffect(() => {
    if (state.status === 'ready' && state.data.playing) {
      const base = state.data.track.progress_ms ?? 0;
      anchor.current = { base, at: Date.now() };
      setProgressMs(base);
    } else {
      anchor.current = null;
    }
  }, [state]);

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

  // Degrade to idle — a failed fetch is "not listening", not an error (§3.5).
  const data: NowPlayingResponse =
    state.status === 'ready' ? state.data : { playing: false };

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
