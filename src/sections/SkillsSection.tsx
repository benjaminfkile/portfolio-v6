import type { SectionProps } from './types';
import type { SkillsItem } from '../types/content';
import SectionShell from '../components/ui/SectionShell';
import Meter from '../components/ui/Meter';
import styles from './SkillsSection.module.css';

/**
 * The `skills` section (spec §3.4, DESIGN.md §5) — a grid of rows, each an
 * icon + name + a {@link Meter} at the item's proficiency percent. The grid is
 * one column on phones and two from 900px up (§5). Each item is a
 * `{ title, description, icon_source, proficiency }`; the icon renders as an
 * `<img>` whose alt is the skill title, and the proficiency (a 0–100 scale) is
 * the Meter fill, which animates in once on first view (§6). Optional group
 * labels (eyebrow / intro) render in the shared {@link SectionShell} — the
 * eyebrow in mono per §5.
 */
interface SkillsData {
  title?: string;
  eyebrow?: string;
  intro?: string;
}

export default function SkillsSection({ section }: SectionProps) {
  const data = section.data as SkillsData;

  return (
    <SectionShell
      title={data.title ?? 'Skills'}
      eyebrow={data.eyebrow}
      intro={data.intro}
      className={styles.skills}
    >
      <ul className={styles.list}>
        {section.items.map((item) => {
          const skill = item.data as SkillsItem;
          return (
            <li key={item.id} className={styles.skill}>
              <div className={styles.head}>
                {skill.icon_source && (
                  <img
                    className={styles.icon}
                    src={skill.icon_source}
                    alt={skill.title}
                  />
                )}
                <span className={styles.name}>{skill.title}</span>
              </div>
              <Meter
                value={skill.proficiency}
                label={`${skill.title} proficiency`}
                showValue
              />
            </li>
          );
        })}
      </ul>
    </SectionShell>
  );
}
