import { useEffect, useRef, useState } from 'react';
import type { NowPlayingResponse } from './api';
import { usePrefersReducedMotion } from './prefersReducedMotion';

/**
 * Shared local progress interpolation for a live now-playing track. Each poll
 * (or hub push) reports a fresh `progress_ms`; between updates the bar is
 * advanced locally against wall-clock so it does not sit static. Both the
 * standalone {@link ../sections/NowPlayingSection} and the hero-strip
 * disclosure popover consume this hook so their bars creep in lock-step from a
 * single implementation.
 *
 * Under reduced motion the interpolation is disabled - the bar renders at the
 * last-reported progress and never updates until the next payload (DESIGN.md
 * §6). When the track is not playing, or its duration is unknown, the returned
 * percent is 0 and no timer is started.
 */
const CREEP_INTERVAL_MS = 1_000;

export interface NowPlayingProgress {
  /** Interpolated progress in ms since the current track began. */
  progressMs: number;
  /** Interpolated progress as a 0-100 percent, clamped. `0` when unknown. */
  percent: number;
  /** Track duration in ms, or `0` when the track has no known duration. */
  durationMs: number;
}

/**
 * Coarse relative age used by the last-played readout: "just now", "5m ago",
 * "2h ago", "3d ago"; `null` on an unparseable timestamp so the caller can
 * degrade to the bare "Last played" label.
 */
export function relativeTimeSince(iso: string, now = Date.now()): string | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const mins = Math.floor(Math.max(0, now - t) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * Interpolate the current track's progress against wall-clock between payloads.
 * Anchors on every ready payload (a fresh `progress_ms` arrives on each poll,
 * even for the same track); a non-playing state clears the anchor and the
 * returned percent falls to 0.
 */
export function useNowPlayingProgress(
  state:
    | { status: 'loading' }
    | { status: 'error' }
    | { status: 'ready'; data: NowPlayingResponse },
): NowPlayingProgress {
  const reduced = usePrefersReducedMotion();
  const anchor = useRef<{ base: number; at: number } | null>(null);
  const [progressMs, setProgressMs] = useState(0);

  useEffect(() => {
    if (state.status === 'ready' && state.data.playing) {
      const base = state.data.track.progress_ms ?? 0;
      anchor.current = { base, at: Date.now() };
      setProgressMs(base);
    } else {
      anchor.current = null;
    }
  }, [state]);

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

  const percent =
    durationMs > 0 ? Math.min(100, (progressMs / durationMs) * 100) : 0;

  return { progressMs, percent, durationMs };
}
