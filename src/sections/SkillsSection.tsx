import type { SectionProps } from './types';
import type { SkillsItem } from '../types/content';
import styles from './SkillsSection.module.css';

/**
 * A list of skills, each with a proficiency (spec §3.4). Proficiency renders as
 * a native `<meter>` — semantic, and it keeps the "progress width" out of an
 * inline style. Values are treated as a 0–100 scale; `<meter>` clamps anything
 * out of range.
 */
interface SkillsData {
  title?: string;
}

const PROFICIENCY_MAX = 100;

export default function SkillsSection({ section }: SectionProps) {
  const data = section.data as SkillsData;

  return (
    <section className={styles.skills}>
      {data.title && <h2 className={styles.title}>{data.title}</h2>}
      <ul className={styles.list}>
        {section.items.map((item) => {
          const skill = item.data as SkillsItem;
          return (
            <li key={item.id} className={styles.skill}>
              <div className={styles.heading}>
                {skill.icon_source && (
                  <img className={styles.icon} src={skill.icon_source} alt="" />
                )}
                <h3 className={styles.skillTitle}>{skill.title}</h3>
              </div>
              {skill.description && (
                <p className={styles.description}>{skill.description}</p>
              )}
              <meter
                className={styles.meter}
                min={0}
                max={PROFICIENCY_MAX}
                value={skill.proficiency}
                aria-label={`${skill.title} proficiency`}
              >
                {skill.proficiency} / {PROFICIENCY_MAX}
              </meter>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
