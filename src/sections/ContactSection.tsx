import type { SectionProps } from './types';
import type { Link } from '../types/content';
import SectionShell from '../components/ui/SectionShell';
import Panel from '../components/ui/Panel';
import LinkButton from '../components/ui/LinkButton';
import styles from './ContactSection.module.css';

/**
 * The closing `contact` section (spec §3.4, DESIGN.md §5): a Panel with a
 * data-driven heading and body, then a row of `LinkButton`s for the ordered
 * `Link[]` (an email contact is just a `mailto:` link). The row wraps on
 * mobile and every control is a ≥44px touch target (DESIGN.md §3, §7).
 */
interface ContactData {
  heading?: string;
  body?: string;
  links?: Link[];
}

export default function ContactSection({ section }: SectionProps) {
  const data = section.data as ContactData;
  const links = data.links ?? [];

  return (
    <SectionShell
      title={data.heading}
      className={styles.contact}
    >
      <Panel className={styles.panel}>
        {data.body && <p className={styles.body}>{data.body}</p>}
        {links.length > 0 && (
          <div className={styles.actions}>
            {links.map((link) => (
              <LinkButton
                key={`${link.type}-${link.url}`}
                variant="button"
                href={link.url}
                external
              >
                {link.label}
              </LinkButton>
            ))}
          </div>
        )}
      </Panel>
    </SectionShell>
  );
}
