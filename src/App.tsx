import { Routes, Route } from 'react-router-dom';
import ContentPage from './pages/ContentPage';
import BlogRoute from './pages/BlogRoute';
import BlogPostPage from './pages/BlogPostPage';
import NotFound from './pages/NotFound';
import SiteLayout from './components/SiteLayout';

/**
 * The route table. Content pages are dynamic (v1.1, spec §3.10): `/` renders the
 * `home` page and `/:slug` any other published page, both via `ContentPage`
 * (which selects the page from `GET /api/content` by slug); an unknown slug is a
 * 404. The blog routes (§8.2) are declared first and are more specific than the
 * `/:slug` catch — `/blog` and `/blog/:slug` are never swallowed by it. Direct
 * hits are served `index.html` via the Vercel SPA rewrite (spec §9.6) so
 * client-side routing resolves them.
 *
 * `/blog` goes through {@link BlogRoute} (Blog Page v1.x): if the document
 * carries a page slugged `blog`, it renders as a content page; otherwise it
 * falls back to the classic `BlogIndexPage`, so the site degrades gracefully
 * until the admin creates the page. `/blog/:slug` post URLs are immutable and
 * route to `BlogPostPage` directly (spec §3.6).
 *
 * The router provider (BrowserRouter) is wired in `main.tsx`; tests mount this
 * component inside their own router.
 */
export default function App() {
  return (
    <Routes>
      <Route element={<SiteLayout />}>
        <Route path="/blog" element={<BlogRoute />} />
        <Route path="/blog/:slug" element={<BlogPostPage />} />
        <Route path="/" element={<ContentPage />} />
        <Route path="/:slug" element={<ContentPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
