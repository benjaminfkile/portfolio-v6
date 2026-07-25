import type { BlockProps, BlockOf } from './types';
import { renderInline } from './inlineMarkdown';
import styles from './ParagraphBlock.module.css';

/**
 * A `paragraph` block (spec §3.7). Its text is the constrained inline-markdown
 * subset (bold, italic, inline code, links), parsed to React elements by
 * {@link renderInline} — never HTML, never `dangerouslySetInnerHTML`.
 */
export default function ParagraphBlock({ block }: BlockProps) {
  const { text } = block as BlockOf<'paragraph'>;

  return <p className={styles.paragraph}>{renderInline(text)}</p>;
}
