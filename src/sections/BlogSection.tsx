import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import type { SectionProps } from './types';
import { getPosts } from '../lib/api';
import type { PostSummary } from '../types/content';
import styles from './BlogSection.module.css';

/**
 * The live `blog` section (spec §3.5) — the N most recent published posts as
 * teaser cards linking to `/blog/:slug`. Config (how many posts, an optional
 * tag filter) is published in the snapshot; the listing is fetched at runtime
 * from `GET /api/posts` so post publishing stays decoupled from page
 * publishing.
 *
 * Standard live-section rules apply (§3.5): a loading state, and **degrade
 * rather than error** — a failed fetch, or simply no posts to show, renders the
 * section as nothing rather than a broken page.
 */
interface BlogData {
  limit?: number;
  tag?: string;
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
      <article className={styles.card}>
        <RouterLink className={styles.cardLink} to={`/blog/${post.slug}`}>
          {post.cover && (
            <img
              className={styles.cover}
              src={post.cover.url}
              alt={post.cover.alt ?? ''}
            />
          )}
          <h3 className={styles.cardTitle}>{post.title}</h3>
        </RouterLink>
        <time className={styles.date} dateTime={post.published_at}>
          {formatDate(post.published_at)}
        </time>
        {post.excerpt && <p className={styles.excerpt}>{post.excerpt}</p>}
      </article>
    </li>
  );
}

export default function BlogSection({ section }: SectionProps) {
  const config = section.data as BlogData;
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();

    getPosts(
      { limit: config.limit, tag: config.tag },
      { signal: controller.signal },
    )
      .then((page) => setState({ status: 'ready', posts: page.posts }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ status: 'unavailable' });
        console.error('Failed to load blog teasers', error);
      });

    return () => controller.abort();
  }, [config.limit, config.tag]);

  if (state.status === 'loading') {
    return (
      <section className={styles.blog} aria-label="From the blog">
        <h2 className={styles.title}>From the blog</h2>
        <p className={styles.muted}>Loading…</p>
      </section>
    );
  }

  // Degrade to nothing: a failed fetch or an empty listing simply drops the
  // section rather than showing a broken or empty shell (§3.5).
  if (state.status === 'unavailable' || state.posts.length === 0) {
    return null;
  }

  return (
    <section className={styles.blog} aria-label="From the blog">
      <h2 className={styles.title}>From the blog</h2>
      <ul className={styles.list}>
        {state.posts.map((post) => (
          <TeaserCard key={post.slug} post={post} />
        ))}
      </ul>
      <RouterLink className={styles.more} to="/blog">
        Read the blog
      </RouterLink>
    </section>
  );
}
