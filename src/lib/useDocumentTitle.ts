import { useEffect } from 'react';

/**
 * The site name, mirrored from the static `index.html` `<title>`. Per-page titles
 * are suffixed with it (spec §3.10: `title` is the document `<title>`); the home
 * page, whose title is the site name itself, is left un-suffixed so it never
 * doubles up.
 */
export const SITE_NAME = 'Ben Kile';

/** Build the document title for `title`, appending the site suffix (see above). */
export function pageTitle(title: string): string {
  return title === SITE_NAME ? title : `${title} · ${SITE_NAME}`;
}

/**
 * Set `document.title` to `title` (already-composed) while mounted, restoring the
 * previous title on unmount. `undefined` leaves the title untouched — the caller
 * passes it unconditionally (rules of hooks) but only wants to set a title once
 * the page it names is known.
 */
export function useDocumentTitle(title: string | undefined): void {
  useEffect(() => {
    if (title == null) return;
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
