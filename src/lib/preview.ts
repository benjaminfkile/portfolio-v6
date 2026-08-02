/*
 * Preview mode (spec §7).
 *
 * The admin has no shared component package, so it previews unpublished content
 * by embedding the real public site in an iframe:
 *
 *   admin.benkile.com/preview            → <iframe src="…/?preview=<token>">
 *   admin.benkile.com/posts/:id/preview  → <iframe src="…/blog/:slug?preview=<token>&postId=<id>">
 *
 * Seeing `?preview=`, the public site fetches the draft-serialization endpoints
 * (`/api/admin/preview`, `/api/admin/preview/posts/:id`) instead of the public
 * ones, and must mark itself `noindex` so a leaked preview URL is never indexed.
 * This module holds the two tiny pieces that behaviour needs; the endpoint
 * switch itself lives in the pages (`ContentPage`, `BlogPostPage`).
 */

import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

/** The preview parameters carried on the URL (spec §7). */
export interface PreviewParams {
  /** The opaque preview token from `?preview=`, or `null` when not previewing. */
  token: string | null;
  /** The draft post id from `?postId=` (blog routes only), or `null`. */
  postId: string | null;
}

/**
 * Read the preview parameters from the current URL (spec §7). `token` is
 * `?preview=`; `postId` is `?postId=` (used only by the blog post route). An
 * empty `?preview=` counts as absent so a stray `?preview` never trips preview
 * mode on.
 */
export function usePreviewParams(): PreviewParams {
  const [params] = useSearchParams();
  const rawToken = params.get('preview');
  const token = rawToken ? rawToken : null;
  const postId = params.get('postId');
  return { token, postId };
}

/**
 * While `active`, inject `<meta name="robots" content="noindex">` into the
 * document head and remove it on cleanup (spec §7: preview must be `noindex`).
 * The public site is a SPA, so the `<meta>` equivalent is what it can set
 * client-side; the marker attribute keeps the tag identifiable and idempotent.
 */
export function useNoindexMeta(active: boolean): void {
  useEffect(() => {
    if (!active) return;

    let meta = document.head.querySelector<HTMLMetaElement>(
      'meta[name="robots"][data-preview]',
    );
    const created = !meta;
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'robots');
      meta.setAttribute('data-preview', 'true');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', 'noindex');

    return () => {
      if (created) meta?.remove();
    };
  }, [active]);
}
