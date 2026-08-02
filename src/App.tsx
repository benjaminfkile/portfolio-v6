import { Routes, Route, Outlet } from 'react-router-dom';
import ContentPage from './pages/ContentPage';
import BlogIndexPage from './pages/BlogIndexPage';
import BlogPostPage from './pages/BlogPostPage';
import NotFound from './pages/NotFound';
import SiteNav from './components/SiteNav';

/**
 * The shared layout: the site nav (generated from the published document, §3.10)
 * above every page's own `<main>`, so the nav renders on content pages and blog
 * pages alike.
 */
function SiteLayout() {
  return (
    <>
      <SiteNav />
      <Outlet />
    </>
  );
}

/**
 * The route table. Content pages are dynamic (v1.1, spec §3.10): `/` renders the
 * `home` page and `/:slug` any other published page, both via `ContentPage`
 * (which selects the page from `GET /api/content` by slug); an unknown slug is a
 * 404. The blog routes (§8.2) are declared first and are more specific than the
 * `/:slug` catch — `/blog` and `/blog/:slug` are never swallowed by it. Direct
 * hits are served `index.html` via the Vercel SPA rewrite (spec §9.6) so
 * client-side routing resolves them.
 *
 * The router provider (BrowserRouter) is wired in `main.tsx`; tests mount this
 * component inside their own router.
 */
export default function App() {
  return (
    <Routes>
      <Route element={<SiteLayout />}>
        <Route path="/blog" element={<BlogIndexPage />} />
        <Route path="/blog/:slug" element={<BlogPostPage />} />
        <Route path="/" element={<ContentPage />} />
        <Route path="/:slug" element={<ContentPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
