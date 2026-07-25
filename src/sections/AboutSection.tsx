import type { SectionProps } from './types';
import styles from './AboutSection.module.css';

/**
 * A static prose section (spec §3.4). `body` is plain text; blank lines split
 * it into paragraphs. Rich inline formatting is a blog-block concern (§3.7),
 * not a section one, so nothing is parsed here.
 */
interface AboutData {
  title?: string;
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
    <section className={styles.about}>
      <h2 className={styles.title}>{data.title ?? 'About'}</h2>
      {data.body &&
        paragraphs(data.body).map((paragraph, index) => (
          <p key={index} className={styles.paragraph}>
            {paragraph}
          </p>
        ))}
    </section>
  );
}
