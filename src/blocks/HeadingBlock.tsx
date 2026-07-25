import type { BlockProps, BlockOf } from './types';
import styles from './HeadingBlock.module.css';

/**
 * A `heading` block (spec §3.7): levels 2–4 only — a post lives under the page's
 * `h1`, so `h2`–`h4` are the available depths. Heading text is plain (the inline
 * markdown subset applies to paragraph/list/quote, not headings).
 */
export default function HeadingBlock({ block }: BlockProps) {
  const { level, text } = block as BlockOf<'heading'>;
  const safeLevel = level === 3 || level === 4 ? level : 2;
  const Tag = `h${safeLevel}` as 'h2' | 'h3' | 'h4';

  return <Tag className={styles.heading}>{text}</Tag>;
}
