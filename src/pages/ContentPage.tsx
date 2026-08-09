import type { ComponentType } from 'react';
import { useParams } from 'react-router-dom';
import { SECTION_REGISTRY } from '../registry';
import type { SectionProps } from '../sections/types';
import { useContentDocument } from '../lib/useContentDocument';
import { buildSkillsIndex } from '../lib/skillsIndex';
import { useDocumentTitle, pageTitle } from '../lib/useDocumentTitle';
import PreviewIndicator from '../components/PreviewIndicator';
import EmptyState from '../components/EmptyState';
import NotFound from './NotFound';
import styles from './ContentPage.module.css';

/**
 * The registry indexed by an arbitrary string: `section.type` is a `SectionType`
 * at the type level, but the published document can carry a type this build
 * doesn't know yet — so the lookup must be allowed to miss (spec §3.4).
 */
const REGISTRY = SECTION_REGISTRY as Record<
  string,
  ComponentType<SectionProps> | undefined
>;

/**
 * A dynamic content page (spec §3.10). Fetches `GET /api/content` once, selects
 * the page whose `slug` matches the route — `home` for `/`, the `:slug` segment
 * otherwise — and maps that page's sections through `SECTION_REGISTRY` (§3.4),
 * passing each section its `data`/`items` and the document-level media map (§6.8).
 * An unknown section `type` renders nothing and logs a warning, so a section
 * published ahead of a public deploy degrades rather than crashes.
 *
 * A `/:slug` that matches no page is a 404 ({@link NotFound}). The home route is
 * the exception: when nothing has ever been published the document's `pages` is
 * empty, and `/` renders a clean empty page rather than a 404 (spec §4.1).
 *
 * In **preview mode** (§7) — the URL carries `?preview=<token>` — the document is
 * the draft serialization, so the page is selected from the draft by slug,
 * including pages that exist only in the draft. The page is marked `noindex` and
 * shows a small preview indicator. An invalid/expired token, or any load
 * failure, renders a plain failure message.
 */
export default function ContentPage() {
  const { slug: slugParam } = useParams<{ slug: string }>();
  const slug = slugParam ?? 'home';
  const { state, preview } = useContentDocument();

  const page =
    state.status === 'ready'
      ? state.document.pages?.find((p) => p.slug === slug)
      : undefined;

  useDocumentTitle(page ? pageTitle(page.title) : undefined);

  if (state.status === 'loading') {
    return (
      <main id="main-content" className={styles.page}>
        {preview && <PreviewIndicator />}
        <p>Loading…</p>
      </main>
    );
  }

  if (state.status === 'error') {
    return (
      <main id="main-content" className={styles.page}>
        {preview && <PreviewIndicator />}
        <p role="alert">
          {preview
            ? 'This preview link is invalid or has expired.'
            : 'Sorry — the page could not be loaded right now.'}
        </p>
      </main>
    );
  }

  // A missing page is a 404 — except the home route, which renders an empty page
  // when nothing has ever been published (empty `pages`, spec §4.1).
  if (!page && slug !== 'home') {
    return <NotFound />;
  }

  const media = state.document.media ?? {};

  // The home route with nothing ever published (no `home` page): the "nothing
  // published" empty state, in the instrument voice (DESIGN.md §5).
  if (!page) {
    return (
      <main id="main-content" className={styles.page}>
        {preview && <PreviewIndicator />}
        <EmptyState
          heading="Nothing published yet"
          message="This console has no signal to display. Content will appear here once it’s published."
        />
      </main>
    );
  }

  const sections = page.sections ?? [];
  // Portfolio items reference skills by id across pages (Skill Refs v1.8), so the
  // index spans the whole document (live and preview alike, both `state.document`).
  const skillsById = buildSkillsIndex(state.document);

  return (
    <main id="main-content" className={styles.page}>
      {preview && <PreviewIndicator />}
      {sections.map((section) => {
        const Component = REGISTRY[section.type];
        if (!Component) {
          console.warn(
            `Unknown section type "${section.type}" — rendering nothing (spec §3.4).`,
          );
          return null;
        }
        return (
          <Component
            key={section.id}
            section={section}
            media={media}
            documentVersion={state.document.version}
            skillsById={skillsById}
          />
        );
      })}
    </main>
  );
}
