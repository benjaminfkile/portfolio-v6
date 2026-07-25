import { useEffect, useState } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import { getPost, ApiError } from '../lib/api';
import type { Post } from '../types/content';
import BlockRenderer from '../blocks/BlockRenderer';
import styles from './BlogPostPage.module.css';

/**
 * A single post (`/blog/:slug`). Fetches `GET /api/posts/:slug` (spec §4.1) and
 * renders the title, cover, and date, then the block body through
 * `BlockRenderer` (§3.7), resolving `media` blocks against the post's media map.
 *
 * A `404` — a slug that is only a draft, or does not exist — renders a clean
 * not-found state, not an error (§4.1). Loading and error states are plain
 * semantic markup (spec §14).
 */

type LoadState =
  | { status: 'loading' }
  | { status: 'notfound' }
  | { status: 'error' }
  | { status: 'ready'; post: Post };

/** Format an ISO date as e.g. "24 July 2026", pinned to UTC for stability. */
function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(iso));
}

export default function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    if (!slug) {
      setState({ status: 'notfound' });
      return;
    }
    const controller = new AbortController();
    setState({ status: 'loading' });

    getPost(slug, { signal: controller.signal })
      .then((post) => setState({ status: 'ready', post }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 404) {
          setState({ status: 'notfound' });
          return;
        }
        setState({ status: 'error' });
        console.error('Failed to load post', error);
      });

    return () => controller.abort();
  }, [slug]);

  if (state.status === 'loading') {
    return (
      <main className={styles.page}>
        <p>Loading…</p>
      </main>
    );
  }

  if (state.status === 'notfound') {
    return (
      <main className={styles.page}>
        <h1>Post not found</h1>
        <p>
          This post doesn’t exist, or isn’t published. <RouterLink to="/blog">Back to the blog</RouterLink>.
        </p>
      </main>
    );
  }

  if (state.status === 'error') {
    return (
      <main className={styles.page}>
        <p role="alert">Sorry — this post could not be loaded right now.</p>
      </main>
    );
  }

  const { post } = state;

  return (
    <main className={styles.page}>
      <article>
        <header className={styles.header}>
          <h1 className={styles.title}>{post.title}</h1>
          <time className={styles.date} dateTime={post.published_at}>
            {formatDate(post.published_at)}
          </time>
        </header>
        {post.cover && (
          <img
            className={styles.cover}
            src={post.cover.url}
            alt={post.cover.alt ?? ''}
          />
        )}
        <BlockRenderer body={post.body} media={post.media ?? {}} />
      </article>
    </main>
  );
}
