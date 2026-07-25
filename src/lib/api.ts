/*
 * Small fetch helper for the public API.
 *
 * `VITE_API_BASE_URL` is the API origin. Locally it is empty, so requests are
 * same-origin and go through Vite's `/api` dev proxy (spec §10); in production
 * it is set to the gateway URL (spec §9.6). An empty base therefore means
 * "same-origin" — exactly what the dev proxy expects.
 *
 * Note the Vite convention: env access is `import.meta.env.VITE_*`, and
 * `process` does not exist at runtime (spec §9.6).
 */

import type { ContentDocument, Post, PostSummary } from '../types/content';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

/** Thrown for any non-2xx response so callers can distinguish HTTP failures. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * Fetch `path` (an absolute path beginning with `/`) against the configured
 * API base and parse the JSON body. Throws {@link ApiError} on a non-ok status.
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { Accept: 'application/json' },
    ...init,
  });

  if (!response.ok) {
    throw new ApiError(
      response.status,
      `Request to ${path} failed with ${response.status}`,
    );
  }

  return (await response.json()) as T;
}

/**
 * `GET /api/content` — the latest published document (spec §4.1). Returns an
 * empty `sections` array (not a 404) when nothing has ever been published.
 */
export function getContent(init?: RequestInit): Promise<ContentDocument> {
  return apiFetch<ContentDocument>('/api/content', init);
}

/**
 * One page of `GET /api/posts` (spec §4.1). Summaries only — never bodies — plus
 * an opaque `next_cursor` for the next page, or `null` on the last page. The
 * cursor is round-tripped verbatim as `?cursor=`; the public site never parses
 * it. This is a raw payload, consistent with `getContent` — public read
 * endpoints return their resource directly, not the admin write envelope (§4.3).
 */
export interface PostList {
  posts: PostSummary[];
  next_cursor: string | null;
}

/** Query parameters for {@link getPosts} (spec §4.1: `?limit=`, `?tag=`, `?cursor=`). */
export interface GetPostsParams {
  tag?: string;
  cursor?: string;
  limit?: number;
}

/**
 * `GET /api/posts` — a page of published post summaries (spec §4.1). Filters by
 * `tag` and paginates with the cursor from a previous {@link PostList} response.
 */
export function getPosts(
  params: GetPostsParams = {},
  init?: RequestInit,
): Promise<PostList> {
  const search = new URLSearchParams();
  if (params.tag) search.set('tag', params.tag);
  if (params.cursor) search.set('cursor', params.cursor);
  if (params.limit != null) search.set('limit', String(params.limit));
  const query = search.toString();
  return apiFetch<PostList>(`/api/posts${query ? `?${query}` : ''}`, init);
}

/**
 * `GET /api/posts/:slug` — one published post with its resolved block body (spec
 * §4.1). Throws {@link ApiError} with status `404` for a slug that exists only
 * as a draft or not at all; callers render a clean not-found state.
 */
export function getPost(slug: string, init?: RequestInit): Promise<Post> {
  return apiFetch<Post>(`/api/posts/${encodeURIComponent(slug)}`, init);
}
