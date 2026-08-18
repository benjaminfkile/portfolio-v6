import SkillIcon from './SkillIcon';
import type { SkillSphereSkill } from './SkillSphere';
import styles from './SkillList.module.css';

/** A skill as the console panels consume it — the sphere fields plus the
 *  `description` the detail panel reads (Skills Console v1.9). */
export interface ConsoleSkill extends SkillSphereSkill {
  description: string;
}

export interface SkillListProps {
  skills: ConsoleSkill[];
  /** The current focus target (the previewed skill) — the row that reads active. */
  focusId: string | null;
  /** Hover/focus previews a skill (`id`); leaving/blur clears it (`null`). */
  onPreview: (id: string | null) => void;
}

/**
 * SkillList — the console's left panel (Skills Console v1.9, DESIGN.md §5).
 * Desktop-only (mobile hides the whole panel via CSS): one instrument-styled
 * row per skill, in section item order. Hover / keyboard focus PREVIEWS the
 * skill (the sphere rotates it front-and-centre, the detail panel shows it);
 * mouse-leave / blur clears the preview and returns the console to STANDBY.
 *
 * No click-to-latch on desktop — hovering is the only interaction, and
 * keyboard focus is the a11y peer of hover (Ben, 2026-08-18). The list still
 * scrolls inside the console's shared height (`overflow-y: auto`, set by the
 * section).
 */
export default function SkillList({
  skills,
  focusId,
  onPreview,
}: SkillListProps) {
  return (
    <ul className={styles.list} aria-label="Skills">
      {skills.map((skill) => {
        const active = skill.id === focusId;
        const className = [styles.item, active && styles.active]
          .filter(Boolean)
          .join(' ');
        return (
          <li key={skill.id}>
            <button
              type="button"
              className={className}
              onMouseEnter={() => onPreview(skill.id)}
              onMouseLeave={() => onPreview(null)}
              onFocus={() => onPreview(skill.id)}
              onBlur={() => onPreview(null)}
            >
              <SkillIcon skill={skill} alt="" className={styles.icon} />
              <span className={styles.title}>{skill.title}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
