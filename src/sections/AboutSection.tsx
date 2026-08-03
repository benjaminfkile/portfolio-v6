import type { SectionProps } from './types';
import SectionShell from '../components/ui/SectionShell';
import Panel from '../components/ui/Panel';
import styles from './AboutSection.module.css';

/**
 * The `about` section (spec §3.4, DESIGN.md §5) — a prose Panel at a 62ch
 * measure. `body` is plain text; blank lines split it into paragraphs. Rich
 * inline formatting is a blog-block concern (§3.7), not a section one, so nothing
 * is parsed here. Heading and optional eyebrow/intro are data-driven through the
 * shared {@link SectionShell}.
 */
interface AboutData {
  title?: string;
  eyebrow?: string;
  intro?: string;
  body?: string;
}

function paragraphs(body: string): string[] {
  return body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

export default function AboutSection({ section }: SectionProps) {
  const data = section.data as AboutData;

  return (
    <SectionShell
      title={data.title ?? 'About'}
      eyebrow={data.eyebrow}
      intro={data.intro}
      className={styles.about}
    >
      {data.body && (
        <Panel className={styles.prose}>
          {paragraphs(data.body).map((paragraph, index) => (
            <p key={index} className={styles.paragraph}>
              {paragraph}
            </p>
          ))}
        </Panel>
      )}
    </SectionShell>
  );
}
