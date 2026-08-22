import { useEffect, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { getPosts } from '../lib/api';
import type { Blog, PostSummary } from '../types/content';
import Panel from './ui/Panel';
import TagChip from './ui/TagChip';
import styles from './BlogListing.module.css';

/**
 * The paginated blog listing body — filter chips, teaser cards, and the
 * cursor-based "Load more" — shared by the classic `/blog` fallback page and by
 * a `blog` section rendered with `mode: 'index'` (spec §3.5, §4.1; Blog Page
 * v1.x). Fetches `GET /api/posts`, refetches when the tag / blog filter
 * changes, and appends the next page on demand. A `?blog=<slug>` URL filter
 * (Blogs v1.13) is round-tripped through pagination.
 *
 * The listing has no outer landmark — the caller owns the surrounding wrapper
 * (`<main>` for the fallback page, `SectionShell` for the section). On a fetch
 * failure it renders an inline alert by default; live sections pass
 * `onError` and render nothing instead (§3.5 degrade).
 */

/**
 * `loading` is the first fetch only (nothing to show yet). A filter change
 * refetches as `refreshing`: the previous cards stay mounted and dimmed until
 * the new page lands, so the listing never collapses to a one-line
 * "Loading…" (which yanked the footer up into the viewport mid-fetch).
 */
type Status = 'loading' | 'refreshing' | 'loadingMore' | 'ready' | 'error';

export interface BlogListingProps {
  /**
   * Fired when the initial fetch fails. Live sections (blog section
   * `mode: 'index'`) use this to drop the whole section rather than showing an
   * error inline — the fallback page keeps the default inline alert.
   */
  onError?: () => void;
}

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

/** Distinct blogs (by slug) across the given posts, appended to what is known. */
function mergeBlogs(known: Blog[], posts: PostSummary[]): Blog[] {
  const merged = [...known];
  for (const post of posts) {
    const blog = post.blog;
    if (blog && !merged.some((known) => known.slug === blog.slug)) {
      merged.push(blog);
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
      <Panel as="article" className={styles.card}>
        <RouterLink className={styles.cardLink} to={`/blog/${post.slug}`}>
          {post.cover && (
            <img
              className={styles.cover}
              src={post.cover.url}
              alt={post.cover.alt ?? ''}
            />
          )}
          <div className={styles.meta}>
            <time className={styles.date} dateTime={post.published_at}>
              {formatDate(post.published_at)}
            </time>
            {/* API-derived → mono 'instrument voice' (DESIGN.md §5); a post with
                no blog shows no chip. */}
            {post.blog && <span className={styles.blogChip}>{post.blog.name}</span>}
          </div>
          <h2 className={styles.cardTitle}>{post.title}</h2>
          {post.excerpt && <p className={styles.excerpt}>{post.excerpt}</p>}
        </RouterLink>
        {post.tags.length > 0 && (
          <ul className={styles.tags}>
            {post.tags.map((tag) => (
              <li key={tag}>
                <TagChip>{tag}</TagChip>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </li>
  );
}

export default function BlogListing({ onError }: BlogListingProps = {}) {
  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [knownTags, setKnownTags] = useState<string[]>([]);
  const [knownBlogs, setKnownBlogs] = useState<Blog[]>([]);

  // The blog filter lives on the URL (`?blog=<slug>`) so it round-trips through
  // links, refreshes, and pagination (Blogs v1.13).
  const [searchParams, setSearchParams] = useSearchParams();
  const activeBlog = searchParams.get('blog');

  const setActiveBlog = (slug: string | null) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (slug) next.set('blog', slug);
        else next.delete('blog');
        return next;
      },
      { replace: true },
    );
  };

  // Initial load and every tag / blog change: fetch the first page. On a
  // filter change the stale list stays rendered (stale-while-revalidate) and
  // is swapped in one commit when the new page arrives.
  useEffect(() => {
    const controller = new AbortController();
    setStatus((prev) => (prev === 'loading' ? 'loading' : 'refreshing'));
    setCursor(null);

    getPosts(
      { tag: activeTag ?? undefined, blog: activeBlog ?? undefined },
      { signal: controller.signal },
    )
      .then((page) => {
        setPosts(page.posts);
        setCursor(page.next_cursor);
        setKnownTags((prev) => mergeTags(prev, page.posts));
        setKnownBlogs((prev) => mergeBlogs(prev, page.posts));
        setStatus('ready');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setPosts([]);
        setStatus('error');
        console.error('Failed to load posts', error);
        onError?.();
      });

    return () => controller.abort();
  }, [activeTag, activeBlog, onError]);

  const loadMore = () => {
    if (!cursor) return;
    setStatus('loadingMore');
    getPosts({ tag: activeTag ?? undefined, blog: activeBlog ?? undefined, cursor })
      .then((page) => {
        setPosts((prev) => [...prev, ...page.posts]);
        setCursor(page.next_cursor);
        setKnownTags((prev) => mergeTags(prev, page.posts));
        setKnownBlogs((prev) => mergeBlogs(prev, page.posts));
        setStatus('ready');
      })
      .catch((error: unknown) => {
        setStatus('error');
        console.error('Failed to load more posts', error);
      });
  };

  // Kept wired (state, merge, fetch param) for when the filter row returns.
  void setActiveTag;
  void knownTags;

  return (
    <>
      {/* Tag filter row hidden for now (owner request 2026-08-21). Restore by
          uncommenting this block and the setActiveTag/knownTags voids below;
          the fetch stays unscoped while activeTag is null.
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
      */}

      {knownBlogs.length > 0 && (
        <nav className={styles.filters} aria-label="Filter posts by blog">
          <button
            type="button"
            className={styles.filter}
            aria-pressed={activeBlog === null}
            onClick={() => setActiveBlog(null)}
          >
            All
          </button>
          {knownBlogs.map((blog) => (
            <button
              key={blog.slug}
              type="button"
              className={styles.filter}
              aria-pressed={activeBlog === blog.slug}
              onClick={() => setActiveBlog(blog.slug)}
            >
              {blog.name}
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
        <ul className={styles.list} aria-busy={status === 'refreshing'}>
          {posts.map((post) => (
            <TeaserCard key={post.slug} post={post} />
          ))}
        </ul>
      )}

      {status === 'error' && posts.length > 0 && (
        <p role="alert">Sorry — more posts could not be loaded right now.</p>
      )}

      {cursor && status !== 'refreshing' && (
        <button
          type="button"
          className={styles.loadMore}
          onClick={loadMore}
          disabled={status === 'loadingMore'}
        >
          {status === 'loadingMore' ? 'Loading…' : 'Load more'}
        </button>
      )}
    </>
  );
}
