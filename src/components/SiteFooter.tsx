import { useContentDocument } from '../lib/useContentDocument';
import type { ContentDocument, Link } from '../types/content';
import ContactIcon from './ContactIcon';
import styles from './SiteFooter.module.css';

/**
 * The site footer landmark (DESIGN.md §7 — semantic `header/nav/main/footer`).
 * A quiet console footer: the brand in the mono "instrument voice", the
 * published document's SITE vN readout, and the contact row.
 *
 * Contact lives HERE, not in the page flow (2026-08-22). The `contact` section
 * type is still how the admin stores the data (an optional body line plus an
 * ordered `Link[]`), but the page renderer ignores it and the footer renders
 * the first contact section found anywhere in the document: each link as an
 * icon + label anchor. No contact data, no row. The section's `heading` is
 * intentionally unused; a footer does not need one.
 *
 * The document comes from the same {@link useContentDocument} the nav and
 * pages already share — no extra request. While loading or on a failed fetch
 * the readout and the contact row are simply omitted (§3.5 degrade spirit).
 */
export default function SiteFooter() {
  const { state } = useContentDocument();
  const document = state.status === 'ready' ? state.document : undefined;
  const version = document?.version;
  const contact = document ? findContact(document) : undefined;
  const links = contact?.links ?? [];

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        {(links.length > 0 || contact?.body) && (
          <div className={styles.contact}>
            {contact?.body && <p className={styles.body}>{contact.body}</p>}
            {links.length > 0 && (
              <ul className={styles.links} aria-label="Contact">
                {links.map((link) => (
                  <li key={`${link.type}-${link.url}`}>
                    <a
                      className={styles.link}
                      href={link.url}
                      {...externalAttrs(link.url)}
                    >
                      <ContactIcon type={link.type} className={styles.icon} />
                      <span>{link.label}</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className={styles.meta}>
          <span className={styles.brand}>ben kile</span>
          {version != null && (
            <span className={styles.version} aria-label={`Site version ${version}`}>
              SITE v{version}
            </span>
          )}
        </div>
      </div>
    </footer>
  );
}

interface ContactData {
  body?: string;
  links?: Link[];
}

/** The first `contact` section in document order, or undefined. */
function findContact(document: ContentDocument): ContactData | undefined {
  for (const page of document.pages ?? []) {
    for (const section of page.sections ?? []) {
      if (section.type === 'contact') return section.data as ContactData;
    }
  }
  return undefined;
}

/** http(s) links open in a new tab; mailto:/tel: stay in place. */
function externalAttrs(url: string): { target?: string; rel?: string } {
  return /^https?:/i.test(url)
    ? { target: '_blank', rel: 'noreferrer noopener' }
    : {};
}
