import type { SectionProps } from './types';
import type { TimelineItem } from '../types/content';
import SectionShell from '../components/ui/SectionShell';
import MediaFrame from '../components/ui/MediaFrame';
import styles from './TimelineSection.module.css';

/**
 * The `timeline` section (spec §3.4, DESIGN.md §5) — a vertical rail (`--line`)
 * of dated entries with `--amber` node dots. Order is meaningful (typically
 * chronological), so entries render as an `<ol>`. Each item is a
 * `{ date_range, title, description, media_id? }`; date ranges are mono
 * ("instrument voice", §2.3) and any media resolves through the document media
 * map (§6.8) into a {@link MediaFrame} thumbnail — omitted when there is no
 * `media_id` (or when unmatched) and hidden on cramped phones via CSS (§5).
 */
interface TimelineData {
  title?: string;
  eyebrow?: string;
  intro?: string;
}

export default function TimelineSection({ section, media }: SectionProps) {
  const data = section.data as TimelineData;

  return (
    <SectionShell
      title={data.title ?? 'Timeline'}
      eyebrow={data.eyebrow}
      intro={data.intro}
      className={styles.timeline}
    >
      <ol className={styles.rail}>
        {section.items.map((item) => {
          const entry = item.data as TimelineItem;
          const asset = entry.media_id ? media[entry.media_id] : undefined;
          return (
            <li key={item.id} className={styles.entry}>
              <span className={styles.node} aria-hidden="true" />
              <p className={styles.dateRange}>{entry.date_range}</p>
              <h3 className={styles.entryTitle}>{entry.title}</h3>
              {entry.description && (
                <p className={styles.description}>{entry.description}</p>
              )}
              {asset && (
                <MediaFrame
                  className={styles.thumb}
                  src={asset.url}
                  alt={asset.alt ?? ''}
                />
              )}
            </li>
          );
        })}
      </ol>
    </SectionShell>
  );
}
