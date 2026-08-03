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

/* ---- Live section: status (spec §3.5) ------------------------------------- */

/**
 * One curated service in the `status` section's response. The gateway's raw
 * `/api/health` is never exposed; `/api/status` returns a deliberate shape
 * (spec §3.5): a name, whether it is up, and an optional response time the
 * section renders only when its `show_response_times` config is on.
 */
export interface ServiceStatus {
  name: string;
  ok: boolean;
  response_time_ms?: number;
}

/**
 * `GET /api/status` — curated service health for the `status` section (spec
 * §3.5). The endpoint returns 200 with `degraded: true` when the upstream
 * gateway reports an outage (the gateway's own 503 translated into an honest,
 * cached, deliberately-shaped body); the section shows that as degraded rather
 * than as a failure.
 */
export interface StatusResponse {
  degraded: boolean;
  services: ServiceStatus[];
}

/** `GET /api/status` — see {@link StatusResponse}. */
export function getStatus(init?: RequestInit): Promise<StatusResponse> {
  return apiFetch<StatusResponse>('/api/status', init);
}

/* ---- Live section: now-playing (spec §3.5, §4.6) -------------------------- */

/** The curated track shape returned by `/api/now-playing` (spec §4.6). */
export interface NowPlayingTrack {
  title: string;
  artists: string[];
  album: string;
  /**
   * Hotlinked from Spotify's CDN (`i.scdn.co`), never ingested (spec §3.5).
   * `null` when Spotify reports a track with no album image — render without art.
   */
  art_url: string | null;
  /** Outbound `open.spotify.com` track link. */
  url: string;
  progress_ms?: number;
  duration_ms?: number;
}

/**
 * `GET /api/now-playing` — the owner's current Spotify track (spec §4.6). The
 * API proxies Spotify server-side and returns `{ playing: false }` both when
 * nothing is playing and on any upstream failure, so the browser never sees a
 * Spotify error — a broken integration simply reads as "not listening" (§3.5).
 */
export type NowPlayingResponse =
  | { playing: true; track: NowPlayingTrack }
  | { playing: false };

/** `GET /api/now-playing` — see {@link NowPlayingResponse}. */
export function getNowPlaying(init?: RequestInit): Promise<NowPlayingResponse> {
  return apiFetch<NowPlayingResponse>('/api/now-playing', init);
}

/* ---- Live section: duolingo (spec §3.5, v1.2) ----------------------------- */

/** The curated course readout returned by `/api/duolingo` (spec §3.5). */
export interface DuolingoCourse {
  title: string;
  xp: number;
  crowns: number;
}

/**
 * `GET /api/duolingo?language=<code>` — the owner's Duolingo streak and progress
 * in one course (spec §3.5, v1.2). The API proxies Duolingo's unofficial user
 * endpoint server-side and returns `{ available: false }` on *any* upstream
 * failure or shape drift, so the browser never sees an error — the section
 * simply renders nothing (§3.5 degrade). The official CEFR "Duolingo Score" is
 * not exposed here; the section's manual `score_label` config carries it.
 */
export type DuolingoResponse =
  | { available: true; streak: number; course: DuolingoCourse }
  | { available: false };

/**
 * `GET /api/duolingo` — see {@link DuolingoResponse}. `language` is the course
 * code (e.g. `es`) forwarded as the `?language=` query param so the API returns
 * the matching course from the payload.
 */
export function getDuolingo(
  language: string,
  init?: RequestInit,
): Promise<DuolingoResponse> {
  const query = language ? `?language=${encodeURIComponent(language)}` : '';
  return apiFetch<DuolingoResponse>(`/api/duolingo${query}`, init);
}

/* ---- Live section: github (spec §3.5, v1.2) ------------------------------- */

/**
 * One column of the contribution calendar: seven daily contribution counts
 * (Sun→Sat). Weeks arrive oldest→newest (spec §3.5), so the newest weeks are at
 * the end of the array and the section slices from the tail.
 */
export interface GithubWeek {
  days: number[];
}

/**
 * `GET /api/github` — the owner's contribution calendar and total (spec §3.5,
 * v1.2). The API proxies GitHub's GraphQL `contributionsCollection` server-side
 * with a public-scope PAT and returns `{ available: false }` on any failure, so
 * the section degrades to nothing rather than erroring. The per-day count is the
 * only signal exposed — there is no per-cell event round-trip (§3.5).
 */
export type GithubResponse =
  | { available: true; total: number; weeks: GithubWeek[] }
  | { available: false };

/** `GET /api/github` — see {@link GithubResponse}. */
export function getGithub(init?: RequestInit): Promise<GithubResponse> {
  return apiFetch<GithubResponse>('/api/github', init);
}

/* ---- Preview (spec §7) ---------------------------------------------------- */

/**
 * `GET /api/admin/preview` — serialize the **draft** page in `/api/content`
 * shape (spec §7). Called by the public site (not the admin) when the URL
 * carries `?preview=<token>`; the opaque, 15-minute token is forwarded as
 * `?token=` and authorizes this read-only GET via `requireAdminOrPreviewToken`
 * (§4.2). An invalid or expired token yields a non-2xx {@link ApiError} the
 * caller renders as a plain failure message.
 */
export function getPreviewContent(
  token: string,
  init?: RequestInit,
): Promise<ContentDocument> {
  return apiFetch<ContentDocument>(
    `/api/admin/preview?token=${encodeURIComponent(token)}`,
    init,
  );
}

/**
 * `GET /api/admin/preview/posts/:id` — serialize a post's **draft** body in
 * `/api/posts/:slug` shape (spec §7). Reached on a blog route carrying
 * `?preview=<token>&postId=<id>`; the post is addressed by `id`, not slug,
 * because a draft may not have a stable slug yet.
 */
export function getPreviewPost(
  postId: string,
  token: string,
  init?: RequestInit,
): Promise<Post> {
  return apiFetch<Post>(
    `/api/admin/preview/posts/${encodeURIComponent(postId)}?token=${encodeURIComponent(token)}`,
    init,
  );
}
