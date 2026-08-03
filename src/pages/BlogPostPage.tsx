import { useEffect, useState } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import { getPost, getPreviewPost, ApiError } from '../lib/api';
import type { Post } from '../types/content';
import BlockRenderer from '../blocks/BlockRenderer';
import { usePreviewParams, useNoindexMeta } from '../lib/preview';
import PreviewIndicator from '../components/PreviewIndicator';
import styles from './BlogPostPage.module.css';

/**
 * A single post (`/blog/:slug`). Fetches `GET /api/posts/:slug` (spec §4.1) and
 * renders the title, cover, and date, then the block body through
 * `BlockRenderer` (§3.7), resolving `media` blocks against the post's media map.
 *
 * A `404` — a slug that is only a draft, or does not exist — renders a clean
 * not-found state, not an error (§4.1). Loading and error states are plain
 * semantic markup (spec §14).
 *
 * In **preview mode** (§7) — the URL carries `?preview=<token>&postId=<id>` —
 * it fetches the draft body from `GET /api/admin/preview/posts/<id>` (addressed
 * by id, since a draft may have no stable slug yet) instead of the public
 * endpoint, marks the page `noindex`, and shows a small preview indicator. An
 * invalid or expired token renders a plain failure message.
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
  const { token, postId } = usePreviewParams();
  const preview = token != null;
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useNoindexMeta(preview);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });

    // Preview addresses the draft by id (§7); a preview link without a postId is
    // malformed, so it degrades to the same plain failure as a bad token.
    if (preview) {
      if (!token || !postId) {
        setState({ status: 'error' });
        return () => controller.abort();
      }
      getPreviewPost(postId, token, { signal: controller.signal })
        .then((post) => setState({ status: 'ready', post }))
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setState({ status: 'error' });
          console.error('Failed to load preview post', error);
        });
      return () => controller.abort();
    }

    if (!slug) {
      setState({ status: 'notfound' });
      return () => controller.abort();
    }

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
  }, [slug, preview, token, postId]);

  if (state.status === 'loading') {
    return (
      <main id="main-content" className={styles.page}>
        {preview && <PreviewIndicator />}
        <p>Loading…</p>
      </main>
    );
  }

  if (state.status === 'notfound') {
    return (
      <main id="main-content" className={styles.page}>
        <h1>Post not found</h1>
        <p>
          This post doesn’t exist, or isn’t published. <RouterLink to="/blog">Back to the blog</RouterLink>.
        </p>
      </main>
    );
  }

  if (state.status === 'error') {
    return (
      <main id="main-content" className={styles.page}>
        {preview && <PreviewIndicator />}
        <p role="alert">
          {preview
            ? 'This preview link is invalid or has expired.'
            : 'Sorry — this post could not be loaded right now.'}
        </p>
      </main>
    );
  }

  const { post } = state;

  return (
    <main id="main-content" className={styles.page}>
      {preview && <PreviewIndicator />}
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
