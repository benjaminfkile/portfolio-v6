import type { ReactNode } from 'react';
import { Link, useInRouterContext } from 'react-router-dom';

/**
 * An anchor that knows whether it points back into this app.
 *
 * Content links (inline markdown in paragraphs, the `links` block, project
 * cards) are stored as absolute URLs by the admin. Some of them point at other
 * pages of this very site, and those should behave like navigation, not like
 * an off-site link that pops a new tab.
 *
 * "Internal" is decided at render time against `window.location.origin` PLUS
 * the site's canonical host(s) (`VITE_SITE_HOSTS`, default `benkile.com`).
 * Content links are authored against the canonical domain, so a link to
 * `https://benkile.com/blog/x` must still navigate in place when the same
 * build is served from a preview deployment (`*.vercel.app`) or localhost;
 * before this, every such link looked off-site there and popped a new tab.
 * A canonical-host link is rewritten to its path and navigates on the
 * CURRENT origin, so a preview deployment never jumps to prod.
 *
 *  - Same-origin URL inside a router: a react-router `Link` to the path, so the
 *    SPA navigates without a reload and stays in the same tab.
 *  - Same-origin URL with no router in context (tests, or a stray render
 *    outside `App`): a plain same-tab anchor.
 *  - Anything else: an off-site anchor with `target="_blank"` and
 *    `rel="noopener noreferrer"`, exactly as before.
 *
 * Protocol safety is the caller's job (the inline renderer only passes
 * `http`/`https`; `Link` data is schema-validated by the API).
 */

/**
 * If `url` resolves to the current origin, return its in-app path
 * (`pathname + search + hash`); otherwise `null`. Relative URLs resolve
 * against the current origin and therefore count as internal.
 */
export function internalPath(url: string): string | null {
  if (typeof window === 'undefined' || !window.location?.origin) return null;
  let parsed: URL;
  try {
    parsed = new URL(url, window.location.origin);
  } catch {
    return null;
  }
  if (!sameSite(parsed, window.location) && !isCanonicalHost(parsed)) return null;
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

/**
 * Same site = same host once a leading `www.` is ignored on both sides, and
 * same port. The apex domain and its `www.` form are conventionally one site
 * (one usually redirects to the other), so a content link written against
 * either should count as internal whichever one the app is being served from.
 * Scheme is deliberately not compared: an `http://` link to an `https://` site
 * is still this site, and react-router navigation stays on the current scheme.
 */
function sameSite(a: { hostname: string; port: string }, b: { hostname: string; port: string }): boolean {
  return stripWww(a.hostname) === stripWww(b.hostname) && a.port === b.port;
}

function stripWww(host: string): string {
  return host.toLowerCase().replace(/^www\./, '');
}

const DEFAULT_SITE_HOSTS = 'benkile.com';

/**
 * The canonical public hostnames of this site, regardless of where the build
 * is currently being served from. Comma-separated in `VITE_SITE_HOSTS`;
 * defaults to the production domain. `www.` is ignored on both sides.
 */
export function canonicalHosts(): string[] {
  const raw = (import.meta.env.VITE_SITE_HOSTS as string | undefined) ?? DEFAULT_SITE_HOSTS;
  return raw
    .split(',')
    .map((h) => stripWww(h.trim()))
    .filter(Boolean);
}

/** True when `url` points at one of the canonical hosts on the default port. */
function isCanonicalHost(url: { hostname: string; port: string }): boolean {
  if (url.port !== '') return false;
  return canonicalHosts().includes(stripWww(url.hostname));
}

interface SmartLinkProps {
  href: string;
  className?: string;
  children: ReactNode;
  /** Extra data-* attributes etc. are passed straight through to the anchor. */
  [attr: `data-${string}`]: string | undefined;
}

export default function SmartLink({ href, className, children, ...rest }: SmartLinkProps) {
  const inRouter = useInRouterContext();
  const path = internalPath(href);

  if (path !== null) {
    if (inRouter) {
      return (
        <Link to={path} className={className} {...rest}>
          {children}
        </Link>
      );
    }
    return (
      <a href={path} className={className} {...rest}>
        {children}
      </a>
    );
  }

  return (
    <a href={href} className={className} target="_blank" rel="noopener noreferrer" {...rest}>
      {children}
    </a>
  );
}
