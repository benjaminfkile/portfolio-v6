import { useEffect, useState } from 'react';
import type { ComponentType } from 'react';
import { getContent, getPreviewContent } from '../lib/api';
import type { ContentDocument } from '../types/content';
import { SECTION_REGISTRY } from '../registry';
import type { SectionProps } from '../sections/types';
import { usePreviewParams, useNoindexMeta } from '../lib/preview';
import PreviewIndicator from '../components/PreviewIndicator';
import styles from './HomePage.module.css';

/**
 * The registry indexed by an arbitrary string: `section.type` is a `SectionType`
 * at the type level, but the published document can carry a type this build
 * doesn't know yet — so the lookup must be allowed to miss (spec §3.4).
 */
const REGISTRY = SECTION_REGISTRY as Record<
  string,
  ComponentType<SectionProps> | undefined
>;

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; document: ContentDocument };

/**
 * The home page. Fetches `GET /api/content`, then maps the published document's
 * sections through `SECTION_REGISTRY` (spec §3.4), passing each section its
 * `data`/`items` and the document-level media map (§6.8). An unknown `type`
 * renders nothing and logs a warning, so a section published ahead of a public
 * deploy degrades rather than crashes.
 *
 * When `sections` is empty the page renders cleanly with no error, per spec
 * §4.1: an unpublished site is an empty page, not a failure. Loading and error
 * states are plain semantic markup (spec §14).
 *
 * In **preview mode** (§7) — the URL carries `?preview=<token>` — it fetches the
 * draft page from `GET /api/admin/preview` with that token instead of the public
 * endpoint, marks the page `noindex`, and shows a small preview indicator. An
 * invalid or expired token renders a plain failure message.
 */
export default function HomePage() {
  const { token } = usePreviewParams();
  const preview = token != null;
  const [state, setState] = useState<LoadState>({ status: 'loading' });

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

  if (state.status === 'loading') {
    return (
      <main className={styles.page}>
        {preview && <PreviewIndicator />}
        <p>Loading…</p>
      </main>
    );
  }

  if (state.status === 'error') {
    return (
      <main className={styles.page}>
        {preview && <PreviewIndicator />}
        <p role="alert">
          {preview
            ? 'This preview link is invalid or has expired.'
            : 'Sorry — the page could not be loaded right now.'}
        </p>
      </main>
    );
  }

  const { sections } = state.document;
  const media = state.document.media ?? {};

  return (
    <main className={styles.page}>
      {preview && <PreviewIndicator />}
      {sections.map((section) => {
        const Component = REGISTRY[section.type];
        if (!Component) {
          console.warn(
            `Unknown section type "${section.type}" — rendering nothing (spec §3.4).`,
          );
          return null;
        }
        return <Component key={section.id} section={section} media={media} />;
      })}
    </main>
  );
}
