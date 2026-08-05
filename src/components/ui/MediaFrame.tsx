import { useRef, useState } from 'react';
import { usePrefersReducedMotion } from '../../lib/prefersReducedMotion';
import styles from './MediaFrame.module.css';

export interface MediaFrameProps {
  /** Media URL (a CDN url resolved at read time — spec §6.8). */
  src: string;
  /** Media kind; defaults to an image. */
  type?: 'image' | 'video';
  /**
   * Alt text from the media map (DESIGN.md §7). An empty string is allowed and
   * meaningful: it marks the image decorative. For video it labels the element.
   */
  alt?: string;
  /** CSS `aspect-ratio` for the frame box, e.g. "16 / 9" (default) or "1 / 1". */
  aspectRatio?: string;
  /** Poster frame for video mode; shown before playback and under reduced motion. */
  poster?: string;
  /**
   * Fired once, the first time a video actually starts playing (analytics
   * §4.8 — `video_play`). Covers both autoplay and an explicit tap-to-play;
   * ignored for images. Kept minimal — the caller decides what, if anything,
   * to report.
   */
  onFirstPlay?: () => void;
  className?: string;
}

/**
 * MediaFrame — the bordered (`--line`), `--r-m`-radius media box (DESIGN.md §4).
 * Images lazy-load and cover the frame. Video autoplays muted/looping/inline
 * ONLY when `prefers-reduced-motion` is off; otherwise it renders the poster
 * with an explicit play button — which is also the tap-to-play affordance on
 * touch (DESIGN.md §5, §6).
 */
export default function MediaFrame({
  src,
  type = 'image',
  alt,
  aspectRatio = '16 / 9',
  poster,
  onFirstPlay,
  className,
}: MediaFrameProps) {
  const reduced = usePrefersReducedMotion();
  const videoRef = useRef<HTMLVideoElement>(null);
  const firstPlayFired = useRef(false);
  const [started, setStarted] = useState(false);
  const classes = [styles.frame, className].filter(Boolean).join(' ');

  // Report only the first real playback start (§4.8). Fires for autoplay and
  // for an explicit play alike, since both raise the video's `play` event.
  const handleFirstPlay = () => {
    if (firstPlayFired.current) return;
    firstPlayFired.current = true;
    onFirstPlay?.();
  };

  const handlePlay = () => {
    setStarted(true);
    const video = videoRef.current;
    if (!video || typeof video.play !== 'function') return;
    try {
      const result = video.play();
      if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch {
      /* jsdom / environments without media playback — nothing to do. */
    }
  };

  if (type === 'video') {
    // Autoplay only when motion is allowed; otherwise wait for an explicit play.
    const autoplay = !reduced;
    const showPlayButton = reduced && !started;
    return (
      <div className={classes} style={{ aspectRatio }}>
        <video
          ref={videoRef}
          className={styles.media}
          src={src}
          poster={poster}
          muted
          loop
          playsInline
          autoPlay={autoplay}
          controls={started}
          onPlay={handleFirstPlay}
          aria-label={alt || undefined}
        />
        {showPlayButton && (
          <button
            type="button"
            className={styles.play}
            onClick={handlePlay}
            aria-label={alt ? `Play video: ${alt}` : 'Play video'}
          >
            <span aria-hidden="true" className={styles.playIcon}>
              ▶
            </span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={classes} style={{ aspectRatio }}>
      <img
        className={styles.media}
        src={src}
        alt={alt ?? ''}
        loading="lazy"
        decoding="async"
      />
    </div>
  );
}
