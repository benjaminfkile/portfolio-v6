import { useCallback, useMemo, useState } from 'react';
import type { SectionProps } from './types';
import type { SkillsItem } from '../types/content';
import SectionShell from '../components/ui/SectionShell';
import SkillSphere from '../components/ui/SkillSphere';
import SkillList from '../components/ui/SkillList';
import type { ConsoleSkill } from '../components/ui/SkillList';
import SkillDetail from '../components/ui/SkillDetail';
import SkillBus from '../components/ui/SkillBus';
import { usePrefersReducedMotion } from '../lib/prefersReducedMotion';
import styles from './SkillsSection.module.css';

/**
 * The `skills` section (spec §3.4, DESIGN.md §5) — the Skills Console (v1.9): a
 * three-panel Control Room instrument. A skill LIST on the left, the geodesic
 * {@link SkillSphere} in the centre, and a DETAIL panel on the right. Hovering /
 * focusing a list entry (or a sphere tile) PREVIEWS that skill — the sphere
 * rotates its tile front-and-centre and holds it while previewed, and the detail
 * panel shows its description. Clicking LOCKS a skill (exactly one at a time), so
 * a long description survives mouse-out and can be scrolled. A thin connective
 * bus links the three panels; every preview change and lock toggle fires one
 * short amber packet across it (≥900px, never looping). At ≥900px the three
 * panels are a CSS grid stretched to EQUAL HEIGHT (the sphere drives the row);
 * below 900px they stack sphere → list → detail.
 *
 * Each item is a `{ title, description, icon_source, icon_source_dark? }`. The
 * optional `sphere_detail` config (0–4) sets the icosahedron density; when absent
 * the sphere auto-fits to the item count.
 */
interface SkillsData {
  heading?: string;
  intro?: string;
  /** three.js `IcosahedronGeometry` detail (0–4); absent = auto-fit (§3.4, v1.5). */
  sphere_detail?: number;
}

export default function SkillsSection({ section }: SectionProps) {
  const data = section.data as SkillsData;

  // Memoized so the array identity is stable across preview/lock re-renders —
  // the sphere's rotate-to-target effect keys off it, and a fresh array each
  // render would restart the slerp every frame.
  const skills: ConsoleSkill[] = useMemo(
    () =>
      section.items.map((item) => {
        const skill = item.data as SkillsItem;
        return {
          id: item.id,
          title: skill.title,
          description: skill.description,
          icon_source: skill.icon_source,
          // Optional dark-theme override (Icons v1.6); undefined falls back to
          // icon_source in every renderer.
          icon_source_dark: skill.icon_source_dark,
        };
      }),
    [section.items],
  );

  const reduced = usePrefersReducedMotion();

  // PREVIEW is transient (hover/focus); LOCK survives mouse-out. The focus
  // target the sphere rotates to, and the skill the detail panel reads, is the
  // preview if any, else the lock.
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [lockedId, setLockedId] = useState<string | null>(null);
  // Bumped on every preview-target change and lock toggle; the bus remounts its
  // packet off this so each pulse restarts cleanly with no queue buildup.
  const [pulse, setPulse] = useState(0);

  const focusId = previewId ?? lockedId;
  const activeSkill = useMemo(
    () => skills.find((s) => s.id === focusId) ?? null,
    [skills, focusId],
  );

  const handlePreview = useCallback(
    (id: string | null) => {
      if (id === previewId) return;
      // Pulse only when the *focus target* actually moves (a bare mouse-out that
      // reveals the same locked skill is not a new target).
      const oldTarget = previewId ?? lockedId;
      const newTarget = id ?? lockedId;
      if (oldTarget !== newTarget) setPulse((n) => n + 1);
      setPreviewId(id);
    },
    [previewId, lockedId],
  );

  const handleLock = useCallback((id: string) => {
    // One lock at a time: locking another moves the lock, clicking the locked
    // one unlocks. Every toggle pulses the bus.
    setLockedId((prev) => (prev === id ? null : id));
    setPulse((n) => n + 1);
  }, []);

  return (
    <SectionShell
      title={data.heading}
      intro={data.intro}
      className={styles.skills}
    >
      <div className={styles.console}>
        <SkillBus pulseKey={pulse} reduced={reduced} />

        {/* Left panel — the skill list. A --panel instrument surface (§4); the
            inner scroll region keeps equal height without expanding the row. */}
        <div className={`${styles.cell} ${styles.listPanel}`}>
          <div className={styles.scroll}>
            <SkillList
              skills={skills}
              lockedId={lockedId}
              focusId={focusId}
              onPreview={handlePreview}
              onLock={handleLock}
            />
          </div>
        </div>

        {/* Centre panel — the sphere. It draws its own bordered card and drives
            the row height. */}
        <div className={styles.spherePanel}>
          <SkillSphere
            skills={skills}
            detail={data.sphere_detail}
            focusSkillId={focusId}
            lockedId={lockedId}
            onPreview={handlePreview}
            onLock={handleLock}
          />
        </div>

        {/* Right panel — the detail readout; its root is the scroll region so
            keyboard focus and scrolling coincide for a locked skill. */}
        <div className={`${styles.cell} ${styles.detailPanel}`}>
          <SkillDetail skill={activeSkill} className={styles.scroll} />
        </div>
      </div>
    </SectionShell>
  );
}
