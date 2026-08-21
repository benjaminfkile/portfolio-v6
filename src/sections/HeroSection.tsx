import type { CSSProperties } from 'react';
import type { SectionProps } from './types';
import type { HeroBackground, HeroSectionData } from '../types/content';
import SectionShell from '../components/ui/SectionShell';
import HeroStrip from '../components/HeroStrip';
import { usePrefersReducedMotion } from '../lib/prefersReducedMotion';
import styles from './HeroSection.module.css';

/**
 * The hero (spec §3.8, DESIGN.md §5) - a **static** section: a mono amber tagline
 * (the "// software developer" instrument voice), a display headline, and a
 * short intro.
 *
 * On page load the header lines fade/rise 12px, staggered 60ms and once
 * (DESIGN.md §6). Under `prefers-reduced-motion` the orchestration is dropped
 * entirely and everything renders in its final, static state - decided in JS
 * here, with a CSS `@media` guard behind it. v5's animated jQuery header does
 * not carry over; no canvas or scroll theatrics are written (§3.8).
 */

const OBJECT_FITS: ReadonlySet<string> = new Set([
  'cover',
  'contain',
  'fill',
  'none',
  'scale-down',
]);
const OBJECT_POSITION_RE = /^[A-Za-z0-9 %.-]{1,40}$/;

type BackdropStyle = CSSProperties & Record<string, string | number>;

function clampNum(
  value: unknown,
  min: number,
  max: number,
): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.min(max, Math.max(min, value));
}

/**
 * Whittle a published `background` blob down to a CSS custom-property bag on
 * the .backdrop element. Only contract-approved values survive: numbers clamp
 * to their range, `object_fit` is whitelisted, `object_position` is regex-
 * checked. Any invalid or missing key is simply omitted, so the CSS module's
 * `var(--foo, DEFAULT)` fallback holds - a bad snapshot can never inject CSS.
 */
function backdropStyle(bg?: HeroBackground): BackdropStyle | undefined {
  if (!bg || typeof bg !== 'object') return undefined;
  const s: BackdropStyle = {};

  const od = clampNum(bg.opacity_dark, 0, 1);
  if (od !== undefined) s['--hero-bg-opacity-dark'] = String(od);

  const ol = clampNum(bg.opacity_light, 0, 1);
  if (ol !== undefined) s['--hero-bg-opacity-light'] = String(ol);

  if (typeof bg.object_fit === 'string' && OBJECT_FITS.has(bg.object_fit)) {
    s['--hero-bg-fit'] = bg.object_fit;
  }

  if (
    typeof bg.object_position === 'string' &&
    OBJECT_POSITION_RE.test(bg.object_position)
  ) {
    s['--hero-bg-position'] = bg.object_position;
  }

  const blur = clampNum(bg.blur_px, 0, 40);
  if (blur !== undefined) s['--hero-bg-blur'] = `${blur}px`;

  const gray = clampNum(bg.grayscale, 0, 1);
  if (gray !== undefined) s['--hero-bg-grayscale'] = String(gray);

  const bright = clampNum(bg.brightness, 0, 2);
  if (bright !== undefined) s['--hero-bg-brightness'] = String(bright);

  const contrast = clampNum(bg.contrast, 0, 2);
  if (contrast !== undefined) s['--hero-bg-contrast'] = String(contrast);

  const sat = clampNum(bg.saturate, 0, 2);
  if (sat !== undefined) s['--hero-bg-saturate'] = String(sat);

  const scale = clampNum(bg.scale, 1, 2);
  if (scale !== undefined) s['--hero-bg-scale'] = String(scale);

  const overlayDark = clampNum(bg.overlay_dark, 0, 1);
  if (overlayDark !== undefined) s['--hero-bg-overlay-dark'] = String(overlayDark);

  const overlayLight = clampNum(bg.overlay_light, 0, 1);
  if (overlayLight !== undefined) s['--hero-bg-overlay-light'] = String(overlayLight);

  return Object.keys(s).length > 0 ? s : undefined;
}

export default function HeroSection({
  section,
  media,
  duolingoLanguage,
  duolingoScoreLabel,
}: SectionProps) {
  const data = section.data as HeroSectionData;
  const reduced = usePrefersReducedMotion();
  const background = data.background_media_id
    ? media[data.background_media_id]
    : undefined;
  const backdropVars = backdropStyle(data.background);

  const shellClass = [styles.hero, reduced ? undefined : styles.animated]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={styles.wrap}>
      {background && (
        <div className={styles.backdrop} style={backdropVars}>
          <img
            className={styles.backdropImg}
            src={background.url}
            alt={background.alt ?? ''}
            loading="lazy"
            decoding="async"
          />
        </div>
      )}
      <SectionShell
        as="section"
        headingLevel="h1"
        className={shellClass}
        eyebrow={data.tagline}
        title={data.title}
        intro={data.intro}
      >
        <HeroStrip
          duolingoLanguage={duolingoLanguage}
          duolingoScoreLabel={duolingoScoreLabel}
        />
      </SectionShell>
    </div>
  );
}
