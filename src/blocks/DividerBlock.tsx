import styles from './DividerBlock.module.css';

/**
 * A `divider` block (spec §3.7): a semantic thematic break. It carries no data,
 * so it ignores its props entirely.
 */
export default function DividerBlock() {
  return <hr className={styles.divider} />;
}
