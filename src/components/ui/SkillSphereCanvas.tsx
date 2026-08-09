import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { usePrefersReducedMotion } from '../../lib/prefersReducedMotion';
import styles from './SkillSphere.module.css';
import { resolveSkillIconUrl } from './SkillSphere';
import type { SkillSphereSkill } from './SkillSphere';

/** Shared, mutable drag/rotation state — mutated by DOM handlers and read in
 *  the render loop without re-rendering React on every pointer move. */
interface DragState {
  /** Accumulated orientation. Screen-space increments are premultiplied in, so
   *  the drag is a free trackball — no per-axis clamps, infinite tumble. */
  quat: THREE.Quaternion;
  dragging: boolean;
  lastX: number;
  lastY: number;
}

/* Scratch objects for the per-frame math (drag increments, tile realignment).
   Module-shared is safe: the frame loop and DOM handlers are single-threaded
   and every use fully overwrites them. */
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
/** The direction a face normal must point to sit dead-centre facing the camera.
 *  The camera looks down -Z from (0,0,3), so a tile faces it when its outward
 *  normal is +Z. {@link faceTargetQuaternion} rotates a normal onto this. */
const CAMERA_FORWARD = new THREE.Vector3(0, 0, 1);
/** Rotate-to-target duration (seconds) — the slerp that swings a hovered/locked
 *  skill's tile front-and-centre (task: ~500–700ms, eased). */
const FOCUS_DURATION = 0.6;
const TMP_STEP_Q = new THREE.Quaternion();
const TMP_PARENT_Q = new THREE.Quaternion();
const TMP_WORLD_N = new THREE.Vector3();
const TMP_REF = new THREE.Vector3();
const TMP_X = new THREE.Vector3();
const TMP_Y = new THREE.Vector3();
const TMP_BASIS = new THREE.Matrix4();
const TMP_Q = new THREE.Quaternion();

interface CanvasProps {
  skills: SkillSphereSkill[];
  detail: number;
  /** Skills Console v1.9: the skill whose tile should rotate front-and-centre
   *  and hold there (the previewed skill, else the locked one). `null`/absent
   *  resumes the normal auto-spin from the current orientation. */
  focusSkillId?: string | null;
  /** Clicking a tile toggles that skill's lock — synced with the list + detail. */
  onLock?: (id: string) => void;
}

/**
 * faceTargetQuaternion — the group orientation that swings a tile's outward
 * `normal` to face the camera (+Z), dead-centre. Pure and module-level so the
 * rotate-to-target math is unit-testable in jsdom without a WebGL context
 * (the `facePlacements`/`pickDetail` export pattern). The minimal rotation
 * carrying `normal` onto `+Z`; three.js resolves the antiparallel (normal ≈ -Z)
 * case by picking an arbitrary orthogonal axis, so it never returns NaN.
 */
export function faceTargetQuaternion(
  normal: [number, number, number],
): THREE.Quaternion {
  const n = new THREE.Vector3(normal[0], normal[1], normal[2]).normalize();
  return new THREE.Quaternion().setFromUnitVectors(n, CAMERA_FORWARD);
}

/** Cubic ease-in-out for the rotate-to-target slerp — matches the instrument
 *  motion voice (settle, don't linear-ramp). */
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

type SceneTokens = ReturnType<typeof readSceneTokens>;

/** Read a design token off :root, falling back to its DESIGN.md §2.1 value so
 *  the scene never hardcodes a fresh colour. */
function cssToken(name: string, fallback: string): string {
  if (typeof window === 'undefined' || typeof getComputedStyle !== 'function') {
    return fallback;
  }
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

/** Split a CSS `rgba()` token into a three.js-parseable `rgb()` colour and its
 *  alpha (as material opacity — THREE.Color has no alpha channel and warns on
 *  rgba strings). Hex/named colours pass through with alpha 1. */
function parseRgba(value: string): { color: string; alpha: number } {
  const m = value.match(/rgba?\(([^)]+)\)/);
  if (!m) return { color: value, alpha: 1 };
  const parts = m[1].split(',').map((p) => p.trim());
  const alpha = parts.length > 3 ? Number(parts[3]) : 1;
  return {
    color: `rgb(${parts[0]}, ${parts[1]}, ${parts[2]})`,
    alpha: Number.isFinite(alpha) ? alpha : 1,
  };
}

