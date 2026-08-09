import SkillIcon from './SkillIcon';
import StatusDot from './StatusDot';
import type { SkillSphereSkill } from './SkillSphere';
import styles from './SkillList.module.css';

/** A skill as the console panels consume it — the sphere fields plus the
 *  `description` the detail panel reads (Skills Console v1.9). */
export interface ConsoleSkill extends SkillSphereSkill {
  description: string;
}

export interface SkillListProps {
  skills: ConsoleSkill[];
  /** The locked skill id, if any — rendered as a latched (`aria-pressed`) row. */
  lockedId: string | null;
  /** The current focus target (preview else lock) — the row that reads active. */
  focusId: string | null;
  /** Hover/focus previews a skill (`id`); leaving clears it (`null`). */
  onPreview: (id: string | null) => void;
  /** Click / Enter / Space toggles a skill's lock. */
  onLock: (id: string) => void;
}

/**
 * SkillList — the console's left panel (Skills Console v1.9, DESIGN.md §5). One
 * instrument-styled button per skill, in section item order. Hover/focus PREVIEWS
 * the skill (the sphere rotates it front-and-centre, the detail panel shows it);
 * click/Enter/Space LOCKS it (checkable latch, `aria-pressed`) so its description
 * can be scrolled off-hover. Exactly one skill locks at a time — the parent owns
 * that rule; a locked row wears an amber `StatusDot` latch. The list scrolls
 * inside the console's shared height (`overflow-y: auto`, set by the section).
 */
export default function SkillList({
  skills,
  lockedId,
  focusId,
  onPreview,
  onLock,
}: SkillListProps) {
  return (
    <ul className={styles.list} aria-label="Skills">
      {skills.map((skill) => {
        const locked = skill.id === lockedId;
        const active = skill.id === focusId;
        const className = [styles.item, active && styles.active]
          .filter(Boolean)
          .join(' ');
        return (
          <li key={skill.id}>
            <button
              type="button"
              className={className}
              aria-pressed={locked}
              onMouseEnter={() => onPreview(skill.id)}
              onMouseLeave={() => onPreview(null)}
              onFocus={() => onPreview(skill.id)}
              onBlur={() => onPreview(null)}
              onClick={() => onLock(skill.id)}
            >
              <SkillIcon skill={skill} alt="" className={styles.icon} />
              <span className={styles.title}>{skill.title}</span>
              {/* The latch: an amber dot that persists off-hover so the locked
                  row stays legible as engaged. Decorative — `aria-pressed`
                  already carries the state to assistive tech. */}
              {locked && <StatusDot variant="warn" className={styles.latch} />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
