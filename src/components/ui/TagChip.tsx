import type { ReactNode } from 'react';
import styles from './TagChip.module.css';

export interface TagChipProps {
  /** When set, the chip renders as an <a>; otherwise a <span>. */
  href?: string;
  /**
   * Treat the link as external — opens in a new tab and gets
   * rel="noreferrer noopener" (DESIGN.md §4). Ignored without an href.
   */
  external?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * TagChip — a mono, bordered chip (--r-s) for tech tags and small links. Plain
 * tags render as a <span>; when given an href it becomes an <a>, and external
 * links receive rel="noreferrer noopener" (DESIGN.md §4).
 */
export default function TagChip({
  href,
  external = false,
  className,
  children,
}: TagChipProps) {
  const classes = [styles.chip, href && styles.link, className]
    .filter(Boolean)
    .join(' ');

  if (href) {
    const externalProps = external
      ? { target: '_blank', rel: 'noreferrer noopener' }
      : {};
    return (
      <a href={href} className={classes} {...externalProps}>
        {children}
      </a>
    );
  }

  return <span className={classes}>{children}</span>;
}
