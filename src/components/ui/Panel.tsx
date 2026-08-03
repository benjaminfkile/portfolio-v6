import type { ElementType, HTMLAttributes, ReactNode } from 'react';
import styles from './Panel.module.css';

export interface PanelProps extends HTMLAttributes<HTMLElement> {
  /** Raised surface (--panel-2) for hover/emphasis (DESIGN.md §4). */
  raised?: boolean;
  /** Element to render; defaults to <div>. */
  as?: ElementType;
  className?: string;
  children?: ReactNode;
}

/**
 * Panel — the bordered --panel surface with --r-m radius that holds cards and
 * instrument groups. The `raised` variant lifts to --panel-2; the light theme
 * carries the one soft --shadow token (DESIGN.md §2.4, §4).
 */
export default function Panel({
  raised = false,
  as: Wrapper = 'div',
  className,
  children,
  ...rest
}: PanelProps) {
  const classes = [styles.panel, raised && styles.raised, className]
    .filter(Boolean)
    .join(' ');

  return (
    <Wrapper className={classes} {...rest}>
      {children}
    </Wrapper>
  );
}
