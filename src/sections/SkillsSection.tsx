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
import { useIsDesktop } from '../lib/useIsDesktop';
import styles from './SkillsSection.module.css';

/**
 * The `skills` section (spec §3.4, DESIGN.md §5) — the Skills Console (v1.9): a
 * three-panel Control Room instrument. A skill LIST on the left, the geodesic
 * {@link SkillSphere} in the centre, and a DETAIL panel on the right.
 *
 * DESKTOP (≥900px): the list is the driver. Hovering / focusing a list row
 * PREVIEWS that skill — the sphere rotates its tile front-and-centre and holds
 * it while previewed, and the detail panel shows its description. On
 * mouse-leave / blur the sphere resumes free rotation and the detail panel
 * returns to STANDBY. No click anywhere latches a persistent selection — desktop
 * is hover-preview only.
 *
 * MOBILE (<900px): the list is hidden and the sphere is the only selector. Tap
 * a tile to LOCK it (the description survives moving on), tap again to unlock.
 * A locked skill must never dead-end navigation: a drag on the sphere while
 * locked releases the rotation hold without clearing the lock (that release
 * lives in {@link SkillSphereCanvas}). Every preview change and lock toggle
 * fires one short amber packet across the connective bus (≥900px, never
 * looping).
 *
 * At ≥900px the three panels are a CSS grid stretched to EQUAL HEIGHT (the
 * sphere drives the row); below 900px they stack sphere → detail.
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
  // Selection/lock is a mobile-only concept — the sphere is the only selector
  // there, so a tap must latch. Desktop uses hover-preview only (Ben, 2026-08-18);
  // matchMedia keys off the same 900px threshold as the CSS layout so JS and
  // CSS never disagree about which mode is live.
  const isDesktop = useIsDesktop();

  // PREVIEW is transient (hover/focus). LOCK (mobile only) survives leave. The
  // focus target the sphere rotates to, and the skill the detail panel reads,
  // is the preview if any, else the lock (mobile only).
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [lockedId, setLockedId] = useState<string | null>(null);
  // Bumped on every preview-target change and lock toggle; the bus remounts its
  // packet off this so each pulse restarts cleanly with no queue buildup.
  const [pulse, setPulse] = useState(0);

  // Desktop never latches: even if a stale lock lingers in state (e.g. from a
  // resize past the breakpoint), ignore it while `isDesktop` is true so the
  // detail pane truly returns to its resting state on unhover.
  const activeLockedId = isDesktop ? null : lockedId;
  const focusId = previewId ?? activeLockedId;
  const activeSkill = useMemo(
    () => skills.find((s) => s.id === focusId) ?? null,
    [skills, focusId],
  );

  const handlePreview = useCallback(
    (id: string | null) => {
      if (id === previewId) return;
      // Pulse only when the *focus target* actually moves (a bare mouse-out that
      // reveals the same locked skill is not a new target).
      const oldTarget = previewId ?? activeLockedId;
      const newTarget = id ?? activeLockedId;
      if (oldTarget !== newTarget) setPulse((n) => n + 1);
      setPreviewId(id);
    },
    [previewId, activeLockedId],
  );

  const handleLock = useCallback((id: string) => {
    // One lock at a time: locking another moves the lock, tapping the locked
    // one unlocks. Every toggle pulses the bus. Only reachable on mobile — on
    // desktop `onLock` is not wired through to any surface.
    setLockedId((prev) => (prev === id ? null : id));
    setPulse((n) => n + 1);
  }, []);

  // Only pass the lock handler through on mobile. Desktop must not have any
  // path (list row OR sphere tile) that latches a persistent selection.
  const onSphereLock = isDesktop ? undefined : handleLock;

  return (
    <SectionShell
      title={data.heading}
      intro={data.intro}
      className={styles.skills}
    >
      <div className={styles.console}>
        <SkillBus pulseKey={pulse} reduced={reduced} />

        {/* Left panel — the skill list. A --panel instrument surface (§4); the
            inner scroll region keeps equal height without expanding the row.
            Desktop-only (mobile hides via CSS); rows preview on hover/focus,
            release on leave/blur, and never latch. */}
        <div className={`${styles.cell} ${styles.listPanel}`}>
          <div className={styles.scroll}>
            <SkillList
              skills={skills}
              focusId={focusId}
              onPreview={handlePreview}
            />
          </div>
        </div>

        {/* Centre panel — the sphere. It draws its own bordered card and drives
            the row height. `onLock` is undefined on desktop (hover-preview
            only); on mobile it stays wired so tapping a tile latches. */}
        <div className={styles.spherePanel}>
          <SkillSphere
            skills={skills}
            detail={data.sphere_detail}
            focusSkillId={focusId}
            lockedId={activeLockedId}
            onPreview={handlePreview}
            onLock={onSphereLock}
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
