import type { BlockProps, BlockOf } from './types';
import { renderInline } from './inlineMarkdown';
import styles from './QuoteBlock.module.css';

/**
 * A `quote` block (spec §3.7): the quoted text is constrained inline markdown;
 * the optional `attribution` renders as a plain-text citation line.
 */
export default function QuoteBlock({ block }: BlockProps) {
  const { text, attribution } = block as BlockOf<'quote'>;

  return (
    <figure className={styles.block}>
      <blockquote className={styles.quote}>{renderInline(text)}</blockquote>
      {attribution && (
        <figcaption className={styles.attribution}>{attribution}</figcaption>
      )}
    </figure>
  );
}
