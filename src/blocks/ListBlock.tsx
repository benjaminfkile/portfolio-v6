import type { BlockProps, BlockOf } from './types';
import { renderInline } from './inlineMarkdown';
import styles from './ListBlock.module.css';

/**
 * A `list` block (spec §3.7): `ordered` picks `<ol>` vs `<ul>`. Each item's text
 * is the constrained inline-markdown subset, parsed by {@link renderInline}.
 */
export default function ListBlock({ block }: BlockProps) {
  const { ordered, items } = block as BlockOf<'list'>;
  const Tag = ordered ? 'ol' : 'ul';

  return (
    <Tag className={styles.list}>
      {items.map((item, index) => (
        <li key={index}>{renderInline(item)}</li>
      ))}
    </Tag>
  );
}
