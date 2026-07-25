import type { SectionProps } from './types';
import styles from './HeroSection.module.css';

/**
 * The hero — a **static** section (spec §3.8): title, tagline, and an optional
 * background image. v5's animated jQuery header does not carry over; no canvas
 * or animation code is written here (§3.8, §14.2 "no animations").
 */
interface HeroData {
  title?: string;
  tagline?: string;
  background_media_id?: string;
}

export default function HeroSection({ section, media }: SectionProps) {
  const data = section.data as HeroData;
  const background = data.background_media_id
    ? media[data.background_media_id]
    : undefined;

  return (
    <section className={styles.hero}>
      {background && (
        <img
          className={styles.background}
          src={background.url}
          alt={background.alt ?? ''}
        />
      )}
      <div className={styles.content}>
        {data.title && <h1 className={styles.title}>{data.title}</h1>}
        {data.tagline && <p className={styles.tagline}>{data.tagline}</p>}
      </div>
    </section>
  );
}
