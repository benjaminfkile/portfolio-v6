import { useRef } from 'react';
import styles from './Scrubber.module.css';

export interface ScrubberProps {
  /** Lowest selectable value (inclusive). */
  min: number;
  /** Highest selectable value (inclusive). */
  max: number;
  /** The current value. */
  value: number;
  /** Called with the next integer value on any keyboard/pointer interaction. */
  onChange: (value: number) => void;
  /** Accessible name for the slider (`aria-label`). */
  label: string;
  /** Human-readable text of the current value (`aria-valuetext`), e.g. a datetime. */
  valueText: string;
  /** Coarse step for PageUp/PageDown; defaults to 1. */
  pageStep?: number;
  className?: string;
}

const clampTo = (v: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, Math.round(v)));

/**
 * Scrubber — a draggable horizontal playhead (DESIGN.md §5/§7). A single ARIA
 * `slider` the visitor drives with mouse, touch (unified Pointer Events), or
 * keyboard: ← / ↓ step −1, → / ↑ step +1, PageUp/PageDown by `pageStep`, Home/End
 * jump to the ends. The interactive track is a ≥44px target with a
 * `:focus-visible` amber ring; a fill and thumb mark the position. Presentation
 * only — it holds no time knowledge; the caller maps value ↔ moment and passes
 * the resolved `valueText`. Any easing is disabled under `prefers-reduced-motion`
 * (see the stylesheet).
 */
export default function Scrubber({
  min,
  max,
  value,
  onChange,
  label,
  valueText,
  pageStep = 1,
  className,
}: ScrubberProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const span = max - min;
  const fraction = span > 0 ? (value - min) / span : 0;

  /** Map a pointer's clientX to a value across the track's rendered width. */
  const valueFromClientX = (clientX: number): number => {
    const el = trackRef.current;
    if (!el) return value;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0) return value; // unlaid-out (e.g. jsdom) — no-op
    const frac = (clientX - rect.left) / rect.width;
    return clampTo(min + frac * span, min, max);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    let next: number | null = null;
    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowDown':
        next = value - 1;
        break;
      case 'ArrowRight':
      case 'ArrowUp':
        next = value + 1;
        break;
      case 'PageDown':
        next = value - pageStep;
        break;
      case 'PageUp':
        next = value + pageStep;
        break;
      case 'Home':
        next = min;
        break;
      case 'End':
        next = max;
        break;
      default:
        return;
    }
    event.preventDefault();
    const clamped = clampTo(next, min, max);
    if (clamped !== value) onChange(clamped);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    const next = valueFromClientX(event.clientX);
    if (next !== value) onChange(next);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const next = valueFromClientX(event.clientX);
    if (next !== value) onChange(next);
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const pct = `${(fraction * 100).toFixed(2)}%`;

  return (
    <div className={[styles.scrubber, className].filter(Boolean).join(' ')}>
      <div
        ref={trackRef}
        className={styles.track}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-orientation="horizontal"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={valueText}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className={styles.rail} aria-hidden="true" />
        <div className={styles.fill} aria-hidden="true" style={{ width: pct }} />
        <div className={styles.thumb} aria-hidden="true" style={{ left: pct }} />
      </div>
    </div>
  );
}
