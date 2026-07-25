import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { getPosts } from '../lib/api';
import type { PostSummary } from '../types/content';
import styles from './BlogIndexPage.module.css';

/**
 * The blog index (`/blog`). Fetches `GET /api/posts` (spec §4.1) and renders
 * teaser cards — cover, title, excerpt, tags, date — each linking to
 * `/blog/:slug`. A tag filter refetches the list scoped to one tag, and a
 * cursor-based "Load more" appends the next page (§4.1: `?tag=`, `?cursor=`).
 *
 * Loading, error, and empty states are plain semantic markup (spec §14).
 */

type Status = 'loading' | 'loadingMore' | 'ready' | 'error';

/** Union of `tags` across the given posts, appended to what is already known. */
function mergeTags(known: string[], posts: PostSummary[]): string[] {
  const merged = [...known];
  for (const post of posts) {
    for (const tag of post.tags) {
      if (!merged.includes(tag)) merged.push(tag);
    }
  }
  return merged;
}

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
          <h2 className={styles.cardTitle}>{post.title}</h2>
        </RouterLink>
        <time className={styles.date} dateTime={post.published_at}>
          {formatDate(post.published_at)}
        </time>
        {post.excerpt && <p className={styles.excerpt}>{post.excerpt}</p>}
        {post.tags.length > 0 && (
          <ul className={styles.tags}>
            {post.tags.map((tag) => (
              <li key={tag} className={styles.tag}>
                {tag}
              </li>
            ))}
          </ul>
        )}
      </article>
    </li>
  );
}

export default function BlogIndexPage() {
  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [knownTags, setKnownTags] = useState<string[]>([]);

  // Initial load and every tag change: reset and fetch the first page.
  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    setPosts([]);
    setCursor(null);

    getPosts(
      { tag: activeTag ?? undefined },
      { signal: controller.signal },
    )
      .then((page) => {
        setPosts(page.posts);
        setCursor(page.next_cursor);
        setKnownTags((prev) => mergeTags(prev, page.posts));
        setStatus('ready');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setStatus('error');
        console.error('Failed to load posts', error);
      });

    return () => controller.abort();
  }, [activeTag]);

  const loadMore = () => {
    if (!cursor) return;
    setStatus('loadingMore');
    getPosts({ tag: activeTag ?? undefined, cursor })
      .then((page) => {
        setPosts((prev) => [...prev, ...page.posts]);
        setCursor(page.next_cursor);
        setKnownTags((prev) => mergeTags(prev, page.posts));
        setStatus('ready');
      })
      .catch((error: unknown) => {
        setStatus('error');
        console.error('Failed to load more posts', error);
      });
  };

  return (
    <main className={styles.page}>
      <h1>Blog</h1>

      {knownTags.length > 0 && (
        <nav className={styles.filters} aria-label="Filter posts by tag">
          <button
            type="button"
            className={styles.filter}
            aria-pressed={activeTag === null}
            onClick={() => setActiveTag(null)}
          >
            All
          </button>
          {knownTags.map((tag) => (
            <button
              key={tag}
              type="button"
              className={styles.filter}
              aria-pressed={activeTag === tag}
              onClick={() => setActiveTag(tag)}
            >
              {tag}
            </button>
          ))}
        </nav>
      )}

      {status === 'loading' && <p>Loading…</p>}

      {status === 'error' && posts.length === 0 && (
        <p role="alert">Sorry — posts could not be loaded right now.</p>
      )}

      {status !== 'loading' && posts.length === 0 && status !== 'error' && (
        <p>No posts yet.</p>
      )}

      {posts.length > 0 && (
        <ul className={styles.list}>
          {posts.map((post) => (
            <TeaserCard key={post.slug} post={post} />
          ))}
        </ul>
      )}

      {status === 'error' && posts.length > 0 && (
        <p role="alert">Sorry — more posts could not be loaded right now.</p>
      )}

      {cursor && (
        <button
          type="button"
          className={styles.loadMore}
          onClick={loadMore}
          disabled={status === 'loadingMore'}
        >
          {status === 'loadingMore' ? 'Loading…' : 'Load more'}
        </button>
      )}
    </main>
  );
}
