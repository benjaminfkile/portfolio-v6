import { lazy, Suspense, useMemo } from 'react';
import SkillIcon from './SkillIcon';
import styles from './SkillSphere.module.css';

// The theme-aware icon resolver now lives with the shared {@link SkillIcon}
// component (Skill Refs v1.8) so the sphere and the portfolio share one source
// of truth; re-exported here for the WebGL texture pipeline and existing callers.
export { resolveSkillIconUrl } from './SkillIcon';

/**
 * One skill placed on the sphere: an id, its title, and the icon URL(s).
 * `icon_source` is the default (light-theme) URL; `icon_source_dark` is an
 * optional dark-theme override (Icons v1.6) resolved per theme by
 * {@link resolveSkillIconUrl}.
 */
export interface SkillSphereSkill {
  id: string;
  title: string;
  icon_source: string;
  icon_source_dark?: string;
}

export interface SkillSphereProps {
  skills: SkillSphereSkill[];
  /**
   * three.js `IcosahedronGeometry` detail (0–4). When omitted the renderer
   * auto-picks the smallest detail whose face count covers the skills via
   * {@link pickDetail}.
   */
  detail?: number;
  /**
   * Skills Console v1.9: the skill to rotate front-and-centre and hold (the
   * previewed skill, else the locked one). On the WebGL path it drives the
   * rotate-to-target slerp; on the chip fallback it highlights the matching
   * chip. `null` resumes auto-spin / clears the highlight.
   */
  focusSkillId?: string | null;
  /** The locked skill id — reflected as `aria-pressed` on the fallback chips. */
  lockedId?: string | null;
  /** Hover/focus of a tile or chip previews that skill; leaving clears it. */
  onPreview?: (id: string | null) => void;
  /** Click of a tile or chip toggles that skill's lock. */
  onLock?: (id: string) => void;
}

/**
 * pickDetail — the AUTO sphere density. Returns the smallest icosahedron detail
 * `d` in `0..4` whose face count `20·(d+1)²` is at least `count`, clamped to 4.
 *
 * Face counts by detail: 0→20, 1→80, 2→180, 3→320, 4→500. So 20 skills fit on
 * detail 0, 21 need detail 1, 180 sits exactly on detail 2's boundary, and any
 * count above 500 is clamped to 4 (a skill sphere never needs more).
 */
export function pickDetail(count: number): number {
  for (let d = 0; d <= 4; d += 1) {
    if (20 * (d + 1) * (d + 1) >= count) return d;
  }
  return 4;
}

/**
 * Whether this environment can create a WebGL context. jsdom (the test path)
 * and browsers without WebGL both fail here, sending us down the chip fallback
 * so the three.js canvas is never mounted. Wrapped in try/catch because context
 * creation can throw, not just return null.
 */
function webglAvailable(): boolean {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return false;
  }
  try {
    if (typeof window.WebGLRenderingContext === 'undefined') return false;
    const canvas = document.createElement('canvas');
    const gl =
      canvas.getContext('webgl') ??
      canvas.getContext('experimental-webgl');
    return gl != null;
  } catch {
    return false;
  }
}

/**
 * The chip grid — icon + name per skill. Doubles as the WebGL-unavailable
 * fallback and the Suspense placeholder while the three.js chunk loads. Pure
 * DOM: it imports no three.js, so the fallback path keeps that payload out of
 * the bundle entirely.
 *
 * When the console wires interactions (Skills Console v1.9), each chip is a
 * button: hover/focus previews the skill, click toggles its lock, and the
 * focused (previewed/locked) chip gets the highlighted state — so the fallback
 * keeps the list/detail flow working with no rotation. Absent handlers (the
 * bare Suspense placeholder) render inert chips.
 */