/** The canvas-side token values. Everything CSS-rendered (tooltip, chips)
 *  follows the theme by itself via var(); only what is baked into WebGL
 *  materials and rasterized textures needs to be read — and re-read. */
function readSceneTokens() {
  const panel = cssToken('--panel-2', '#171c28');
  const c = new THREE.Color(panel);
  return {
    /** letter-fallback glyph colour */
    amber: cssToken('--amber', '#e8a33d'),
    /** the shared albedo: sphere faces AND icon backing discs — one material
     *  colour under one light rig, so the discs vanish into their faces */
    panel,
    /** wireframe edges — the same colour as the page's plotting grid (§2.4) */
    grid: parseRgba(cssToken('--grid', 'rgba(120, 140, 175, 0.07)')),
    /** relative luminance of the albedo — the light rig's exposure is tuned
     *  per theme (a near-white albedo clamps where a near-black one starves) */
    lightTheme: 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b > 0.5,
  };
}

/**
 * Token values that follow the theme. `ThemeToggle` stamps `data-theme` on
 * `<html>`; a MutationObserver on that attribute re-reads the tokens so the
 * sphere restyles live on toggle instead of keeping mount-time colours.
 * Downstream, material props update declaratively and the texture-rasterize
 * effects re-run off the changed values.
 */
function useSceneTokens() {
  const [tokens, setTokens] = useState(readSceneTokens);
  useEffect(() => {
    if (typeof MutationObserver === 'undefined') return;
    const observer = new MutationObserver(() => setTokens(readSceneTokens()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);
  return tokens;
}

/** Fixed power-of-two texture size. Icons are rasterized at this size so a
 *  size-less SVG (devicon icons carry a `viewBox` but no width/height) still
 *  uploads a real, non-empty texture to the GPU. */
export const TEX_SIZE = 128;

/**
 * Fill the whole texture square with the face albedo — the glyph's ground,
 * the SAME colour as the sphere faces (rendered by the same lit material), so
 * the tile disappears into its facet. The texture is fully opaque
 * edge-to-edge ON PURPOSE: any alpha edge in the texture gets bilinear-mixed
 * with transparent-black texels (a 2D canvas stores premultiplied, so
 * transparent texels are irrecoverably black) and renders as a dark ring
 * around the icon. The circular shape comes from the tile's CircleGeometry
 * instead — a geometry edge, MSAA'd against the identically-coloured facet.
 * Shared by the icon and the letter-fallback pipelines.
 */
function fillGround(
  ctx: CanvasRenderingContext2D,
  size: number,
  fill: string,
): void {
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, size, size);
}

/** Wrap a finished 2D canvas as a tile texture: sRGB working space so the
 *  panel/icon colours are not washed out on upload; opaque, so no alpha
 *  channel gymnastics. Mipmaps off: tiles render near 1:2 of the texture
 *  size, where plain linear minification is sharp and artifact-free. */
function canvasToTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  return tex;
}

/**
 * Rasterize an icon URL to an offscreen 2D canvas at {@link TEX_SIZE}px.
 *
 * `TextureLoader` uploads the decoded <img> straight to the GPU, and a devicon
 * SVG has a `viewBox` but no intrinsic width/height, so that upload is blank —
 * yet the load event still succeeds, so an error-only fallback never fires.
 * Here we instead draw the image with an EXPLICIT destination size
 * (`drawImage(img, dx, dy, dw, dh)`), which rasterizes size-less SVGs correctly
 * cross-browser. We never trust `naturalWidth` for the draw (Firefox reports 0
 * for these), only as an optional aspect-ratio hint for contain-fitting wide
 * wordmark icons inside the square.
 *
 * Resolves with the finished canvas (backing chip + contained icon); rejects on
 * image error, a missing 2D context, or a drawImage/zero-area failure — the
 * caller then routes through the letter-texture fallback.
 */
export function rasterizeIcon(
  url: string,
  fill: string,
): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = TEX_SIZE;
    canvas.height = TEX_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('SkillSphere: 2D canvas context unavailable'));
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        fillGround(ctx, TEX_SIZE, fill);

        // Contain-fit inside a padded square. dw/dh are always explicit so the
        // draw does not depend on the SVG's (often absent) intrinsic size.
        const pad = TEX_SIZE * 0.18;
        const box = TEX_SIZE - pad * 2;
        let dw = box;
        let dh = box;
        const iw = img.naturalWidth;
        const ih = img.naturalHeight;
        if (iw > 0 && ih > 0) {
          const ar = iw / ih;
          if (ar >= 1) {
            dh = box / ar; // wide wordmark → shorter
          } else {
            dw = box * ar; // tall glyph → narrower
          }
        }
        if (dw <= 0 || dh <= 0) {
          reject(new Error('SkillSphere: zero-area icon decode'));
          return;
        }
        const dx = (TEX_SIZE - dw) / 2;
        const dy = (TEX_SIZE - dh) / 2;
        ctx.drawImage(img, dx, dy, dw, dh);
        resolve(canvas);
      } catch (err) {
        // drawImage can throw on a zero-area/broken decode in some browsers.
        reject(err instanceof Error ? err : new Error('SkillSphere: drawImage failed'));
      }
    };
    img.onerror = () => reject(new Error(`SkillSphere: icon load failed (${url})`));
    img.src = url;
  });
}

