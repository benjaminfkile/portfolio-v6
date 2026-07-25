import { useEffect, useState } from 'react';
import type { SectionProps } from './types';
import { getNowPlaying } from '../lib/api';
import type { NowPlayingResponse } from '../lib/api';
import styles from './NowPlayingSection.module.css';

/**
 * The live `now_playing` section (spec §3.5, §4.6) — the owner's current
 * Spotify track. Config is published (idle behaviour, whether to show album
 * art); the track itself is fetched at runtime from `GET /api/now-playing`.
 *
 * This is the one live section whose data changes *while the visitor is on the
 * page*, so it refetches on a ~60s interval — but only while mounted **and**
 * `document.visibilityState` is visible: a backgrounded tab must not poll
 * (§3.5). We also refetch immediately when the tab becomes visible again.
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
}

const POLL_INTERVAL_MS = 60_000;

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; data: NowPlayingResponse };

export default function NowPlayingSection({ section }: SectionProps) {
  const config = section.data as NowPlayingData;
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    const load = () => {
      getNowPlaying()
        .then((data) => {
          if (!cancelled) setState({ status: 'ready', data });
        })
        .catch((error: unknown) => {
          // Degrade to idle — a failed fetch is "not listening", not an error.
          if (cancelled) return;
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

  if (state.status === 'loading') {
    return (
      <section className={styles.nowPlaying} aria-label="Now playing">
        <h2 className={styles.title}>Now playing</h2>
        <p className={styles.muted}>Loading…</p>
      </section>
    );
  }

  const { data } = state;

  if (!data.playing) {
    // Idle is config (§3.5): `hide` removes the section; `message` renders a line.
    if (config.idle !== 'message') return null;
    return (
      <section className={styles.nowPlaying} aria-label="Now playing">
        <h2 className={styles.title}>Now playing</h2>
        <p className={styles.muted}>
          {config.idle_message ?? 'Not listening to anything right now.'}
        </p>
      </section>
    );
  }

  const { track } = data;

  return (
    <section className={styles.nowPlaying} aria-label="Now playing">
      <h2 className={styles.title}>Now playing</h2>
      <div className={styles.track}>
        {config.show_album_art && track.art_url && (
          <img
            className={styles.art}
            src={track.art_url}
            alt={`${track.album} album art`}
          />
        )}
        <div className={styles.meta}>
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
      </div>
    </section>
  );
}
