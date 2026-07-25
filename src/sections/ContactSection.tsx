import type { SectionProps } from './types';
import type { Link } from '../types/content';
import LinkList from '../components/LinkList';
import styles from './ContactSection.module.css';

/**
 * A static contact block (spec §3.4): optional blurb, an email `mailto:` link,
 * and an optional ordered `Link[]` rendered through the shared {@link LinkList}.
 */
interface ContactData {
  title?: string;
  body?: string;
  email?: string;
  links?: Link[];
}

export default function ContactSection({ section }: SectionProps) {
  const data = section.data as ContactData;

  return (
    <section className={styles.contact}>
      <h2 className={styles.title}>{data.title ?? 'Contact'}</h2>
      {data.body && <p className={styles.body}>{data.body}</p>}
      {data.email && (
        <p>
          <a href={`mailto:${data.email}`}>{data.email}</a>
        </p>
      )}
      {data.links && data.links.length > 0 && <LinkList links={data.links} />}
    </section>
  );
}
