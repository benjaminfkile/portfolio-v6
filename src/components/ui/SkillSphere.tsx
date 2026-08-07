import { lazy, Suspense, useMemo } from 'react';
import styles from './SkillSphere.module.css';

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

/**
 * The effective icon URL for a skill under the current theme (Icons v1.6). Dark
 * theme prefers `icon_source_dark` and falls back to `icon_source` when it is
 * absent; light theme always uses `icon_source`. Both the WebGL texture
 * pipeline (via the scene's `lightTheme` token) and any JS-driven path resolve
 * through here so the two never diverge.
 */
export function resolveSkillIconUrl(
  skill: Pick<SkillSphereSkill, 'icon_source' | 'icon_source_dark'>,
  lightTheme: boolean,
): string {
  if (lightTheme) return skill.icon_source;
  return skill.icon_source_dark ?? skill.icon_source;
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
          <ChipIcon skill={skill} />
          <span>{skill.title}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * A chip's icon. When a skill carries a dark-theme override (Icons v1.6) we
 * render BOTH `<img>`s and swap them with CSS only — the dark variant shows by
 * default (dark is the native theme, incl. before `data-theme` is stamped) and
 * is hidden under `:root[data-theme='light']`, where the light variant shows.
 * The fallback path stays JS-listener-free so it costs nothing on the WebGL
 * path it stands in for. A single-URL skill renders one img, as before.
 */
function ChipIcon({ skill }: { skill: SkillSphereSkill }) {
  if (!skill.icon_source) return null;
  if (skill.icon_source_dark) {
    return (
      <>
        <img
          className={`${styles.chipIcon} ${styles.chipIconLight}`}
          src={skill.icon_source}
          alt=""
          aria-hidden="true"
        />
        <img
          className={`${styles.chipIcon} ${styles.chipIconDark}`}
          src={skill.icon_source_dark}
          alt=""
          aria-hidden="true"
        />
      </>
    );
  }
  return (
    <img
      className={styles.chipIcon}
      src={skill.icon_source}
      alt=""
      aria-hidden="true"
    />
  );
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
