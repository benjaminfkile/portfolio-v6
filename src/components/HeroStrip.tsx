import Instrument from './ui/Instrument';
import Popover from './ui/Popover';
import MediaFrame from './ui/MediaFrame';
import Meter from './ui/Meter';
import TagChip from './ui/TagChip';
import { useNowPlaying, type NowPlayingState } from '../lib/useNowPlaying';
import { useDuolingo, type DuolingoState } from '../lib/useDuolingo';
import { usePrefersReducedMotion } from '../lib/prefersReducedMotion';
import {
  relativeTimeSince,
  useNowPlayingProgress,
} from '../lib/nowPlayingProgress';
import styles from './HeroStrip.module.css';

/**
 * HeroStrip is the horizontal "instrument strip" that sits directly under the
 * hero title/intro (DESIGN.md section 5). A row of small mono readouts fed by
 * the same live endpoints the standalone sections use; the row wraps on narrow
 * screens so items land side-by-side on desktop and stack on phones.
 *
 * Current items:
 * - Spotify: subscribes to the shared {@link useNowPlaying} store (same hub
 *     subscription the standalone `now_playing` section uses, so this never
 *     adds a second fetch). Playing → animated equalizer + track title;
 *     idle-with-last-played → static dim equalizer + last title; loading / error
 *     / no last_played → static dim equalizer with no title.
 * - Duolingo: subscribes to the shared {@link useDuolingo} cache (same fetch
 *     the standalone `duolingo` section uses when both are on the page). Renders
 *     ONLY the streak count as its value ("N days", tabular-nums) - course, XP,
 *     and the manual score chip belong to the standalone section and
 *     the hover/tap detail layer, not the one-line strip. Loading, unavailable,
 *     or a failed fetch render nothing for the item so the strip never looks
 *     broken (§3.5 degrade).
 *
 * A shared {@link Popover} primitive provides the disclosure behaviour (task
 * 129): hover with a ~150ms intent delay on hover-capable devices; tap on
 * touch; Escape closes and returns focus to the trigger; the panel is styled
 * with the Panel tokens so it reads as a console readout. The strip items
 * themselves stay deliberately minimal - richer info (art, artists, progress
 * meter, XP, score chip) appears only inside the popover. When the
 * data is unavailable the popover is simply not offered (no empty panels).
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
  /**
   * Optional manual `score_label` from the published `duolingo` section
   * config. When set, the strip's Duolingo popover renders it as a `TagChip`
   * alongside the live values, mirroring the standalone section's chip so both
   * detail views stay in sync (task 129).
   */
  duolingoScoreLabel?: string;
}

export default function HeroStrip({
  duolingoLanguage,
  duolingoScoreLabel,
}: HeroStripProps = {}) {
  return (
    <div className={styles.strip} role="list">
      <SpotifyItem />
      <DuolingoItem
        language={duolingoLanguage ?? DEFAULT_DUOLINGO_LANGUAGE}
        scoreLabel={duolingoScoreLabel}
      />
    </div>
  );
}

/** Number of equalizer bars, kept in [3, 5] per the task brief. */
const BAR_COUNT = 4;

function SpotifyItem() {
  const state = useNowPlaying();
  const reduced = usePrefersReducedMotion();

  const { mode, title, ariaLabel } = resolveSpotify(state);

  const instrument = (
    <Instrument
      label="Now playing"
      accent={mode === 'playing'}
      leading={<Equalizer live={mode === 'playing' && !reduced} />}
      value={title ? <span className={styles.title}>{title}</span> : null}
    />
  );

  const popoverContent = spotifyPopoverContent(state);
  // Only offer a popover when there's a track to reveal - playing OR last_played.
  // Loading / idle-with-nothing renders the bare item with no disclosure so the
  // panel is never empty (task 129).
  if (!popoverContent) {
    return (
      <div className={styles.item} role="listitem" aria-label={ariaLabel}>
        {instrument}
      </div>
    );
  }

  return (
    <div className={styles.item} role="listitem" aria-label={ariaLabel}>
      <Popover
        panelRole="dialog"
        panelLabel={ariaLabel}
        panelClassName={styles.spotifyPanel}
        triggerAriaLabel={`${ariaLabel} (details)`}
        content={popoverContent}
      >
        {instrument}
      </Popover>
    </div>
  );
}

type SpotifyMode = 'playing' | 'last' | 'idle';

interface SpotifyRender {
  mode: SpotifyMode;
  title: string | null;
  ariaLabel: string;
}

