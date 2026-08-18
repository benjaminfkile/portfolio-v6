import BlogListing from '../components/BlogListing';
import styles from './BlogIndexPage.module.css';

/**
 * The classic blog index (`/blog`, spec §3.5, §4.1). Renders the shared
 * {@link BlogListing} — filter chips, teaser cards, cursor-based "Load more" —
 * inside the page's `<main>` under a mono `// writing` eyebrow and a `Blog`
 * heading. Used as the fallback when the published document does not carry a
 * page slugged `blog` (Blog Page v1.x): once the admin creates that page, `/blog`
 * routes to it via `ContentPage` instead and this file is no longer mounted.
 */
export default function BlogIndexPage() {
  return (
    <main id="main-content" className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>// writing</p>
        <h1 className={styles.pageTitle}>Blog</h1>
      </header>
      <BlogListing />
    </main>
  );
}
