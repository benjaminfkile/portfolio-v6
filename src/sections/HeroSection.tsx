import type { SectionProps } from './types';
import SectionShell from '../components/ui/SectionShell';
import HeroStrip from '../components/HeroStrip';
import { usePrefersReducedMotion } from '../lib/prefersReducedMotion';
import styles from './HeroSection.module.css';

/**
 * The hero (spec §3.8, DESIGN.md §5) — a **static** section: a mono amber tagline
 * (the "// software developer" instrument voice), a display headline, and a
 * short intro.
 *
 * On page load the header lines fade/rise 12px, staggered 60ms and once
 * (DESIGN.md §6). Under `prefers-reduced-motion` the orchestration is dropped
 * entirely and everything renders in its final, static state — decided in JS
 * here, with a CSS `@media` guard behind it. v5's animated jQuery header does
 * not carry over; no canvas or scroll theatrics are written (§3.8).
 */
interface HeroData {
  title?: string;
  /** Mono amber tagline in the eyebrow slot, e.g. "// software developer". */
  tagline?: string;
  /** Short lead-in prose below the headline. */
  intro?: string;
  background_media_id?: string;
}

export default function HeroSection({
  section,
  media,
  duolingoLanguage,
}: SectionProps) {
  const data = section.data as HeroData;
  const reduced = usePrefersReducedMotion();
  const background = data.background_media_id
    ? media[data.background_media_id]
    : undefined;

  const shellClass = [styles.hero, reduced ? undefined : styles.animated]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={styles.wrap}>
      {background && (
        <div className={styles.backdrop}>
          <img
            className={styles.backdropImg}
            src={background.url}
            alt={background.alt ?? ''}
            loading="lazy"
            decoding="async"
          />
        </div>
      )}
      <SectionShell
        as="section"
        headingLevel="h1"
        className={shellClass}
        eyebrow={data.tagline}
        title={data.title}
        intro={data.intro}
      >
        <HeroStrip duolingoLanguage={duolingoLanguage} />
      </SectionShell>
    </div>
  );
}
