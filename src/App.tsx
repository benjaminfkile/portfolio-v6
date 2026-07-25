import { Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import BlogIndexPage from './pages/BlogIndexPage';
import BlogPostPage from './pages/BlogPostPage';

/**
 * The route table. The blog is what introduces routing to the public site
 * (spec §8.2); direct hits on `/blog/:slug` are served `index.html` via the
 * Vercel SPA rewrite (spec §9.6) so client-side routing resolves them.
 *
 * The router provider (BrowserRouter) is wired in `main.tsx`; tests mount this
 * component inside their own router.
 */
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/blog" element={<BlogIndexPage />} />
      <Route path="/blog/:slug" element={<BlogPostPage />} />
    </Routes>
  );
}
