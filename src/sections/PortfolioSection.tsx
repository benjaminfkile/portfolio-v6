import type { SectionProps } from './types';
import type { MediaRef, PortfolioItem } from '../types/content';
import SectionShell from '../components/ui/SectionShell';
import Panel from '../components/ui/Panel';
import MediaFrame from '../components/ui/MediaFrame';
import TagChip from '../components/ui/TagChip';
import styles from './PortfolioSection.module.css';

/**
 * The `portfolio` section (spec §3.4, DESIGN.md §5) — each project is a
 * {@link Panel}. On phones the media stacks above the text; from 900px up the
 * media and text sit side by side, and the side alternates per item. Each item
 * resolves its `media_id` through the document media map (§6.8); an item
 * carrying a `playback_rate` is a looping demo clip and renders as a video,
 * everything else as a lazy image — the {@link MediaFrame} owns the
 * autoplay-vs-poster motion rules (§6). Tech marks render as small
 * {@link TagChip} image chips, and the ordered `Link[]` renders as a chip row
 * carrying each link's own label (§3.4).
 */
interface PortfolioData {
  title?: string;
  eyebrow?: string;
  intro?: string;
}

/**
 * Derive an accessible name for a tech-stack icon from its URL. `tech_icons` is
 * just a list of image URLs (§6.8) with no companion label, so the icon image
 * would otherwise be the sole — and unannounced — carrier of the technology
 * name (a11y sweep, §7). The filename stem is the name in practice
 * (`.../icons/react.svg` → "React"), so we humanise it: drop the path and
 * extension, turn separators into spaces. Falls back to a generic label if the
 * URL has no usable stem.
 */
export function techNameFromIcon(url: string): string {
  const stem = url
    .split(/[?#]/)[0] // strip query/hash
    .split('/')
    .pop()!
    .replace(/\.[a-z0-9]+$/i, '') // strip extension
    .replace(/[-_.]+/g, ' ')
    .trim();
  return stem === '' ? 'Technology' : `${stem} logo`;
}

function ProjectMedia({
  asset,
  item,
}: {
  asset: MediaRef;
  item: PortfolioItem;
}) {
  const alt = asset.alt ?? item.title;
  // A `playback_rate` marks a looping demo clip (§3.4). MediaFrame decides
  // autoplay vs. poster + play button from the motion preference (§6); the
  // discriminator here is simply the presence of the field.
  const isVideo = item.playback_rate !== undefined;

  return (
    <MediaFrame
      className={styles.media}
      src={asset.url}
      type={isVideo ? 'video' : 'image'}
      alt={alt}
    />
  );
}

export default function PortfolioSection({ section, media }: SectionProps) {
  const data = section.data as PortfolioData;

  return (
    <SectionShell
      title={data.title ?? 'Portfolio'}
      eyebrow={data.eyebrow}
      intro={data.intro}
      className={styles.portfolio}
    >
      <ul className={styles.list}>
        {section.items.map((item, index) => {
          const project = item.data as PortfolioItem;
          const asset = project.media_id ? media[project.media_id] : undefined;
          const techIcons = project.tech_icons ?? [];
          const links = project.links ?? [];
          // From 900px up the media/text split alternates side per item (§5).
          const reversed = index % 2 === 1;

          return (
            <li key={item.id}>
              <Panel
                as="article"
                data-align={reversed ? 'end' : 'start'}
                className={[styles.project, reversed && styles.reverse]
                  .filter(Boolean)
                  .join(' ')}
              >
                {asset && (
                  <div className={styles.mediaCol}>
                    <ProjectMedia asset={asset} item={project} />
                  </div>
                )}
                <div className={styles.text}>
                  <h3 className={styles.projectTitle}>{project.title}</h3>
                  {project.intro && (
                    <p className={styles.intro}>{project.intro}</p>
                  )}
                  {techIcons.length > 0 && (
                    <ul className={styles.techIcons}>
                      {techIcons.map((icon, i) => (
                        <li key={`${icon}-${i}`}>
                          <TagChip className={styles.techChip}>
                            <img
                              className={styles.techIcon}
                              src={icon}
                              alt={techNameFromIcon(icon)}
                            />
                          </TagChip>
                        </li>
                      ))}
                    </ul>
                  )}
                  {project.description && (
                    <p className={styles.description}>{project.description}</p>
                  )}
                  {links.length > 0 && (
                    <ul className={styles.links}>
                      {links.map((link, i) => (
                        <li key={`${link.url}-${i}`}>
                          <TagChip
                            href={link.url}
                            external
                            className={styles.linkChip}
                          >
                            {link.label}
                          </TagChip>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </Panel>
            </li>
          );
        })}
      </ul>
    </SectionShell>
  );
}
