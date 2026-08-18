import type { ReactNode } from 'react';
import styles from './SectionShell.module.css';

type HeadingLevel = 'h1' | 'h2' | 'h3';

export interface SectionShellProps {
  /** Mono, amber, uppercase kicker above the heading (DESIGN.md §4). */
  eyebrow?: ReactNode;
  /**
   * The section heading text. Omit (or pass `undefined` / `''`) and the shell
   * emits no heading at all — no fallback copy, no empty element, no reserved
   * space (headerless sections, §7).
   */
  title?: ReactNode;
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
  const hasEyebrow = eyebrow != null && eyebrow !== '';
  const hasTitle = title != null && title !== '';
  const hasIntro = intro != null && intro !== '';
  const hasHeader = hasEyebrow || hasTitle || hasIntro;
  // Only reserve an aria-labelledby target when there IS a heading to point at
  // — a headerless section labelled by a nonexistent id is worse than one that
  // is simply unlabelled (§7).
  const headingId = id && hasTitle ? `${id}-title` : undefined;

  return (
    <Wrapper
      id={id}
      className={[styles.shell, className].filter(Boolean).join(' ')}
      aria-labelledby={headingId}
    >
      {/*
        Headerless section (§7): when no eyebrow / title / intro is published,
        emit no header markup at all — no empty <div>, no reserved whitespace,
        no h2. The heading outline degrades gracefully to whatever the body
        contains.
      */}
      {hasHeader && (
        // A plain <div>, not <header>: a section's intro block is not a page
        // landmark, and emitting a <header> here would add a stray "banner" to
        // the page's landmark list (§7 wants exactly header/main/footer).
        <div className={styles.header}>
          {hasEyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
          {hasTitle && (
            <Heading id={headingId} className={styles.heading}>
              {title}
            </Heading>
          )}
          {hasIntro && <p className={styles.intro}>{intro}</p>}
        </div>
      )}
      {children != null && children !== '' && (
        <div className={styles.body}>{children}</div>
      )}
    </Wrapper>
  );
}
