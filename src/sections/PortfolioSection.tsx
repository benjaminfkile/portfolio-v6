import { Link as RouterLink } from 'react-router-dom';
import type { SectionProps } from './types';
import type { LinkType, MediaRef, PortfolioItem, SkillsItem } from '../types/content';
import SectionShell from '../components/ui/SectionShell';
import Panel from '../components/ui/Panel';
import MediaFrame from '../components/ui/MediaFrame';
import TagChip from '../components/ui/TagChip';
import SkillIcon from '../components/ui/SkillIcon';
import LinkIcon from '../components/ui/LinkIcon';
import type { SkillsById } from '../lib/skillsIndex';
import { sendEvent } from '../lib/beacon';
import styles from './PortfolioSection.module.css';

/**
 * Per-link-type chip variant. `prod` gets the filled/accent treatment (the
 * "go see it live" action), `dev` gets a lighter emphasised variant clearly
 * above the rest, and every other type keeps the quiet chip look. Weight
 * order is prod > dev > rest; array order is display order (spec §3.4) and is
 * never rewritten to match this hierarchy.
 */
function chipVariantClass(type: LinkType): string | null {
  if (type === 'prod') return styles.linkChipProd;
  if (type === 'dev') return styles.linkChipDev;
  return null;
}

/**
 * The `portfolio` section (spec §3.4, DESIGN.md §5) — each project is a
 * {@link Panel}. On phones the media stacks above the text; from 900px up the
 * media and text sit side by side, and the side alternates per item. Each item
 * resolves its `media_id` through the document media map (§6.8); an item
 * carrying a `playback_rate` is a looping demo clip and renders as a video,
 * everything else as a lazy image — the {@link MediaFrame} owns the
 * autoplay-vs-poster motion rules (§6). Tech marks reference skills items by id
 * (`skill_refs`, Skill Refs v1.8) and render as small {@link TagChip}s carrying
 * each referenced skill's THEME-AWARE icon + title, so portfolio marks and the
 * skills sphere never diverge; pre-v1.8 documents fall back to the legacy
 * `tech_icons` URL array. The ordered `Link[]` renders as a chip row carrying
 * each link's own label (§3.4).
 */
interface PortfolioData {
  heading?: string;
  intro?: string;
}

/**
 * Resolve an item's `skill_refs` (Skill Refs v1.8) to the skills items they name,
 * in order, dropping any that don't resolve. Publish guarantees every entry
 * resolves to a visible skills item in the same document, but we skip an
 * unresolvable ref defensively (console.warn at most, no warning UI) so a stale
 * or malformed ref never breaks the render.
 */
function resolveSkillRefs(
  refs: string[],
  skillsById: SkillsById,
): Array<{ id: string; skill: SkillsItem }> {
  const resolved: Array<{ id: string; skill: SkillsItem }> = [];
  for (const id of refs) {
    const skill = skillsById[id];
    if (!skill) {
      console.warn(
        `portfolio skill_ref "${id}" resolves to no skills item — skipping (Skill Refs v1.8).`,
      );
      continue;
    }
    resolved.push({ id, skill });
  }
  return resolved;
}

