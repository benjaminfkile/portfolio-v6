import styles from './BlogIndexPage.module.css';

/**
 * Stub blog index (`/blog`). The real listing — fetching `GET /api/posts` and
 * rendering teaser cards linking to `/blog/:slug` — lands in a later task
 * (spec §3.5 `blog`, §4.1).
 */
export default function BlogIndexPage() {
  return (
    <main className={styles.page}>
      <h1>Blog</h1>
      <p>Posts are coming soon.</p>
    </main>
  );
}
