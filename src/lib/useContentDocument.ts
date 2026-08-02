import { useEffect, useState } from 'react';
import { getContent, getPreviewContent } from './api';
import type { ContentDocument } from '../types/content';
import { usePreviewParams, useNoindexMeta } from './preview';

/**
 * The load state of the published document (`GET /api/content`, spec §4.1) — the
 * shared shape both the dynamic content pages and the site nav render from.
 */
export type ContentLoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; document: ContentDocument };

/**
 * Fetch the published document once and expose its load state, adapting the
 * preview plumbing (§7): when the URL carries `?preview=<token>` it fetches the
 * draft serialization from `GET /api/admin/preview` with that token instead of
 * the public endpoint, and marks the document `noindex`. Both `ContentPage` and
 * `SiteNav` consume this so a content page and its nav route within the same
 * document — published, or the draft in preview mode (§3.10, §7).
 *
 * `useNoindexMeta` is idempotent (a single marked `<meta>` tag), so more than one
 * caller previewing at once is safe.
 */
export function useContentDocument(): {
  state: ContentLoadState;
  preview: boolean;
} {
  const { token } = usePreviewParams();
  const preview = token != null;
  const [state, setState] = useState<ContentLoadState>({ status: 'loading' });

  useNoindexMeta(preview);

  useEffect(() => {
    const controller = new AbortController();

    const request =
      preview && token
        ? getPreviewContent(token, { signal: controller.signal })
        : getContent({ signal: controller.signal });

    request
      .then((document) => setState({ status: 'ready', document }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ status: 'error' });
        console.error('Failed to load page content', error);
      });

    return () => controller.abort();
  }, [preview, token]);

  return { state, preview };
}