function resolveSpotify(state: NowPlayingState): SpotifyRender {
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
 * Build the Spotify popover body from the shared now-playing state. Returns
 * `null` when there is nothing to reveal (loading, error, or idle with no
 * last-played track) - the caller then declines to offer a popover.
 */
function spotifyPopoverContent(state: NowPlayingState) {
  if (state.status !== 'ready') return null;
  const data = state.data;

  if (data.playing) {
    return <SpotifyPlayingBody state={state} />;
  }
  if (data.last_played) {
    return <SpotifyLastPlayedBody last={data.last_played} />;
  }
  return null;
}

function SpotifyPlayingBody({ state }: { state: NowPlayingState }) {
  const { percent, durationMs } = useNowPlayingProgress(state);
  if (state.status !== 'ready' || !state.data.playing) return null;
  const { track } = state.data;
  return (
    <div className={styles.spotifyBody}>
      {track.art_url && (
        <MediaFrame
          className={styles.spotifyArt}
          src={track.art_url}
          alt={`${track.album} album art`}
          aspectRatio="1 / 1"
        />
      )}
      <div className={styles.spotifyReadout}>
        <a
          className={styles.spotifyLink}
          href={track.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {track.title}
        </a>
        <p className={styles.spotifyArtists}>{track.artists.join(', ')}</p>
        {track.album && (
          <p className={styles.spotifyAlbum}>{track.album}</p>
        )}
        {durationMs > 0 && (
          <Meter
            className={styles.spotifyMeter}
            value={percent}
            label="Track progress"
          />
        )}
      </div>
    </div>
  );
}

function SpotifyLastPlayedBody({
  last,
}: {
  last: import('../lib/api').LastPlayed;
}) {
  const { track } = last;
  const age = relativeTimeSince(last.played_at);
  return (
    <div className={styles.spotifyBody}>
      {track.art_url && (
        <MediaFrame
          className={styles.spotifyArt}
          src={track.art_url}
          alt={`${track.album} album art`}
          aspectRatio="1 / 1"
        />
      )}
      <div className={styles.spotifyReadout}>
        <p className={styles.spotifyMeta}>
          {age ? `Last played, ${age}` : 'Last played'}
        </p>
        <a
          className={styles.spotifyLink}
          href={track.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {track.title}
        </a>
        <p className={styles.spotifyArtists}>{track.artists.join(', ')}</p>
        {track.album && (
          <p className={styles.spotifyAlbum}>{track.album}</p>
        )}
      </div>
    </div>
  );
}

/**
 * The Duolingo strip item - a mono `DUOLINGO` label with the streak day count
 * as the value ("412 days", tabular-nums). Nothing else at strip level: course,
 * XP, and the manual score chip belong to the standalone section and
 * the hover/tap detail layer. Renders nothing while loading, on `unavailable`,
 * or on a failed fetch (§3.5 degrade - the unofficial endpoint may break at
 * any time; the strip must never look broken).
 */
function DuolingoItem({
  language,
  scoreLabel,
}: {
  language: string;
  scoreLabel?: string;
}) {
  const state = useDuolingo(language);
  if (state.status !== 'ready') return null;
  const { streak } = state.data;

  const instrument = (
    <Instrument
      label="Duolingo"
      value={
        <span className={styles.streak}>
          <span className={styles.streakCount}>{streak}</span>
          <span className={styles.streakUnit}>days</span>
        </span>
      }
    />
  );

  const itemLabel = `Duolingo streak: ${streak} days`;
  return (
    <div className={styles.item} role="listitem" aria-label={itemLabel}>
      <Popover
        panelRole="tooltip"
        panelLabel={`Duolingo detail: ${streak}-day streak`}
        panelClassName={styles.duolingoPanel}
        triggerAriaLabel={`${itemLabel} (details)`}
        content={<DuolingoPopoverBody state={state} scoreLabel={scoreLabel} />}
      >
        {instrument}
      </Popover>
    </div>
  );
}

function DuolingoPopoverBody({
  state,
  scoreLabel,
}: {
  state: Extract<DuolingoState, { status: 'ready' }>;
  scoreLabel?: string;
}) {
  const { streak, total_xp, course } = state.data;
  return (
    <div className={styles.duolingoBody}>
      <dl className={styles.duolingoStats}>
        <div className={styles.duolingoRow}>
          <dt className={styles.duolingoLabel}>Streak</dt>
          <dd className={styles.duolingoValue}>
            <span className={styles.duolingoStreakCount}>{streak}</span>
            <span className={styles.duolingoUnit}>days</span>
          </dd>
        </div>
        <div className={styles.duolingoRow}>
          <dt className={styles.duolingoLabel}>{course.title}</dt>
          <dd className={styles.duolingoValue}>
            <span className={styles.duolingoXp}>
              {total_xp.toLocaleString('en-US')} XP
            </span>
          </dd>
        </div>
      </dl>
      {scoreLabel && (
        <p className={styles.duolingoScore}>
          <TagChip>{scoreLabel}</TagChip>
        </p>
      )}
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
