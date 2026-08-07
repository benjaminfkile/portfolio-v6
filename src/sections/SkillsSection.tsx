import type { SectionProps } from './types';
import type { SkillsItem } from '../types/content';
import SectionShell from '../components/ui/SectionShell';
import SkillSphere from '../components/ui/SkillSphere';
import type { SkillSphereSkill } from '../components/ui/SkillSphere';
import styles from './SkillsSection.module.css';

/**
 * The `skills` section (spec §3.4, DESIGN.md §5) — a 3D geodesic sphere
 * ({@link SkillSphere}) with one skill icon per face, on a Control Room panel
 * surface. Each item is a `{ title, description, icon_source }` (the v5 skill
 * rating was dropped in v1.5). The optional `sphere_detail` config (0–4) sets the
 * icosahedron density; when absent the sphere auto-fits to the item count.
 * Optional group labels (eyebrow / intro) render in the shared
 * {@link SectionShell} — the eyebrow in mono per §5.
 */
interface SkillsData {
  heading?: string;
  intro?: string;
  /** three.js `IcosahedronGeometry` detail (0–4); absent = auto-fit (§3.4, v1.5). */
  sphere_detail?: number;
}

export default function SkillsSection({ section }: SectionProps) {
  const data = section.data as SkillsData;

  const skills: SkillSphereSkill[] = section.items.map((item) => {
    const skill = item.data as SkillsItem;
    return { id: item.id, title: skill.title, icon_source: skill.icon_source };
  });

  return (
    <SectionShell
      title={data.heading ?? 'Skills'}
      intro={data.intro}
      className={styles.skills}
    >
      <div className={styles.stage}>
        <SkillSphere skills={skills} detail={data.sphere_detail} />
      </div>
    </SectionShell>
  );
}