/** A canvas-drawn initial-letter texture — the per-skill degrade path when an
 *  icon fails to load, so one broken URL never blanks the sphere or throws. It
 *  shares the disc pipeline so the letter sits on the same face-albedo ground
 *  as a real icon. */
export function letterTexture(
  title: string,
  color: string,
  fill: string,
): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = TEX_SIZE;
  canvas.height = TEX_SIZE;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    fillGround(ctx, TEX_SIZE, fill);
    ctx.fillStyle = color;
    ctx.font = `600 ${TEX_SIZE * 0.5}px 'IBM Plex Mono', ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((title.trim()[0] ?? '?').toUpperCase(), TEX_SIZE / 2, TEX_SIZE / 2);
  }
  return canvasToTexture(canvas);
}

/** A skill's face-tile anchor: where the tile sits, the outward face normal it
 *  stays glued to (its in-plane roll is applied per-frame to keep the glyph
 *  screen-upright), and how big it is (the face's incircle diameter). */
interface FacePlacement {
  position: [number, number, number];
  normal: [number, number, number];
  size: number;
}

/**
 * Face tiles for `count` skills spread evenly across the geometry's faces.
 * Each selected triangle (read off the non-indexed position attribute) yields a
 * placement lying FLAT on the face: positioned at the INCENTER nudged just
 * above the face plane (no z-fighting with the wireframe), carrying the
 * outward face normal (the tile's per-frame roll around it keeps the glyph
 * screen-upright), and sized to the triangle's incircle. Incenter, not
 * centroid: subdivided icosahedron triangles are not equilateral, so the two
 * differ — an incircle-sized disc anchored at the centroid pokes past the
 * nearest edge line, while at the incenter (the incircle's own centre, by
 * definition the deepest point of the triangle) it can never cross an edge.
 * Skills are sampled across the whole face list — `floor(i·faces/count)` — so
 * N skills on a denser sphere don't clump at one pole.
 */
function facePlacements(
  geometry: THREE.BufferGeometry,
  count: number,
): FacePlacement[] {
  const pos = geometry.getAttribute('position');
  const faces: FacePlacement[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);

    const normal = new THREE.Vector3()
      .crossVectors(b.clone().sub(a), c.clone().sub(a))
      .normalize();

    // Incircle radius r = area / semiperimeter — the largest disc that fits —
    // and the incenter, the edge-length-weighted vertex mean that centres it.
    const ea = b.distanceTo(c); // opposite A
    const eb = c.distanceTo(a); // opposite B
    const ec = a.distanceTo(b); // opposite C
    const perimeter = ea + eb + ec;
    const semi = perimeter / 2;
    const area =
      new THREE.Vector3()
        .crossVectors(b.clone().sub(a), c.clone().sub(a))
        .length() / 2;
    const inradius = semi > 0 ? area / semi : 0;
    const incenter =
      perimeter > 0
        ? new THREE.Vector3()
            .addScaledVector(a, ea / perimeter)
            .addScaledVector(b, eb / perimeter)
            .addScaledVector(c, ec / perimeter)
        : a.clone();

    // The winding should already point outward; guard against the opposite.
    if (normal.dot(incenter) < 0) normal.negate();

    const lifted = incenter.clone().addScaledVector(normal, 0.01);
    faces.push({
      position: [lifted.x, lifted.y, lifted.z],
      normal: [normal.x, normal.y, normal.z],
      size: inradius * 2 * 0.96,
    });
  }

  const n = faces.length;
  const fallback: FacePlacement = {
    position: [0, 0, 1.01],
    normal: [0, 0, 1],
    size: 0.3,
  };
  const out: FacePlacement[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push(n === 0 ? fallback : faces[Math.floor((i * n) / count) % n]);
  }
  return out;
}

/** One skill tile lying flat on its sphere face. Loads its texture
 *  cross-origin and degrades to an initial-letter texture on error — never
 *  crashing the canvas. Front-side only: a tile on the far hemisphere faces
 *  away and is culled, as on a solid object. */
function SkillFace({
  skill,
  iconUrl,
  placement,
  color,
  fill,
  onHover,
  onLock,
  invalidate,
}: {
  skill: SkillSphereSkill;
  /** The theme-resolved icon URL (Icons v1.6) — see {@link resolveSkillIconUrl}.
   *  Passed in (not read off `skill`) so a theme toggle changes this dep and
   *  re-runs the rasterize effect, swapping the texture live. */
  iconUrl: string;
  placement: FacePlacement;
  color: string;
  fill: string;
  /** Hover in/out lights the tooltip for this skill (`id`) / clears it (`null`). */
  onHover: (id: string | null) => void;
  /** Click toggles this skill's lock. */
  onLock: (id: string) => void;
  invalidate: () => void;
}) {
  const [map, setMap] = useState<THREE.Texture | null>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const normal = useMemo(
    () => new THREE.Vector3(...placement.normal),
    [placement],
  );

  // Keep the glyph readable from any sphere orientation: the tile stays glued
  // flat to its face (+Z tracks the rotating face normal) but rolls around
  // that normal so its +Y matches screen-up (the camera is axis-aligned, so
  // that is world +Y). A near-vertical world normal falls back to +Z as the
  // reference — those tiles are nearly edge-on to the camera anyway.
  useFrame(() => {
    const mesh = meshRef.current;
    const parent = mesh?.parent;
    if (!mesh || !parent) return;
    parent.getWorldQuaternion(TMP_PARENT_Q);
    TMP_WORLD_N.copy(normal).applyQuaternion(TMP_PARENT_Q);
    if (Math.abs(TMP_WORLD_N.y) > 0.99) TMP_REF.set(0, 0, 1);
    else TMP_REF.set(0, 1, 0);
    TMP_X.crossVectors(TMP_REF, TMP_WORLD_N).normalize();
    TMP_Y.crossVectors(TMP_WORLD_N, TMP_X);
    TMP_Q.setFromRotationMatrix(
      TMP_BASIS.makeBasis(TMP_X, TMP_Y, TMP_WORLD_N),
    );
    // Desired orientation is in world space; store it locally by undoing the
    // parent group's rotation.
    mesh.quaternion.copy(TMP_PARENT_Q).invert().multiply(TMP_Q);
  });

  useEffect(() => {
    let cancelled = false;
    rasterizeIcon(iconUrl, fill)
      .then((canvas) => {
        if (cancelled) return;
        setMap(canvasToTexture(canvas));
        invalidate();
      })
      .catch(() => {
        if (cancelled) return;
        setMap(letterTexture(skill.title, color, fill));
        invalidate();
      });
    return () => {
      cancelled = true;
    };
  }, [iconUrl, skill.title, color, fill, invalidate]);

  // Free the GPU texture when it is replaced or the sprite unmounts.
  useEffect(() => () => map?.dispose(), [map]);

  if (!map) return null;

  return (
    <mesh
      ref={meshRef}
      position={placement.position}
      scale={[placement.size, placement.size, 1]}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        onHover(skill.id);
      }}
      onPointerOut={() => onHover(null)}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onLock(skill.id);
      }}
    >
      {/* A circle, not a plane: the disc shape lives in GEOMETRY, and the
          texture is opaque edge-to-edge. Any texture alpha edge gets
          bilinear-mixed with transparent-black texels (2D canvases store
          premultiplied — transparent texels are irrecoverably black) and
          renders as a dark ring around the icon; a geometry rim is MSAA'd
          directly against the identically-coloured facet instead. Radius 0.5
          so the tile `size` scale is the disc diameter, as before. */}
      <circleGeometry args={[0.5, 48]} />
      {/* Lit with the SAME material params as the sphere fill so the tile's
          albedo-coloured ground renders pixel-identical to the facet under it
          — tiles vanish, icons shade with the sphere. FrontSide (the default)
          is load-bearing: it culls far-hemisphere tiles so icons never show
          through the wireframe mirrored. */}
      <meshStandardMaterial map={map} roughness={0.85} metalness={0} />
    </mesh>
  );
}

/** The rotating group: a solid icosahedron with grid-coloured edge lines plus
 *  one face tile per skill. Auto-rotates via the render loop unless
 *  reduced-motion or a drag is in progress; drag rotation is read from the
 *  shared `stateRef`. */
function Scene({
  skills,
  detail,
  tokens,
  reduced,
  stateRef,
  invalidateRef,
  focusSkillId,
  onHover,
  onLock,
}: {
  skills: SkillSphereSkill[];
  detail: number;
  tokens: SceneTokens;
  reduced: boolean;
  stateRef: React.MutableRefObject<DragState>;
  invalidateRef: React.MutableRefObject<(() => void) | null>;
  focusSkillId: string | null;
  onHover: (id: string | null) => void;
  onLock: (id: string) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const { invalidate } = useThree();

  /** The in-flight rotate-to-target tween, or `null` when auto-spinning. `t`
   *  ramps 0→1 over {@link FOCUS_DURATION}; at 1 the tile is held facing the
   *  camera (auto-spin stays paused while a focus is set). Mutated in the frame
   *  loop, so a ref — never re-rendering React per frame. */
  const focusRef = useRef<{
    from: THREE.Quaternion;
    target: THREE.Quaternion;
    t: number;
  } | null>(null);

  // Expose invalidate() to the DOM drag handlers (they live outside <Canvas>).
  useEffect(() => {
    invalidateRef.current = invalidate;
    return () => {
      invalidateRef.current = null;
    };
  }, [invalidate, invalidateRef]);

  const geometry = useMemo(
    () => new THREE.IcosahedronGeometry(1, detail),
    [detail],
  );
  const wireframe = useMemo(
    () => new THREE.WireframeGeometry(geometry),
    [geometry],
  );
  useEffect(
    () => () => {
      geometry.dispose();
      wireframe.dispose();
    },
    [geometry, wireframe],
  );

  const placements = useMemo(
    () => facePlacements(geometry, skills.length),
    [geometry, skills.length],
  );

  // Rotate-to-target: when `focusSkillId` is set, arm a slerp that swings that
  // skill's tile to face the camera and holds it (auto-spin paused); when
  // cleared, drop the tween so auto-spin resumes from the current orientation.
  // Reduced-motion snaps instantly (t starts at 1 — no tween) and pokes one
  // frame, honouring the `demand` frameloop. `skills` is memoized upstream, so
  // this only re-runs when the focus target actually changes.
  useEffect(() => {
    const s = stateRef.current;
    if (focusSkillId == null) {
      focusRef.current = null;
      return;
    }
    const idx = skills.findIndex((sk) => sk.id === focusSkillId);
    if (idx < 0 || !placements[idx]) {
      focusRef.current = null;
      return;
    }
    const target = faceTargetQuaternion(placements[idx].normal);
    if (reduced) {
      s.quat.copy(target);
      focusRef.current = { from: target.clone(), target, t: 1 };
    } else {
      focusRef.current = { from: s.quat.clone(), target, t: 0 };
    }
    invalidate();
  }, [focusSkillId, placements, reduced, skills, stateRef, invalidate]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;
    const s = stateRef.current;
    const focus = focusRef.current;
    if (focus) {
      // Ease toward the target and hold there; a drag is disabled while focused.
      if (focus.t < 1) {
        focus.t = Math.min(1, focus.t + delta / FOCUS_DURATION);
        s.quat.copy(focus.from).slerp(focus.target, easeInOutCubic(focus.t));
        invalidate(); // keep frames coming through the tween in demand mode
      }
    } else if (!reduced && !s.dragging) {
      // Slow auto-spin about the screen-vertical axis.
      s.quat.premultiply(TMP_STEP_Q.setFromAxisAngle(Y_AXIS, delta * 0.25));
    }
    // Renormalize: thousands of premultiplied small steps drift numerically.
    group.quaternion.copy(s.quat.normalize());
  });

  return (
    <>
      {/* ONE key light + low ambient, outside the rotating group so shading
          sweeps across facets as the sphere turns. A single dominant light
          direction is what makes the facet gradient read as one form — a
          second fill light put glints in unrelated places, and high ambient
          flattened the falloff so away-facing triangles never darkened.
          Exposure is tuned per theme off the albedo's luminance, and measured
          empirically (headless screenshot + pixel sampling): three's physical
          lighting mode (r155+) needs intensity ≈ π × the target irradiance,
          so numbers here are larger than the naive 0..1 reasoning suggests.
          Light theme: ambient 2.36 ≈ 0.75π keeps EVERY facet ≥ ~87% of the
          near-white albedo — the sphere hugs the paper page, shading stays a
          delicate gradient — while ambient+key ≈ 1.05π peaks just shy of
          clamping (blown flat-white facets, washed icons). Dark theme: the
          approved look — effective irradiance ~0.11..0.38, a deep sphere
          with a 3.4:1 lit:shadow sweep. */}
      <ambientLight intensity={tokens.lightTheme ? 2.36 : 0.35} />
      <directionalLight
        position={[2.5, 3, 4]}
        intensity={tokens.lightTheme ? 0.94 : 0.85}
      />
      <group ref={groupRef}>
        {/* Opaque faceted surface — the sphere is a solid lit object, not a
            cage: it occludes the far hemisphere's lines. Matte (high
            roughness): low roughness gave narrow specular lobes, so facets
            were either blazing or black — patchy, jagged. Smoothness instead
            comes from diffuse falloff off ONE key light. The albedo is
            --panel-2 verbatim — the page's own elevation colour, shared with
            the icon discs — with the light rig scaled (see above) so the lit
            side renders at that colour rather than a brightened stranger of
            it. flatShading keeps one uniform shade per triangle.
            polygonOffset pushes the fill back in depth so the coincident
            wireframe lines win cleanly. */}
        <mesh geometry={geometry}>
          <meshStandardMaterial
            color={tokens.panel}
            flatShading
            roughness={0.85}
            metalness={0}
            polygonOffset
            polygonOffsetFactor={1}
            polygonOffsetUnits={1}
          />
        </mesh>
        {/* Edge lines in the page's plotting-grid colour (--grid), alpha
            carried as opacity — the sphere reads as part of the same
            instrument surface rather than an amber cage. */}
        <lineSegments geometry={wireframe}>
          <lineBasicMaterial
            color={tokens.grid.color}
            transparent
            opacity={tokens.grid.alpha}
          />
        </lineSegments>
        {skills.map((skill, i) => (
          <SkillFace
            key={skill.id}
            skill={skill}
            iconUrl={resolveSkillIconUrl(skill, tokens.lightTheme)}
            placement={placements[i]}
            color={tokens.amber}
            fill={tokens.panel}
            onHover={onHover}
            onLock={onLock}
            invalidate={invalidate}
          />
        ))}
      </group>
    </>
  );
}

/**
 * SkillSphereCanvas — the WebGL half of {@link SkillSphere}, isolated in its own
 * module so `React.lazy` code-splits three.js out of the entry chunk. Owns the
 * pointer-drag → rotation plumbing, the reduced-motion decision, and pausing the
 * render loop when the sphere scrolls off-screen (frameloop `never`). Under
 * reduced-motion the loop drops to `demand` — no auto-spin, but drag still
 * renders (via invalidate). The wrapper is `aria-hidden`; the reading lives in
 * the visually-hidden list rendered by the parent.
 */
export default function SkillSphereCanvas({
  skills,
  detail,
  focusSkillId = null,
  onLock,
}: CanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  const [inView, setInView] = useState(true);
  // The tile currently under the pointer — drives the mono tooltip. Kept as an
  // id (not a title) so it stays in step with the parent console's preview.
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Hover in/out on a tile lights ONLY the local tooltip. It deliberately does
  // NOT report a preview to the parent console: rotate-to-target belongs to the
  // skill LIST alone (Ben: hovering the sphere itself must not re-centre it —
  // the sphere chasing the tile under your own pointer feels haunted). Click
  // still locks via the parent.
  const handleTileHover = (id: string | null) => {
    setHoveredId(id);
  };

  const hoveredTitle = hoveredId
    ? (skills.find((s) => s.id === hoveredId)?.title ?? null)
    : null;
  // A held focus target owns the orientation; let it be, don't let a stray drag
  // fight the slerp (simplest of the task's two options).
  const focusActive = focusSkillId != null;

  const stateRef = useRef<DragState>({
    // Start with the same gentle downward tilt the sphere always had.
    quat: new THREE.Quaternion().setFromAxisAngle(X_AXIS, 0.32),
    dragging: false,
    lastX: 0,
    lastY: 0,
  });
  const invalidateRef = useRef<(() => void) | null>(null);

  const tokens = useSceneTokens();

  // Pause the render loop when the sphere is off-screen (borrows the site's
  // reveal-on-view pattern, but toggles both ways). No observer → stay active.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => setInView(entries.some((e) => e.isIntersecting)),
      { threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const frameloop: 'always' | 'demand' | 'never' = !inView
    ? 'never'
    : reduced
      ? 'demand'
      : 'always';

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (focusActive) return; // a rotate-to-target hold owns the orientation
    const s = stateRef.current;
    s.dragging = true;
    s.lastX = e.clientX;
    s.lastY = e.clientY;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = stateRef.current;
    if (!s.dragging) return;
    // Screen-space trackball: premultiplying world-axis increments keeps the
    // drag direction tied to the screen (the camera is axis-aligned) with no
    // per-axis clamps — the sphere tumbles infinitely in any direction.
    s.quat.premultiply(
      TMP_STEP_Q.setFromAxisAngle(Y_AXIS, (e.clientX - s.lastX) * 0.01),
    );
    s.quat.premultiply(
      TMP_STEP_Q.setFromAxisAngle(X_AXIS, (e.clientY - s.lastY) * 0.01),
    );
    s.lastX = e.clientX;
    s.lastY = e.clientY;
    // In demand/never modes the dragged frame only renders if we ask for it.
    invalidateRef.current?.();
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = stateRef.current;
    if (!s.dragging) return;
    s.dragging = false;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  return (
    <div
      ref={wrapRef}
      className={styles.canvasWrap}
      aria-hidden="true"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
    >
      <Canvas
        frameloop={frameloop}
        camera={{ position: [0, 0, 3], fov: 45 }}
        gl={{ alpha: true, antialias: true }}
        /* No tone mapping: fiber defaults to filmic ACES, which crushes the
           near-black facet shading this scene depends on and shifts the
           token-matched icon/line colours. */
        flat
      >
        <Scene
          skills={skills}
          detail={detail}
          tokens={tokens}
          reduced={reduced}
          stateRef={stateRef}
          invalidateRef={invalidateRef}
          focusSkillId={focusSkillId}
          onHover={handleTileHover}
          onLock={(id) => onLock?.(id)}
        />
      </Canvas>
      {hoveredTitle && <div className={styles.tooltip}>{hoveredTitle}</div>}
    </div>
  );
}
