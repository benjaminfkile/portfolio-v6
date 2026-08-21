import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { usePrefersReducedMotion } from '../../lib/prefersReducedMotion';
import styles from './Popover.module.css';

/**
 * Popover - the shared disclosure primitive behind the hero strip's Spotify and
 * Duolingo detail layers (task 129, DESIGN.md §5). Strip items stay deliberately
 * minimal; richer information (art, artists, progress meter, XP, crowns) appears
 * only when the visitor interacts.
 *
 * Two interaction models by device (no hover-only affordance - see DESIGN.md §3):
 *
 * - Hover-capable devices (`@media (hover: hover) and (pointer: fine)`):
 *     open on hover with a ~150ms intent delay so brushing past does not flash
 *     the panel; keyboard focus opens instantly. Mouse leaving the trigger *or*
 *     the panel schedules a matching ~150ms close so the visitor can travel the
 *     gap between them; entering the panel cancels it. Blur (focus leaves the
 *     popover entirely) closes.
 * - Touch (or any device without hover): tap the trigger to open; tap it
 *     again, tap outside, or press Escape to close. No hover paths are wired.
 *
 * Escape always closes and returns focus to the trigger, on both models.
 *
 * The trigger is a real `<button>` with `aria-expanded` and `aria-controls`
 * pointing at the panel; the panel takes `role="dialog"` when it contains an
 * interactive descendant (a link) and `role="tooltip"` otherwise (task brief).
 * The panel is positioned below the trigger and clamped inside the viewport
 * after mount, so it never plants a horizontal scrollbar (App.overflow.test.tsx
 * §3 floor).
 *
 * Reduced motion strips the open animation to a plain opacity change (no scale
 * or slide) - DESIGN.md §6.
 */
export type PopoverPanelRole = 'dialog' | 'tooltip';

export interface PopoverProps {
  /** The disclosure body - album art + track meta, streak + course, etc. */
  content: ReactNode;
  /**
   * `dialog` when the panel contains an interactive descendant (a link);
   * `tooltip` for a purely read-only readout. Screen readers announce the two
   * differently: a dialog is a modeless region the visitor may navigate into,
   * a tooltip is a passive description of the trigger.
   */
  panelRole: PopoverPanelRole;
  /** Accessible name for the panel (its `aria-label`). */
  panelLabel: string;
  /** Optional extra class on the trigger `<button>`. */
  triggerClassName?: string;
  /** Optional extra class on the panel `<div>`. */
  panelClassName?: string;
  /** Optional explicit accessible label for the trigger button. */
  triggerAriaLabel?: string;
  /** The trigger's visible contents - usually an {@link Instrument}. */
  children: ReactNode;
}

/** Hover intent delay in ms - long enough to ignore a stray sweep, short enough
 * that a deliberate hover feels immediate. */
const HOVER_INTENT_MS = 150;

/** Viewport gutter kept between the panel edge and the viewport edge on either
 * side when clamping horizontally. */
const VIEWPORT_GUTTER_PX = 8;

/**
 * Detect whether the current environment reports a hover-capable, fine-pointer
 * input (typically a mouse). Falls back to `false` when `matchMedia` is missing
 * (SSR / older jsdom), so the touch path - the more constrained UX - is the
 * safe default; the hover path only activates when the browser confirms it.
 */
function useHoverCapable(): boolean {
  const read = useCallback((): boolean => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  }, []);
  const [hoverable, setHoverable] = useState<boolean>(read);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mql = window.matchMedia('(hover: hover) and (pointer: fine)');
    const onChange = () => setHoverable(mql.matches);
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    }
    mql.addListener(onChange);
    return () => mql.removeListener(onChange);
  }, [read]);
  return hoverable;
}

