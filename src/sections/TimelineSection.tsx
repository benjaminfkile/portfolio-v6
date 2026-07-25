import type { SectionProps } from './types';
import type { TimelineItem } from '../types/content';
import styles from './TimelineSection.module.css';

/**
 * An ordered list of dated entries — jobs, milestones (spec §3.4). Each item is
 * a `{ date_range, title, description, media_id? }`. Rendered as an `<ol>` since
 * order (typically chronological) is meaningful.
 */
interface TimelineData {
  title?: string;
}

export default function TimelineSection({ section, media }: SectionProps) {
  const data = section.data as TimelineData;

  return (
    <section className={styles.timeline}>
      {data.title && <h2 className={styles.title}>{data.title}</h2>}
      <ol className={styles.list}>
        {section.items.map((item) => {
          const entry = item.data as TimelineItem;
          const asset = entry.media_id ? media[entry.media_id] : undefined;
          return (
            <li key={item.id} className={styles.entry}>
              <p className={styles.dateRange}>{entry.date_range}</p>
              <h3 className={styles.entryTitle}>{entry.title}</h3>
              {asset && (
                <img
                  className={styles.media}
                  src={asset.url}
                  alt={asset.alt ?? ''}
                />
              )}
              <p className={styles.description}>{entry.description}</p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
