import type { Link, LinkType } from '../types/content';
import styles from './LinkList.module.css';

/**
 * Renders an ordered `Link[]` (spec §3.4). Reused by portfolio items and, one
 * level down, by the blog's `links` block (§3.7) — the two places the shared
 * `Link` model is displayed.
 *
 * Layout follows §3.4: up to ~four links read fine as a flat row; beyond that a
 * flat row stops reading well, so the renderer groups by `type` under small
 * headings ("Repositories", "Live", "Docs"). Array order is display order and
 * is preserved both across and within groups. There is no cap on count.
 *
 * Every anchor opens in a new tab with `rel="noopener noreferrer"` — the links
 * point off-site and the content originates from admin writes (§3.4).
 */

/** A flat row past this many links regroups by type (spec §3.4, "about four"). */
const GROUP_THRESHOLD = 4;

/** Group heading per link type (spec §3.4). `type` drives grouping; the item's
 *  own `label` still says which specific link it is. */
const GROUP_HEADINGS: Record<LinkType, string> = {
  repo: 'Repositories',
  prod: 'Live',
  dev: 'Development',
  docs: 'Docs',
  demo: 'Demos',
  package: 'Packages',
  article: 'Articles',
  other: 'Links',
};

function LinkAnchor({ link }: { link: Link }) {
  return (
    <a
      className={styles.link}
      data-link-type={link.type}
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
    >
      {link.label}
    </a>
  );
}

function LinkRow({ links }: { links: Link[] }) {
  return (
    <ul className={styles.row}>
      {links.map((link, index) => (
        <li key={`${link.url}-${index}`}>
          <LinkAnchor link={link} />
        </li>
      ))}
    </ul>
  );
}

export default function LinkList({ links }: { links: Link[] }) {
  if (links.length === 0) return null;

  if (links.length <= GROUP_THRESHOLD) {
    return <LinkRow links={links} />;
  }

  // Group by type, preserving first-seen order of the groups (Map keeps
  // insertion order) and of the links within each group.
  const groups = new Map<LinkType, Link[]>();
  for (const link of links) {
    const existing = groups.get(link.type);
    if (existing) existing.push(link);
    else groups.set(link.type, [link]);
  }

  return (
    <div className={styles.groups}>
      {[...groups.entries()].map(([type, groupLinks]) => (
        <section key={type} className={styles.group}>
          <h4 className={styles.groupHeading}>{GROUP_HEADINGS[type]}</h4>
          <LinkRow links={groupLinks} />
        </section>
      ))}
    </div>
  );
}