function Chips({
  skills,
  focusSkillId,
  lockedId,
  onPreview,
  onLock,
}: {
  skills: SkillSphereSkill[];
  focusSkillId?: string | null;
  lockedId?: string | null;
  onPreview?: (id: string | null) => void;
  onLock?: (id: string) => void;
}) {
  const interactive = Boolean(onPreview || onLock);
  return (
    <ul className={styles.chips}>
      {skills.map((skill) => {
        const active = skill.id === focusSkillId;
        const locked = skill.id === lockedId;
        const className = [
          styles.chip,
          interactive && styles.chipButton,
          active && styles.chipActive,
        ]
          .filter(Boolean)
          .join(' ');
        if (!interactive) {
          return (
            <li key={skill.id} className={styles.chip}>
              <ChipIcon skill={skill} />
              <span>{skill.title}</span>
            </li>
          );
        }
        return (
          <li key={skill.id}>
            <button
              type="button"
              className={className}
              aria-pressed={locked}
              onMouseEnter={() => onPreview?.(skill.id)}
              onMouseLeave={() => onPreview?.(null)}
              onFocus={() => onPreview?.(skill.id)}
              onBlur={() => onPreview?.(null)}
              onClick={() => onLock?.(skill.id)}
            >
              <ChipIcon skill={skill} />
              <span>{skill.title}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * A chip's icon — the shared theme-aware {@link SkillIcon} (Skill Refs v1.8),
 * decorative here (`alt=""`) because the chip's own `<span>` carries the name.
 * Its dual-img CSS swap follows a live theme toggle with no JS listener, so the
 * fallback path costs nothing on the WebGL path it stands in for.
 */
function ChipIcon({ skill }: { skill: SkillSphereSkill }) {
  return <SkillIcon skill={skill} alt="" />;
}

// Lazily loaded so the three.js payload is code-split out of the entry chunk
// (task DONE: three code-split out of the entry chunk). The import specifier is
// a plain relative path so Vite/Rollup gives it its own async chunk.
const SkillSphereCanvas = lazy(() => import('./SkillSphereCanvas'));

/**
 * SkillSphere — a geodesic wireframe sphere (three.js `IcosahedronGeometry`)
 * with one skill icon lying flat on a face, edge lines in the plotting-grid
 * colour on the
 * dark panel (DESIGN.md §2, §5). Auto-rotates slowly, pointer-drag spins it,
 * and it honours `prefers-reduced-motion` and pauses off-screen.
 *
 * When WebGL is unavailable — older browsers, and the jsdom test path — it
 * degrades to a plain chip grid instead of the canvas. Either way a
 * visually-hidden list of skill titles is rendered for assistive tech, and the
 * canvas itself is `aria-hidden` (Chart rules, §7). three.js is loaded lazily,
 * so the fallback path never pulls it in.
 */
export default function SkillSphere({
  skills,
  detail,
  focusSkillId = null,
  lockedId = null,
  onPreview,
  onLock,
}: SkillSphereProps) {
  const resolvedDetail = detail ?? pickDetail(skills.length);
  // Decided once at mount — the context probe is cheap but not free, and the
  // answer does not change over the component's life.
  const canUseWebGL = useMemo(() => webglAvailable(), []);

  if (!canUseWebGL || skills.length === 0) {
    return (
      <div className={styles.root}>
        <Chips
          skills={skills}
          focusSkillId={focusSkillId}
          lockedId={lockedId}
          onPreview={onPreview}
          onLock={onLock}
        />
      </div>
    );
  }

  return (
    <div className={styles.root}>
      {/* The Suspense placeholder is the inert chip grid (no handlers) — three
          is still loading, so there is nothing to preview yet. */}
      <Suspense fallback={<Chips skills={skills} />}>
        <SkillSphereCanvas
          skills={skills}
          detail={resolvedDetail}
          focusSkillId={focusSkillId}
          onPreview={onPreview}
          onLock={onLock}
        />
      </Suspense>
      {/* Screen-reader equivalent of the decorative canvas (§7). */}
      <ul className={styles.srOnly}>
        {skills.map((skill) => (
          <li key={skill.id}>{skill.title}</li>
        ))}
      </ul>
    </div>
  );
}
