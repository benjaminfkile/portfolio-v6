/*
 * Vercel Routing Middleware — per-post blog metadata (spec §9.7).
 *
 * Scoped to `/blog/:slug` only (see `config.matcher`), this injects per-post
 * `<title>` and Open Graph / Twitter tags into the served `index.html` so that
 * social unfurlers — which do not execute JavaScript — preview a shared post
 * with its real title, excerpt, and cover rather than the site's generic
 * metadata. Note this is Vercel Routing Middleware, which works with any
 * framework including a static Vite build; it is not a Next.js feature.
 *
 * The logic lives in `src/lib/ogMiddleware.ts` as pure, offline-testable
 * functions; this entrypoint only supplies the API base from the environment
 * and adapts the result to a `Response`. Two spec invariants:
 *   - Fail open: `resolveBlogHtml` returns `null` on any failure, and this
 *     handler then returns nothing so Vercel serves `index.html` untouched via
 *     the SPA rewrite (§9.6). Metadata must never break the page.
 *   - No user-agent branching: the same tags are injected for every visitor;
 *     serving crawlers different HTML is cloaking (§9.7).
 *
 * Middleware runs on the server, where `process.env` exists — unlike the Vite
 * client bundle (§9.6). It reads the same `VITE_API_BASE_URL` the client uses so
 * there is a single source of truth for the API origin.
 */

import { resolveBlogHtml } from './src/lib/ogMiddleware';

export const config = {
  // Must be an inline literal: Vercel resolves `config` by static AST analysis
  // and rejects identifiers (even imported constants). Kept in sync with
  // BLOG_MATCHER in src/lib/ogMiddleware.ts, which pins the value in tests.
  matcher: '/blog/:slug*',
  // runtime: 'nodejs',  // default is 'edge'; either works for a single fetch.
};

export default async function middleware(
  request: Request,
): Promise<Response | undefined> {
  const apiBaseUrl = (process.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

  const html = await resolveBlogHtml(request, { apiBaseUrl });

  // Fail open: no injected HTML → let the request fall through to the static
  // index.html (served via the SPA rewrite), completely untouched.
  if (html == null) return undefined;

  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}
