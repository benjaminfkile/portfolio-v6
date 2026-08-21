import Instrument from './ui/Instrument';
import { useNowPlaying } from '../lib/useNowPlaying';
import { useDuolingo } from '../lib/useDuolingo';
import { usePrefersReducedMotion } from '../lib/prefersReducedMotion';
import styles from './HeroStrip.module.css';

/**
 * HeroStrip is the horizontal "instrument strip" that sits directly under the
 * hero title/intro (DESIGN.md section 5). A row of small mono readouts fed by
 * the same live endpoints the standalone sections use; the row wraps on narrow
 * screens so items land side-by-side on desktop and stack on phones.
 *
 * Current items:
 *   - Spotify: subscribes to the shared {@link useNowPlaying} store (same hub
 *     subscription the standalone `now_playing` section uses, so this never
 *     adds a second fetch). Playing → animated equalizer + track title;
 *     idle-with-last-played → static dim equalizer + last title; loading / error
 *     / no last_played → static dim equalizer with no title.
 *   - Duolingo: subscribes to the shared {@link useDuolingo} cache (same fetch
 *     the standalone `duolingo` section uses when both are on the page). Renders
 *     ONLY the streak count as its value ("N days", tabular-nums) — course, XP,
 *     crowns, and the manual score chip belong to the standalone section and
 *     the hover/tap detail layer, not the one-line strip. Loading, unavailable,
 *     or a failed fetch render nothing for the item so the strip never looks
 *     broken (§3.5 degrade).
 *
 * The strip never renders as broken or errored (section 3.5 degrade rule).
 */
const DEFAULT_DUOLINGO_LANGUAGE = 'es';

export interface HeroStripProps {
  /**
   * Duolingo course code (spec §3.5, v1.2). Threaded from `ContentPage` off
   * the published document's `duolingo` section config so the strip item and
   * the standalone section call `useDuolingo(same)` and share ONE fetch. When
   * no `duolingo` section is published this is `undefined`; the strip item then
   * falls back to the same `es` default the standalone section uses.
   */
  duolingoLanguage?: string;
}

export default function HeroStrip({ duolingoLanguage }: HeroStripProps = {}) {
  return (
    <div className={styles.strip} role="list">
      <SpotifyItem />
      <DuolingoItem language={duolingoLanguage ?? DEFAULT_DUOLINGO_LANGUAGE} />
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
 * The Duolingo strip item — a mono `DUOLINGO` label with the streak day count
 * as the value ("412 days", tabular-nums). Nothing else at strip level: course,
 * XP, crowns, and the manual score chip belong to the standalone section and
 * the hover/tap detail layer. Renders nothing while loading, on `unavailable`,
 * or on a failed fetch (§3.5 degrade — the unofficial endpoint may break at
 * any time; the strip must never look broken).
 */
function DuolingoItem({ language }: { language: string }) {
  const state = useDuolingo(language);
  if (state.status !== 'ready') return null;
  const { streak } = state.data;
  return (
    <div
      className={styles.item}
      role="listitem"
      aria-label={`Duolingo streak: ${streak} days`}
    >
      <Instrument
        label="Duolingo"
        value={
          <span className={styles.streak}>
            <span className={styles.streakCount}>{streak}</span>
            <span className={styles.streakUnit}>days</span>
          </span>
        }
      />
    </div>
  );
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