export default function Popover({
  content,
  panelRole,
  panelLabel,
  triggerClassName,
  panelClassName,
  triggerAriaLabel,
  children,
}: PopoverProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [shiftPx, setShiftPx] = useState(0);
  const panelId = useId();
  const hoverable = useHoverCapable();
  const reduced = usePrefersReducedMotion();

  const clearTimers = useCallback(() => {
    if (openTimer.current != null) {
      window.clearTimeout(openTimer.current);
      openTimer.current = null;
    }
    if (closeTimer.current != null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const open = useCallback(() => {
    clearTimers();
    setIsOpen(true);
  }, [clearTimers]);

  const close = useCallback(() => {
    clearTimers();
    setIsOpen(false);
  }, [clearTimers]);

  const scheduleOpen = useCallback(() => {
    clearTimers();
    openTimer.current = window.setTimeout(() => {
      openTimer.current = null;
      setIsOpen(true);
    }, HOVER_INTENT_MS);
  }, [clearTimers]);

  const scheduleClose = useCallback(() => {
    clearTimers();
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null;
      setIsOpen(false);
    }, HOVER_INTENT_MS);
  }, [clearTimers]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  // After the panel mounts, measure it and shift horizontally to keep it inside
  // the viewport. Without this a right-edge trigger would push the panel past
  // the viewport and cause horizontal scroll (App.overflow.test.tsx §3 floor).
  // The shift is applied via a CSS variable so the panel's keyframe animation
  // can still control the transform property on the vertical axis.
  useLayoutEffect(() => {
    if (!isOpen || !panelRef.current) {
      setShiftPx(0);
      return;
    }
    const panel = panelRef.current;
    // Measure from a zero-shift baseline so successive re-measures don't compound.
    panel.style.setProperty('--popover-shift', '0px');
    const rect = panel.getBoundingClientRect();
    const viewport = window.innerWidth;
    let dx = 0;
    if (rect.right > viewport - VIEWPORT_GUTTER_PX) {
      dx = viewport - VIEWPORT_GUTTER_PX - rect.right;
    }
    if (rect.left + dx < VIEWPORT_GUTTER_PX) {
      dx = VIEWPORT_GUTTER_PX - rect.left;
    }
    setShiftPx(dx);
  }, [isOpen, content]);

  // Outside click and Escape close it, both hover and touch paths. Escape
  // returns focus to the trigger so keyboard visitors don't lose their place
  // (a11y - the disclosure "returns" the user to where they started).
  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: Event) => {
      const target = event.target as Node | null;
      if (rootRef.current && target && rootRef.current.contains(target)) return;
      close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, close]);

  const onRootBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!hoverable) return;
    const next = event.relatedTarget as Node | null;
    if (next && rootRef.current && rootRef.current.contains(next)) return;
    // React fires blur before the next focus lands in some paths; defer one
    // task so we can trust `document.activeElement` and skip a spurious close
    // when focus moved into the panel via mouse.
    window.setTimeout(() => {
      const active = document.activeElement;
      if (rootRef.current && active && rootRef.current.contains(active)) return;
      close();
    }, 0);
  };

  const onTriggerClick = () => {
    if (isOpen) close();
    else open();
  };

  const onTriggerFocus = () => {
    if (!hoverable) return;
    open();
  };

  const onTriggerMouseEnter = (_: MouseEvent<HTMLButtonElement>) => {
    if (!hoverable) return;
    if (isOpen) {
      clearTimers();
      return;
    }
    scheduleOpen();
  };

  const onTriggerMouseLeave = (_: MouseEvent<HTMLButtonElement>) => {
    if (!hoverable) return;
    scheduleClose();
  };

  const onPanelMouseEnter = () => {
    if (!hoverable) return;
    clearTimers();
  };

  const onPanelMouseLeave = () => {
    if (!hoverable) return;
    scheduleClose();
  };

  const triggerClasses = [styles.trigger, triggerClassName]
    .filter(Boolean)
    .join(' ');
  const panelClasses = [
    styles.panel,
    reduced ? styles.reduced : styles.animated,
    panelClassName,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={styles.root} ref={rootRef} onBlur={onRootBlur}>
      <button
        type="button"
        ref={triggerRef}
        className={triggerClasses}
        aria-expanded={isOpen}
        aria-controls={panelId}
        aria-label={triggerAriaLabel}
        aria-haspopup={panelRole === 'dialog' ? 'dialog' : undefined}
        onClick={onTriggerClick}
        onFocus={onTriggerFocus}
        onMouseEnter={onTriggerMouseEnter}
        onMouseLeave={onTriggerMouseLeave}
      >
        {children}
      </button>
      {isOpen && (
        <div
          id={panelId}
          ref={panelRef}
          role={panelRole}
          aria-label={panelLabel}
          className={panelClasses}
          style={
            shiftPx !== 0
              ? ({ ['--popover-shift' as string]: `${shiftPx}px` } as CSSProperties)
              : undefined
          }
          onMouseEnter={onPanelMouseEnter}
          onMouseLeave={onPanelMouseLeave}
        >
          {content}
        </div>
      )}
    </div>
  );
}
