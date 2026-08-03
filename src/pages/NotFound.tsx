import { useDocumentTitle, pageTitle } from '../lib/useDocumentTitle';
import EmptyState from '../components/EmptyState';
import LinkButton from '../components/ui/LinkButton';
import styles from './NotFound.module.css';

/**
 * The public 404 (spec §3.10). Reached when a URL slug matches no published page
 * — either a `/:slug` that `ContentPage` could not resolve, or any deeper path
 * the route table doesn't recognise. Rendered in the Control Room instrument
 * voice via {@link EmptyState} (DESIGN.md §5): a mono `NO SIGNAL` label, the
 * heading, a plain-language line, and a `LinkButton` home.
 */
export default function NotFound() {
  useDocumentTitle(pageTitle('Page not found'));

  return (
    <main id="main-content" className={styles.page}>
      <EmptyState
        heading="Page not found"
        message="The page you’re looking for doesn’t exist or has moved."
        action={
          <LinkButton variant="button" href="/">
            Back to the home page
          </LinkButton>
        }
      />
    </main>
  );
}
