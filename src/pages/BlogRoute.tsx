import { useContentDocument } from '../lib/useContentDocument';
import ContentPage from './ContentPage';
import BlogIndexPage from './BlogIndexPage';

/**
 * The `/blog` route (Blog Page v1.x). Blog is now a first-class content page:
 * when the published document carries a page slugged `blog`, `/blog` renders it
 * via {@link ContentPage} (so its sections — typically a `blog` section in
 * `mode: 'index'` — appear like any other page). If no such page exists, the
 * route falls back to the classic {@link BlogIndexPage} so the site degrades
 * gracefully until the admin actually creates the page.
 *
 * `/blog/:slug` post URLs are unaffected — they route to `BlogPostPage`
 * directly (spec §3.6, immutable post URLs).
 *
 * While the document is loading the fallback page is mounted, which keeps the
 * classic behaviour on the initial hit and never blocks the route on a failed
 * content fetch: `BlogIndexPage` shows its own loading/error states via
 * `BlogListing` (§3.5).
 */
export default function BlogRoute() {
  const { state } = useContentDocument();
  const hasBlogPage =
    state.status === 'ready' &&
    state.document.pages?.some((p) => p.slug === 'blog');

  if (hasBlogPage) return <ContentPage slug="blog" />;
  return <BlogIndexPage />;
}
