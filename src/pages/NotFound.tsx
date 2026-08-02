import { Link as RouterLink } from 'react-router-dom';
import { useDocumentTitle, pageTitle } from '../lib/useDocumentTitle';
import styles from './NotFound.module.css';

/**
 * The public 404 (spec §3.10). Reached when a URL slug matches no published page
 * — either a `/:slug` that `ContentPage` could not resolve, or any deeper path
 * the route table doesn't recognise. Plain semantic markup (§14): a heading, an
 * explanation, and a link home.
 */
export default function NotFound() {
  useDocumentTitle(pageTitle('Page not found'));

  return (
    <main className={styles.page}>
      <h1>Page not found</h1>
      <p>
        The page you’re looking for doesn’t exist.{' '}
        <RouterLink to="/">Back to the home page</RouterLink>.
      </p>
    </main>
  );
}
