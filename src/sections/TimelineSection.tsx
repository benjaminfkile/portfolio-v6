import type { SectionProps } from './types';
import type { TimelineItem } from '../types/content';
import SectionShell from '../components/ui/SectionShell';
import styles from './TimelineSection.module.css';

/**
 * The `timeline` section (spec §3.4, DESIGN.md §5) — a vertical rail (`--line`)
 * of dated entries with `--amber` node dots. Order is meaningful (typically
 * chronological), so entries render as an `<ol>`. Each item is a
 * `{ date_range, title, description }`; date ranges are mono ("instrument
 * voice", §2.3) and each entry uses the full width of the rail column. Older
 * published documents may still carry a `media_id` on an entry — the renderer
 * simply ignores it (no image, no reserved space).
 */
interface TimelineData {
  heading?: string;
  intro?: string;
}

export default function TimelineSection({ section }: SectionProps) {
  const data = section.data as TimelineData;

  return (
    <SectionShell
      title={data.heading ?? 'Timeline'}
      intro={data.intro}
      className={styles.timeline}
    >
      <ol className={styles.rail}>
        {section.items.map((item) => {
          const entry = item.data as TimelineItem;
          return (
            <li key={item.id} className={styles.entry}>
              <span className={styles.node} aria-hidden="true" />
              <p className={styles.dateRange}>{entry.date_range}</p>
              <h3 className={styles.entryTitle}>{entry.title}</h3>
              {entry.description && (
                <p className={styles.description}>{entry.description}</p>
              )}
            </li>
          );
        })}
      </ol>
    </SectionShell>
  );
}
