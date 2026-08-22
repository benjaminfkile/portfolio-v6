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
 * "Internal" is decided at render time against `window.location.origin`, so
 * nothing here hard-codes a hostname: the same build is internal-aware on any
 * domain it happens to be served from (prod, a preview deployment, localhost).
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
  if (!sameSite(parsed, window.location)) return null;
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
  const strip = (host: string) => host.toLowerCase().replace(/^www\./, '');
  return strip(a.hostname) === strip(b.hostname) && a.port === b.port;
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
