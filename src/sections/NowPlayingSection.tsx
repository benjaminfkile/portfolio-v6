import type { SectionProps } from './types';

/**
 * Placeholder for the live `now_playing` section (spec §3.5) — the owner's
 * current Spotify track, fetched at runtime from `GET /api/now-playing` and
 * refetched on an interval. Registered now; the runtime fetch, idle handling,
 * and degrade-to-idle behaviour land in the next task. Renders nothing for the
 * moment.
 */
export default function NowPlayingSection(_props: SectionProps) {
  return null;
}