/**
 * LEGACY (pre-v1.8): derive an accessible name for a bare tech-icon URL from its
 * filename. `tech_icons` is just a list of image URLs (§6.8) with no companion
 * label, so the icon image would otherwise be the sole — and unannounced —
 * carrier of the technology name (a11y sweep, §7). The filename stem is the name
 * in practice (`.../icons/react.svg` → "React"), so we humanise it: drop the path
 * and extension, turn separators into spaces. Falls back to a generic label if
 * the URL has no usable stem. Used only on the legacy `tech_icons` path; v1.8
 * items take their accessible name from the resolved skill's title instead.
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
      // Beacon the first play of a portfolio demo clip (§4.8); the project title
      // rides along as meta when present, capped at 100 chars.
      onFirstPlay={
        isVideo
          ? () =>
              sendEvent(
                'video_play',
                item.title ? { title: item.title.slice(0, 100) } : undefined,
              )
          : undefined
      }
    />
  );
}

export default function PortfolioSection({
  section,
  media,
  skillsById,
}: SectionProps) {
  const data = section.data as PortfolioData;
  const skills = skillsById ?? {};

  return (
    <SectionShell
      title={data.heading}
      intro={data.intro}
      className={styles.portfolio}
    >
      <ul className={styles.list}>
        {section.items.map((item, index) => {
          const project = item.data as PortfolioItem;
          const asset = project.media_id ? media[project.media_id] : undefined;
          // v1.8 items carry `skill_refs` (an array, possibly empty); pre-v1.8
          // documents carry `tech_icons` instead and have no `skill_refs`. The
          // presence of `skill_refs` is the discriminator — a v1.8 item never
          // falls back to `tech_icons`.
          const isSkillRefs = Array.isArray(project.skill_refs);
          const resolvedSkills = isSkillRefs
            ? resolveSkillRefs(project.skill_refs, skills)
            : [];
          const legacyIcons = isSkillRefs ? [] : project.tech_icons ?? [];
          const links = project.links ?? [];
          // Related posts (Post Refs v1.14): read defensively — a pre-v1.14
          // payload omits the field entirely. Already resolved to published
          // posts in author order server-side, so we render straight through.
          const posts = project.posts ?? [];
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
                  {/* v1.8: one chip per resolved skill_ref, theme-aware icon +
                      title as the accessible name. */}
                  {resolvedSkills.length > 0 && (
                    <ul className={styles.techIcons}>
                      {resolvedSkills.map(({ id, skill }, i) => (
                        <li key={`${id}-${i}`}>
                          <TagChip className={styles.techChip}>
                            {/* No className: SkillIcon's own .icon already sizes
                                the glyph, and a merged class that sets `display`
                                would defeat the CSS theme swap (it did — two
                                Express icons side by side). `.techIcon` remains
                                for the legacy raw-URL path only. */}
                            <SkillIcon skill={skill} alt={skill.title} />
                          </TagChip>
                        </li>
                      ))}
                    </ul>
                  )}
                  {/* LEGACY (pre-v1.8): raw tech_icons URLs, filename-stem name. */}
                  {legacyIcons.length > 0 && (
                    <ul className={styles.techIcons}>
                      {legacyIcons.map((icon, i) => (
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
                      {links.map((link, i) => {
                        const variant = chipVariantClass(link.type);
                        const chipClass = [styles.linkChip, variant]
                          .filter(Boolean)
                          .join(' ');
                        return (
                          <li key={`${link.url}-${i}`}>
                            <TagChip
                              href={link.url}
                              external
                              className={chipClass}
                            >
                              <LinkIcon type={link.type} />
                              {link.label}
                            </TagChip>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {/* Post Refs v1.14: a compact "From the blog" row of internal
                      links to related posts. Absent/empty renders nothing — no
                      header, no gap (§3.4). These are internal routes, so they
                      use client-side routing (react-router Link, NOT a new tab).
                      The list carries its own aria-label; the blog name, when
                      present, renders as a dim mono prefix. */}
                  {posts.length > 0 && (
                    <div className={styles.posts}>
                      <p className={styles.postsLabel}>From the blog</p>
                      <ul
                        className={styles.postList}
                        aria-label="Related blog posts"
                      >
                        {posts.map((post) => (
                          <li key={post.id}>
                            <RouterLink
                              className={styles.postLink}
                              to={`/blog/${post.slug}`}
                            >
                              {post.blog && (
                                <span className={styles.postBlog}>
                                  {post.blog.name} —{' '}
                                </span>
                              )}
                              {post.title}
                            </RouterLink>
                          </li>
                        ))}
                      </ul>
                    </div>
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
