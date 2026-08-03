import type { ReactNode } from 'react';
import styles from './SectionShell.module.css';

type HeadingLevel = 'h1' | 'h2' | 'h3';

export interface SectionShellProps {
  /** Mono, amber, uppercase kicker above the heading (DESIGN.md §4). */
  eyebrow?: ReactNode;
  /** The section heading text. */
  title: ReactNode;
  /** Optional lead-in prose below the heading. */
  intro?: ReactNode;
  /** Heading element to render; defaults to <h2> (one <h1> per page, §7). */
  headingLevel?: HeadingLevel;
  /** Landmark element; defaults to <section>. */
  as?: 'section' | 'div' | 'article';
  id?: string;
  className?: string;
  children?: ReactNode;
}

/**
 * SectionShell — the wrapper every public section mounts inside. Renders the
 * eyebrow / heading / intro header block with consistent vertical rhythm, then
 * the section body as children (DESIGN.md §4). When a heading is present the
 * section is labelled by it for assistive tech (§7).
 */
export default function SectionShell({
  eyebrow,
  title,
  intro,
  headingLevel = 'h2',
  as: Wrapper = 'section',
  id,
  className,
  children,
}: SectionShellProps) {
  const Heading = headingLevel;
  const headingId = id ? `${id}-title` : undefined;

  return (
    <Wrapper
      id={id}
      className={[styles.shell, className].filter(Boolean).join(' ')}
      aria-labelledby={headingId}
    >
      <header className={styles.header}>
        {eyebrow != null && eyebrow !== '' && (
          <p className={styles.eyebrow}>{eyebrow}</p>
        )}
        <Heading id={headingId} className={styles.heading}>
          {title}
        </Heading>
        {intro != null && intro !== '' && (
          <p className={styles.intro}>{intro}</p>
        )}
      </header>
      {children != null && children !== '' && (
        <div className={styles.body}>{children}</div>
      )}
    </Wrapper>
  );
}
