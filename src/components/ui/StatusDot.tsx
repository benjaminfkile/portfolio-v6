import styles from './StatusDot.module.css';

export type StatusVariant = 'ok' | 'warn' | 'err';

export interface StatusDotProps {
  /** Semantic status — maps to --ok / --warn / --err (DESIGN.md §2.1). */
  variant: StatusVariant;
  /**
   * Accessible name. When provided the dot becomes role="img" with this label;
   * omit it when a visible text label sits alongside (colour is never the only
   * carrier of status — DESIGN.md §7).
   */
  label?: string;
  className?: string;
}

/**
 * StatusDot — a 7px dot with a soft glow in one of the ok/warn/err semantic
 * colours. It pulses on a 2s cycle and goes fully static under
 * prefers-reduced-motion (DESIGN.md §4, §6).
 */
export default function StatusDot({
  variant,
  label,
  className,
}: StatusDotProps) {
  const classes = [styles.dot, styles[variant], className]
    .filter(Boolean)
    .join(' ');

  const a11y = label
    ? { role: 'img' as const, 'aria-label': label }
    : { 'aria-hidden': true };

  return <span className={classes} {...a11y} />;
}
