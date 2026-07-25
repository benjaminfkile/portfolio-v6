import { useParams } from 'react-router-dom';
import styles from './BlogPostPage.module.css';

/**
 * Stub single post (`/blog/:slug`). The real page — fetching
 * `GET /api/posts/:slug` and rendering `published_body` through the block
 * registry, with code highlighting and copy — lands in a later task
 * (spec §3.7, §4.1).
 */
export default function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>();

  return (
    <main className={styles.page}>
      <h1>Post</h1>
      <p>
        This post (<code>{slug}</code>) is coming soon.
      </p>
    </main>
  );
}
