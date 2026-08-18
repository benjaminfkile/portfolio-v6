import { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import type { SectionProps } from './types';
import { getPosts } from '../lib/api';
import type { PostSummary } from '../types/content';
import SectionShell from '../components/ui/SectionShell';
import Panel from '../components/ui/Panel';
import BlogListing from '../components/BlogListing';
import styles from './BlogSection.module.css';

/**
 * The live `blog` section (spec §3.5, DESIGN.md §5) — two shapes selected by
 * the published `data.mode` field (Blog Page v1.x):
 *
 * - `mode: 'teaser'` (default; absent field also reads as teaser): the N most
 *   recent published posts as a list of post `Panel`s: a mono date, the title,
 *   and the excerpt, the whole card clickable through to `/blog/:slug`.
 *
 * - `mode: 'index'`: the FULL paginated blog index (filter chips, teaser cards
 *   with cover/tags/blog chip, cursor-based "Load more") embedded in a
 *   content page — the same {@link BlogListing} the classic `/blog` page uses,
 *   so the two never diverge.
 *
 * Config (how many posts, an optional tag or blog filter, header copy) is
 * published in the snapshot; teaser posts and the index listing are both
 * fetched at runtime from `GET /api/posts` so post publishing stays decoupled
 * from page publishing.
 *
 * Standard live-section rules apply (§3.5): a loading state, and **degrade
 * rather than error** — a failed fetch, or (teaser only) simply no posts to
 * show, renders the section as nothing rather than a broken page.
 */
interface BlogData {
  /**
   * Which shape to render (Blog Page v1.x). Read defensively — the regenerated
   * section type may not yet carry the field locally, and any value other than
   * `'index'` falls back to the teaser (same as the field being absent).
   */
  mode?: 'teaser' | 'index';
  limit?: number;
  tag?: string;
  /**
   * A blog slug (Blogs v1.13): when set, the teaser shows only that blog's posts
   * and its "view all" link targets the index filtered to it. Read defensively —
   * the regenerated section type may not yet carry the field locally.
   */
  blog?: string;
  title?: string;
  eyebrow?: string;
  intro?: string;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'ready'; posts: PostSummary[] };

/** Format an ISO date as e.g. "24 July 2026", pinned to UTC for stability. */
function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(iso));
}

function TeaserCard({ post }: { post: PostSummary }) {
  return (
    <li>
      <Panel as="article" className={styles.card}>
        {/* The whole card is one link (DESIGN.md §5); the date/excerpt live
            inside it so a tap anywhere opens the post. */}
        <RouterLink className={styles.cardLink} to={`/blog/${post.slug}`}>
          <time className={styles.date} dateTime={post.published_at}>
            {formatDate(post.published_at)}
          </time>
          <h3 className={styles.cardTitle}>{post.title}</h3>
          {post.excerpt && <p className={styles.excerpt}>{post.excerpt}</p>}
        </RouterLink>
      </Panel>
    </li>
  );
}

/**
 * Index-mode: render the shared {@link BlogListing} inside a `SectionShell`, so
 * a content page slugged `blog` reads identically to the classic `/blog`. On a
 * fetch failure the whole section drops (live-section rules, §3.5).
 */
function IndexModeSection({ config }: { config: BlogData }) {
  const [hidden, setHidden] = useState(false);
  const handleError = useCallback(() => setHidden(true), []);

  if (hidden) return null;

  return (
    <SectionShell
      title={config.title}
      eyebrow={config.eyebrow}
      intro={config.intro}
      className={styles.blog}
    >
      <BlogListing onError={handleError} />
    </SectionShell>
  );
}

/** Teaser mode (the default): the N most recent posts, whole-card links. */
function TeaserModeSection({ config }: { config: BlogData }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();

    getPosts(
      { limit: config.limit, tag: config.tag, blog: config.blog },
      { signal: controller.signal },
    )
      .then((page) => setState({ status: 'ready', posts: page.posts }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ status: 'unavailable' });
        console.error('Failed to load blog teasers', error);
      });

    return () => controller.abort();
  }, [config.limit, config.tag, config.blog]);

  if (state.status === 'loading') {
    return (
      <SectionShell
        title={config.title}
        eyebrow={config.eyebrow}
        intro={config.intro}
        className={styles.blog}
      >
        <p className={styles.muted}>Loading…</p>
      </SectionShell>
    );
  }

  // Degrade to nothing: a failed fetch or an empty listing simply drops the
  // section rather than showing a broken or empty shell (§3.5).
  if (state.status === 'unavailable' || state.posts.length === 0) {
    return null;
  }

  return (
    <SectionShell
      title={config.title}
      eyebrow={config.eyebrow}
      intro={config.intro}
      className={styles.blog}
    >
      <ul className={styles.list}>
        {state.posts.map((post) => (
          <TeaserCard key={post.slug} post={post} />
        ))}
      </ul>
      <RouterLink
        className={styles.more}
        to={config.blog ? `/blog?blog=${encodeURIComponent(config.blog)}` : '/blog'}
      >
        Read the blog
      </RouterLink>
    </SectionShell>
  );
}

export default function BlogSection({ section }: SectionProps) {
  const config = section.data as BlogData;
  if (config.mode === 'index') return <IndexModeSection config={config} />;
  return <TeaserModeSection config={config} />;
}
