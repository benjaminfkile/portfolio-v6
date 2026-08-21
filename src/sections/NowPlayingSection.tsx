import type { SectionProps } from './types';
import type { NowPlayingResponse } from '../lib/api';
import { useNowPlaying } from '../lib/useNowPlaying';
import {
  relativeTimeSince,
  useNowPlayingProgress,
} from '../lib/nowPlayingProgress';
import SectionShell from '../components/ui/SectionShell';
import Panel from '../components/ui/Panel';
import MediaFrame from '../components/ui/MediaFrame';
import Meter from '../components/ui/Meter';
import styles from './NowPlayingSection.module.css';

/**
 * The live `now_playing` section (spec §3.5, §4.6, DESIGN.md §5) - the owner's
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
 * Local progress interpolation between payloads lives in the shared
 * {@link useNowPlayingProgress} hook so the strip's popover creeps in lock-step
 * (DESIGN.md §5, §6). The readout is `aria-live="polite"` so a track change is
 * announced (DESIGN.md §7).
 *
 * Standard live-section rules apply: a loading state, and **degrade rather than
 * error** - any failed fetch renders as idle, never a broken section. When idle
 * but the payload carries `last_played`, the section renders that track as a
 * card with a "Last played · &lt;relative time&gt;" line instead of going idle - 
 * the point of the fallback is that there is always a song to show. Only when
 * there is no last-played track does the idle config apply: `hide` removes the
 * section entirely; `message` renders a short "not listening" line.
 */
interface NowPlayingData {
  idle?: 'hide' | 'message';
  idle_message?: string;
  show_album_art?: boolean;
  /** Optional header copy; defaults to a mono eyebrow + "Now playing" heading. */
  title?: string;
  eyebrow?: string;
}

/**
 * Re-export {@link relativeTimeSince} for callers still importing it from the
 * section. The implementation now lives in {@link ../lib/nowPlayingProgress}
 * so the strip popover can share it.
 */
export { relativeTimeSince };

export default function NowPlayingSection({ section }: SectionProps) {
  const config = section.data as NowPlayingData;
  const state = useNowPlaying();
  const { percent, durationMs } = useNowPlayingProgress(state);

  if (state.status === 'loading') {
    return (
      <SectionShell
        title={config.title}
        eyebrow={config.eyebrow}
        className={styles.nowPlaying}
      >
        <Panel className={styles.panel}>
          <p className={styles.muted}>Loading…</p>
        </Panel>
      </SectionShell>
    );
  }

  const data: NowPlayingResponse =
    state.status === 'ready' ? state.data : { playing: false };

  if (!data.playing) {
    const last = data.last_played;
    if (last) {
      const { track: lastTrack } = last;
      const age = relativeTimeSince(last.played_at);
      return (
        <SectionShell
          title={config.title}
          eyebrow={config.eyebrow}
          className={styles.nowPlaying}
        >
          <Panel className={styles.panel}>
            <div className={styles.track}>
              {config.show_album_art && lastTrack.art_url && (
                <MediaFrame
                  className={styles.art}
                  src={lastTrack.art_url}
                  alt={`${lastTrack.album} album art`}
                  aspectRatio="1 / 1"
                />
              )}
              <div className={styles.body}>
                <div className={styles.readout} aria-live="polite">
                  <p className={styles.muted}>
                    {age ? `Last played · ${age}` : 'Last played'}
                  </p>
                  <a
                    className={styles.trackTitle}
                    href={lastTrack.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {lastTrack.title}
                  </a>
                  <p className={styles.artists}>{lastTrack.artists.join(', ')}</p>
                  {lastTrack.album && (
                    <p className={styles.album}>{lastTrack.album}</p>
                  )}
                </div>
              </div>
            </div>
          </Panel>
        </SectionShell>
      );
    }

    if (config.idle !== 'message') return null;
    return (
      <SectionShell
        title={config.title}
        eyebrow={config.eyebrow}
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

  return (
    <SectionShell
      title={config.title}
      eyebrow={config.eyebrow}
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
