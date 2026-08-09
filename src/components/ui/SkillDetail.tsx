import SkillIcon from './SkillIcon';
import type { ConsoleSkill } from './SkillList';
import styles from './SkillDetail.module.css';

export interface SkillDetailProps {
  /** The skill to read out (preview else lock), or `null` for the empty state. */
  skill: ConsoleSkill | null;
  /** Extra class merged onto the root — the section makes it the scroll region. */
  className?: string;
}

/**
 * SkillDetail — the console's right panel (Skills Console v1.9, DESIGN.md §5).
 * Shows the previewed skill, else the locked one, else an instrument-voice
 * STANDBY empty state (the NO SIGNAL family, §5). Content is a mono icon+title
 * header over the skill `description` as body prose. The scroll region carries
 * `aria-live="polite"` so screen readers hear preview changes without spam, and
 * is keyboard-focusable (with a visible ring) so a locked skill's long
 * description can be scrolled by keyboard. `overflow-y: auto` inside the shared
 * console height is set by the section.
 */
export default function SkillDetail({ skill, className }: SkillDetailProps) {
  return (
    <div
      className={[styles.detail, className].filter(Boolean).join(' ')}
      aria-live="polite"
      // Focusable only when there is something to scroll; an empty STANDBY panel
      // is not a tab stop.
      tabIndex={skill ? 0 : -1}
      role="group"
      aria-label="Skill detail"
    >
      {skill ? (
        <>
          <div className={styles.header}>
            <SkillIcon skill={skill} alt="" className={styles.icon} />
            <span className={styles.title}>{skill.title}</span>
          </div>
          {skill.description ? (
            <p className={styles.body}>{skill.description}</p>
          ) : (
            <p className={styles.empty}>NO DESCRIPTION</p>
          )}
        </>
      ) : (
        <p className={styles.empty}>STANDBY — hover or lock a skill</p>
      )}
    </div>
  );
}
