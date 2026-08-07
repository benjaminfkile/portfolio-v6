import { lazy, Suspense, useMemo } from 'react';
import styles from './SkillSphere.module.css';

/** One skill placed on the sphere: an id, its title, and the icon URL. */
export interface SkillSphereSkill {
  id: string;
  title: string;
  icon_source: string;
}

export interface SkillSphereProps {
  skills: SkillSphereSkill[];
  /**
   * three.js `IcosahedronGeometry` detail (0–4). When omitted the renderer
   * auto-picks the smallest detail whose face count covers the skills via
   * {@link pickDetail}.
   */
  detail?: number;
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
 */
function Chips({ skills }: { skills: SkillSphereSkill[] }) {
  return (
    <ul className={styles.chips}>
      {skills.map((skill) => (
        <li key={skill.id} className={styles.chip}>
          {skill.icon_source && (
            <img
              className={styles.chipIcon}
              src={skill.icon_source}
              alt=""
              aria-hidden="true"
            />
          )}
          <span>{skill.title}</span>
        </li>
      ))}
    </ul>
  );
}

// Lazily loaded so the three.js payload is code-split out of the entry chunk
// (task DONE: three code-split out of the entry chunk). The import specifier is
// a plain relative path so Vite/Rollup gives it its own async chunk.
const SkillSphereCanvas = lazy(() => import('./SkillSphereCanvas'));

/**
 * SkillSphere — a geodesic wireframe sphere (three.js `IcosahedronGeometry`)
 * with one skill icon lying flat on a face, in the Control Room amber on the
 * dark panel (DESIGN.md §2, §5). Auto-rotates slowly, pointer-drag spins it,
 * and it honours `prefers-reduced-motion` and pauses off-screen.
 *
 * When WebGL is unavailable — older browsers, and the jsdom test path — it
 * degrades to a plain chip grid instead of the canvas. Either way a
 * visually-hidden list of skill titles is rendered for assistive tech, and the
 * canvas itself is `aria-hidden` (Chart rules, §7). three.js is loaded lazily,
 * so the fallback path never pulls it in.
 */
export default function SkillSphere({ skills, detail }: SkillSphereProps) {
  const resolvedDetail = detail ?? pickDetail(skills.length);
  // Decided once at mount — the context probe is cheap but not free, and the
  // answer does not change over the component's life.
  const canUseWebGL = useMemo(() => webglAvailable(), []);

  if (!canUseWebGL || skills.length === 0) {
    return (
      <div className={styles.root}>
        <Chips skills={skills} />
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <Suspense fallback={<Chips skills={skills} />}>
        <SkillSphereCanvas skills={skills} detail={resolvedDetail} />
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
