import { useCallback } from 'react';
import type { SectionProps } from './types';
import type { MediaRef, PortfolioItem } from '../types/content';
import LinkList from '../components/LinkList';
import styles from './PortfolioSection.module.css';

/**
 * The portfolio grid (spec §3.4). Each item resolves its `media_id` through the
 * document's media map (§6.8), lists tech icons, shows intro + description, and
 * renders its ordered `Link[]` via the shared {@link LinkList} (grouping past
 * ~4 links, `_blank` + `noopener`).
 *
 * An item carrying a `playback_rate` is a looping demo video (v5's project
 * clips); `transform_value` is a genuinely dynamic CSS transform and is the one
 * inline style §14.1 rule 4 explicitly permits.
 */
interface PortfolioData {
  title?: string;
}

function PortfolioMedia({
  asset,
  item,
}: {
  asset: MediaRef;
  item: PortfolioItem;
}) {
  const alt = asset.alt ?? item.title;
  const style = item.transform_value
    ? { transform: item.transform_value }
    : undefined;

  // A demo clip: autoplay, muted, looping. `playbackRate` has no React prop, so
  // it is set on the element via a ref callback.
  const setRate = useCallback(
    (el: HTMLVideoElement | null) => {
      if (el && item.playback_rate) el.playbackRate = item.playback_rate;
    },
    [item.playback_rate],
  );

  if (item.playback_rate !== undefined) {
    return (
      <video
        ref={setRate}
        className={styles.media}
        src={asset.url}
        style={style}
        autoPlay
        muted
        loop
        playsInline
        aria-label={alt}
      />
    );
  }

  return (
    <img className={styles.media} src={asset.url} alt={alt} style={style} />
  );
}

export default function PortfolioSection({ section, media }: SectionProps) {
  const data = section.data as PortfolioData;

  return (
    <section className={styles.portfolio}>
      {data.title && <h2 className={styles.title}>{data.title}</h2>}
      <ul className={styles.list}>
        {section.items.map((item) => {
          const project = item.data as PortfolioItem;
          const asset = project.media_id ? media[project.media_id] : undefined;
          return (
            <li key={item.id}>
              <article className={styles.project}>
                {asset && <PortfolioMedia asset={asset} item={project} />}
                <h3 className={styles.projectTitle}>{project.title}</h3>
                {project.intro && (
                  <p className={styles.intro}>{project.intro}</p>
                )}
                {project.tech_icons.length > 0 && (
                  <ul className={styles.techIcons}>
                    {project.tech_icons.map((icon, index) => (
                      <li key={`${icon}-${index}`}>
                        <img className={styles.techIcon} src={icon} alt="" />
                      </li>
                    ))}
                  </ul>
                )}
                {project.description && (
                  <p className={styles.description}>{project.description}</p>
                )}
                <LinkList links={project.links} />
              </article>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
