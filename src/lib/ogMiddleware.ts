/*
 * Blog metadata injection for the Vercel Routing Middleware (spec §9.7).
 *
 * The public site is a client-rendered SPA, so `/blog/:slug` serves an
 * `index.html` with no title, description, or body until JavaScript runs.
 * Social unfurlers (Open Graph, X cards, Slack, iMessage) do not execute JS, so
 * every shared post link would preview with the site's generic metadata. The
 * middleware fetches the post and injects per-post `<title>` and `og:`/`twitter:`
 * tags into the served HTML *before* it reaches the unfurler.
 *
 * This module is the testable core: the transform is a pure function
 * ({@link injectBlogMetadata}) and the orchestration ({@link resolveBlogHtml})
 * takes an injectable `fetch`, so both the injection and the fail-open behaviour
 * can be exercised offline with `fetch` mocked. The Vercel entrypoint
 * (`middleware.ts` at the repo root) is a thin wrapper that supplies the API
 * base from the environment and wraps the result in a `Response`.
 *
 * Two invariants from the spec, enforced here rather than at the edge:
 *   1. Fail open — on *any* failure return the untouched `index.html`. Metadata
 *      is an enhancement; it must never be able to break the page (§9.7).
 *   2. No user-agent branching — the tags are injected for every visitor, never
 *      conditionally for crawlers. Serving crawlers different HTML than humans
 *      is cloaking and is penalised (§9.7). Nothing in this module reads the
 *      request's `User-Agent`.
 */

/**
 * The subset of `GET /api/posts/:slug` the middleware needs (spec §9.7). The
 * full payload carries the block body too; only these three fields feed the
 * social preview, and reading a subset keeps the middleware decoupled from the
 * post body shape.
 */
export interface PostMetadata {
  title: string;
  excerpt: string;
  cover: { url: string; alt: string | null } | null;
}

/** The Vercel matcher for this middleware — blog post routes only (spec §9.7). */
export const BLOG_MATCHER = '/blog/:slug*';

/**
 * Escape a string for use inside an HTML double-quoted attribute value. Covers
 * the five characters that could break out of an attribute or the surrounding
 * markup; the metadata comes from the API but is treated as untrusted input.
 */
export function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Escape a string for use as HTML text content (e.g. inside `<title>`). */
export function escapeText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Extract the post slug from a `/blog/:slug` pathname, or `null` if it is not one. */
export function slugFromPathname(pathname: string): string | null {
  const match = /^\/blog\/([^/]+)\/?$/.exec(pathname);
  if (!match) return null;
  const slug = decodeURIComponent(match[1]);
  return slug.length > 0 ? slug : null;
}

function metaProperty(property: string, content: string): string {
  return `<meta property="${property}" content="${escapeAttribute(content)}" />`;
}

function metaName(name: string, content: string): string {
  return `<meta name="${name}" content="${escapeAttribute(content)}" />`;
}

/**
 * Inject `<title>` and the `og:` / `twitter:` tags for `post` into `html`,
 * returning the modified document. Pure: no I/O, deterministic in its inputs, so
 * the injection is unit-testable on its own.
 *
 * The existing `<title>` is replaced (falling back to inserting one before
 * `</head>` if the document has none), and the meta tags are inserted just
 * before `</head>`. The canonical `og:url` is the page's origin + path with the
 * query string dropped, so a preview or tracking query never leaks into the
 * shared URL. When the post has no cover, the image tags are omitted and the
 * Twitter card falls back to the small `summary` form.
 */
export function injectBlogMetadata(
  html: string,
  post: PostMetadata,
  pageUrl: URL,
): string {
  const title = post.title;
  const description = post.excerpt;
  const image = post.cover?.url;
  const canonicalUrl = `${pageUrl.origin}${pageUrl.pathname}`;

  const tags = [
    metaProperty('og:type', 'article'),
    metaProperty('og:title', title),
    metaProperty('og:description', description),
    metaProperty('og:url', canonicalUrl),
    metaName('twitter:card', image ? 'summary_large_image' : 'summary'),
    metaName('twitter:title', title),
    metaName('twitter:description', description),
  ];
  if (image) {
    tags.push(metaProperty('og:image', image));
    tags.push(metaName('twitter:image', image));
  }

  const withTitle = replaceTitle(html, title);
  const block = tags.map((tag) => `    ${tag}`).join('\n');

  if (/<\/head>/i.test(withTitle)) {
    return withTitle.replace(/<\/head>/i, `${block}\n  </head>`);
  }
  // No </head> to anchor to — degrade to appending rather than dropping the tags.
  return `${withTitle}\n${block}`;
}

function replaceTitle(html: string, title: string): string {
  const titleTag = `<title>${escapeText(title)}</title>`;
  if (/<title>[\s\S]*?<\/title>/i.test(html)) {
    return html.replace(/<title>[\s\S]*?<\/title>/i, titleTag);
  }
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `    ${titleTag}\n  </head>`);
  }
  return html;
}

/** Build the absolute `GET /api/posts/:slug` URL for `slug` (spec §9.7). */
function postUrl(apiBaseUrl: string, slug: string, pageUrl: URL): string {
  const path = `/api/posts/${encodeURIComponent(slug)}`;
  // In production the API base is an absolute gateway URL (§9.6); fall back to
  // same-origin only if it is somehow unset, so the fetch is always absolute.
  return apiBaseUrl ? `${apiBaseUrl}${path}` : new URL(path, pageUrl).toString();
}

/**
 * Resolve the HTML to serve for a blog request: fetch the post metadata, fetch
 * the static `index.html`, and return it with the metadata injected — or `null`
 * to signal "serve `index.html` untouched" on any failure (bad slug, non-2xx
 * API or index response, network error, malformed JSON). Returning `null` rather
 * than throwing is what makes the middleware fail open (spec §9.7).
 *
 * `fetch` is injectable so the whole path — success and every failure branch —
 * is testable offline. The request's `User-Agent` is never consulted: the same
 * HTML is produced for every visitor (spec §9.7, no cloaking).
 */
export async function resolveBlogHtml(
  request: Request,
  options: { apiBaseUrl: string; fetch?: typeof fetch },
): Promise<string | null> {
  const fetchImpl = options.fetch ?? fetch;
  try {
    const pageUrl = new URL(request.url);
    const slug = slugFromPathname(pageUrl.pathname);
    if (!slug) return null;

    const postResponse = await fetchImpl(
      postUrl(options.apiBaseUrl, slug, pageUrl),
      { headers: { Accept: 'application/json' } },
    );
    if (!postResponse.ok) return null;
    const post = (await postResponse.json()) as PostMetadata;
    if (!post || typeof post.title !== 'string') return null;

    const indexResponse = await fetchImpl(
      new URL('/index.html', pageUrl).toString(),
    );
    if (!indexResponse.ok) return null;
    const html = await indexResponse.text();

    return injectBlogMetadata(html, post, pageUrl);
  } catch {
    // Any failure at all — metadata is an enhancement, never a page-breaker.
    return null;
  }
}
