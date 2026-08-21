import Instrument from './ui/Instrument';
import { useNowPlaying } from '../lib/useNowPlaying';
import { usePrefersReducedMotion } from '../lib/prefersReducedMotion';
import styles from './HeroStrip.module.css';

/**
 * HeroStrip is the horizontal "instrument strip" that sits directly under the
 * hero title/intro (DESIGN.md section 5). A row of small mono readouts fed by
 * the same live endpoints the standalone sections use; this task lands the
 * container and the Spotify readout. Additional items (Duolingo, etc.) drop in
 * as siblings without further layout work: the row wraps on narrow screens.
 *
 * Spotify item subscribes to the shared {@link useNowPlaying} store (the same
 * hub subscription the standalone `now_playing` section uses, so this never
 * adds a second fetch) and renders one of three shapes:
 *   - playing: animated equalizer glyph + track title
 *   - not playing but `last_played` present: static dim equalizer + last title
 *   - loading / error / no last_played: static dim equalizer with no title
 * The strip never renders as broken or errored (section 3.5 degrade rule).
 */
export default function HeroStrip() {
  return (
    <div className={styles.strip} role="list">
      <SpotifyItem />
    </div>
  );
}

/** Number of equalizer bars, kept in [3, 5] per the task brief. */
const BAR_COUNT = 4;

function SpotifyItem() {
  const state = useNowPlaying();
  const reduced = usePrefersReducedMotion();

  const { mode, title, ariaLabel } = resolveSpotify(state);

  return (
    <div className={styles.item} role="listitem" aria-label={ariaLabel}>
      <Instrument
        label="Now playing"
        accent={mode === 'playing'}
        leading={<Equalizer live={mode === 'playing' && !reduced} />}
        value={
          title ? <span className={styles.title}>{title}</span> : null
        }
      />
    </div>
  );
}

type SpotifyMode = 'playing' | 'last' | 'idle';

interface SpotifyRender {
  mode: SpotifyMode;
  title: string | null;
  ariaLabel: string;
}

function resolveSpotify(state: ReturnType<typeof useNowPlaying>): SpotifyRender {
  if (state.status === 'ready') {
    const data = state.data;
    if (data.playing) {
      return {
        mode: 'playing',
        title: data.track.title,
        ariaLabel: `Now playing: ${data.track.title}`,
      };
    }
    if (data.last_played) {
      return {
        mode: 'last',
        title: data.last_played.track.title,
        ariaLabel: `Last played: ${data.last_played.track.title}`,
      };
    }
  }
  return { mode: 'idle', title: null, ariaLabel: 'Not playing' };
}

/**
 * Equalizer glyph: a stack of thin amber bars. `live` bounces each bar at a
 * slightly different period via pure CSS keyframes (staggered per-bar delays);
 * otherwise the bars render at fixed low heights in `--text-dim`. Decorative
 * (aria-hidden); the accessible name lives on the item wrapper.
 */
function Equalizer({ live }: { live: boolean }) {
  const classes = [styles.eq, live ? styles.eqLive : styles.eqStatic]
    .filter(Boolean)
    .join(' ');
  return (
    <span className={classes} aria-hidden="true">
      {Array.from({ length: BAR_COUNT }, (_, i) => (
        <span
          key={i}
          className={styles.bar}
          data-bar={i}
        />
      ))}
    </span>
  );
}
