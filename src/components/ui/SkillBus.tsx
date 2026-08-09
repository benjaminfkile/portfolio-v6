import styles from './SkillBus.module.css';

export interface SkillBusProps {
  /**
   * A monotonically increasing counter bumped on every preview-target change and
   * every lock toggle. Each new value remounts the packet (via `key`), so the
   * one-shot pulse restarts cleanly with no queue buildup. `0` = never fired yet.
   */
  pulseKey: number;
  /** Reduced motion: no pulse at all — the bus stays static decoration (§6). */
  reduced: boolean;
}

/**
 * SkillBus — the console's connective "pipe" (Skills Console v1.9, DESIGN.md §5),
 * a thin bus line with connection nodes linking the three panels. Purely
 * decorative (`aria-hidden`, never a focus stop): the meaning it hints at is
 * already present in the panels. Drawn with tokens (`--line` base, amber pulse)
 * and shown only at the ≥900px grid (CSS). On each `pulseKey` change one short
 * amber packet travels left → centre → right once and stops — never loops.
 * Under reduced motion the packet is not rendered and the line rests static.
 */
export default function SkillBus({ pulseKey, reduced }: SkillBusProps) {
  return (
    <div className={styles.bus} aria-hidden="true">
      <span className={styles.line} />
      <span className={styles.nodes}>
        <span className={styles.node} />
        <span className={styles.node} />
        <span className={styles.node} />
      </span>
      {!reduced && pulseKey > 0 && (
        // key remounts the element on every trigger → the CSS animation restarts
        // from the top with no queued/stacked runs.
        <span
          key={pulseKey}
          className={styles.packet}
          data-testid="skill-bus-packet"
        />
      )}
    </div>
  );
}
