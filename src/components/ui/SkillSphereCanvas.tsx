import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { usePrefersReducedMotion } from '../../lib/prefersReducedMotion';
import styles from './SkillSphere.module.css';
import type { SkillSphereSkill } from './SkillSphere';

/** Shared, mutable drag/rotation state — mutated by DOM handlers and read in
 *  the render loop without re-rendering React on every pointer move. */
interface DragState {
  rotX: number;
  rotY: number;
  dragging: boolean;
  lastX: number;
  lastY: number;
}

interface CanvasProps {
  skills: SkillSphereSkill[];
  detail: number;
}

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

/** A canvas-drawn initial-letter texture — the per-skill degrade path when an
 *  icon fails to load, so one broken URL never blanks the sphere or throws. */
function letterTexture(title: string, color: string): THREE.Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = color;
    ctx.font = `600 ${size * 0.7}px 'IBM Plex Mono', ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((title.trim()[0] ?? '?').toUpperCase(), size / 2, size / 2);
  }
  return new THREE.CanvasTexture(canvas);
}

/**
 * Anchor points for `count` skills spread evenly across the geometry's faces.
 * Face centroids are computed from the (non-indexed) position attribute, pushed
 * just outside the unit sphere so the sprites float above the surface. Skills
 * are sampled across the whole face list — `floor(i·faces/count)` — so N skills
 * on a denser sphere don't clump at one pole.
 */
function facePlacements(
  geometry: THREE.BufferGeometry,
  count: number,
): [number, number, number][] {
  const pos = geometry.getAttribute('position');
  const faces: [number, number, number][] = [];
  for (let i = 0; i < pos.count; i += 3) {
    const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
    const cy = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    const cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
    const len = Math.hypot(cx, cy, cz) || 1;
    const k = 1.06 / len; // just proud of the unit-radius surface
    faces.push([cx * k, cy * k, cz * k]);
  }

  const n = faces.length;
  const out: [number, number, number][] = [];
  for (let i = 0; i < count; i += 1) {
    out.push(n === 0 ? [0, 0, 1.06] : faces[Math.floor((i * n) / count) % n]);
  }
  return out;
}

/** One billboarded skill icon. Loads its texture cross-origin and degrades to
 *  an initial-letter texture on error — never crashing the canvas. */
function SkillSprite({
  skill,
  position,
  color,
  onHover,
  invalidate,
}: {
  skill: SkillSphereSkill;
  position: [number, number, number];
  color: string;
  onHover: (title: string | null) => void;
  invalidate: () => void;
}) {
  const [map, setMap] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(
      skill.icon_source,
      (tex) => {
        if (cancelled) return;
        setMap(tex);
        invalidate();
      },
      undefined,
      () => {
        if (cancelled) return;
        setMap(letterTexture(skill.title, color));
        invalidate();
      },
    );
    return () => {
      cancelled = true;
    };
  }, [skill.icon_source, skill.title, color, invalidate]);

  // Free the GPU texture when it is replaced or the sprite unmounts.
  useEffect(() => () => map?.dispose(), [map]);

  if (!map) return null;

  return (
    <sprite
      position={position}
      scale={[0.34, 0.34, 0.34]}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        onHover(skill.title);
      }}
      onPointerOut={() => onHover(null)}
    >
      <spriteMaterial
        map={map}
        transparent
        depthTest={false}
        depthWrite={false}
      />
    </sprite>
  );
}

/** The rotating group: an amber wireframe icosahedron plus one sprite per
 *  skill. Auto-rotates via the render loop unless reduced-motion or a drag is
 *  in progress; drag rotation is read from the shared `stateRef`. */
function Scene({
  skills,
  detail,
  color,
  reduced,
  stateRef,
  invalidateRef,
  onHover,
}: {
  skills: SkillSphereSkill[];
  detail: number;
  color: string;
  reduced: boolean;
  stateRef: React.MutableRefObject<DragState>;
  invalidateRef: React.MutableRefObject<(() => void) | null>;
  onHover: (title: string | null) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const { invalidate } = useThree();

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
  const threeColor = useMemo(() => new THREE.Color(color), [color]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;
    const s = stateRef.current;
    if (!reduced && !s.dragging) {
      s.rotY += delta * 0.25; // slow auto-rotation
    }
    group.rotation.x = s.rotX;
    group.rotation.y = s.rotY;
  });

  return (
    <group ref={groupRef}>
      <lineSegments geometry={wireframe}>
        <lineBasicMaterial color={threeColor} transparent opacity={0.55} />
      </lineSegments>
      {skills.map((skill, i) => (
        <SkillSprite
          key={skill.id}
          skill={skill}
          position={placements[i]}
          color={color}
          onHover={onHover}
          invalidate={invalidate}
        />
      ))}
    </group>
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
export default function SkillSphereCanvas({ skills, detail }: CanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  const [inView, setInView] = useState(true);
  const [hovered, setHovered] = useState<string | null>(null);

  const stateRef = useRef<DragState>({
    rotX: 0.32,
    rotY: 0,
    dragging: false,
    lastX: 0,
    lastY: 0,
  });
  const invalidateRef = useRef<(() => void) | null>(null);

  const amber = useMemo(() => cssToken('--amber', '#e8a33d'), []);

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
    const s = stateRef.current;
    s.dragging = true;
    s.lastX = e.clientX;
    s.lastY = e.clientY;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = stateRef.current;
    if (!s.dragging) return;
    s.rotY += (e.clientX - s.lastX) * 0.01;
    s.rotX += (e.clientY - s.lastY) * 0.01;
    s.rotX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, s.rotX));
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
      >
        <Scene
          skills={skills}
          detail={detail}
          color={amber}
          reduced={reduced}
          stateRef={stateRef}
          invalidateRef={invalidateRef}
          onHover={setHovered}
        />
      </Canvas>
      {hovered && <div className={styles.tooltip}>{hovered}</div>}
    </div>
  );
}
