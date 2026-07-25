import { useEffect, useState } from 'react';
import { getContent } from '../lib/api';
import type { ContentDocument } from '../types/content';
import styles from './HomePage.module.css';

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; document: ContentDocument };

/**
 * The home page. Fetches `GET /api/content`, holds `{ version, sections }`, and
 * for now renders a placeholder list of section types — the section registry
 * and real components land in a later task (spec §3.4).
 *
 * When `sections` is empty the page renders cleanly with no error, per spec
 * §4.1: an unpublished site is an empty page, not a failure. Loading and error
 * states are plain semantic markup (spec §14).
 */
export default function HomePage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();

    getContent({ signal: controller.signal })
      .then((document) => setState({ status: 'ready', document }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ status: 'error' });
        console.error('Failed to load page content', error);
      });

    return () => controller.abort();
  }, []);

  if (state.status === 'loading') {
    return (
      <main className={styles.page}>
        <p>Loading…</p>
      </main>
    );
  }

  if (state.status === 'error') {
    return (
      <main className={styles.page}>
        <p role="alert">Sorry — the page could not be loaded right now.</p>
      </main>
    );
  }

  const { sections } = state.document;

  return (
    <main className={styles.page}>
      {sections.length > 0 && (
        <ul className={styles.sectionList}>
          {sections.map((section) => (
            <li key={section.id}>{section.type}</li>
          ))}
        </ul>
      )}
    </main>
  );
}
