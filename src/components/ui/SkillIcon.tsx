import styles from './SkillIcon.module.css';

/**
 * The icon-source pair a skill carries (Icons v1.6): the default (light-theme)
 * URL plus an optional dark-theme override. Both the skills sphere and the
 * portfolio's tech chips (Skill Refs v1.8) render skills through here, so their
 * icons never diverge.
 */
export interface SkillIconRef {
  icon_source: string;
  icon_source_dark?: string;
}

/**
 * The effective icon URL for a skill under the current theme (Icons v1.6). Dark
 * theme prefers `icon_source_dark` and falls back to `icon_source` when it is
 * absent; light theme always uses `icon_source`. The WebGL texture pipeline (via
 * the scene's `lightTheme` token) resolves through here so the JS path and the
 * CSS-swap path never disagree on which glyph a theme shows.
 */
export function resolveSkillIconUrl(
  skill: SkillIconRef,
  lightTheme: boolean,
): string {
  if (lightTheme) return skill.icon_source;
  return skill.icon_source_dark ?? skill.icon_source;
}

export interface SkillIconProps {
  skill: SkillIconRef;
  /**
   * The icon's accessible name. Pass `''` for a decorative icon that sits beside
   * its own text label (the sphere chip fallback) — it renders `alt=""` and
   * `aria-hidden`. Pass the skill title where the icon is the sole carrier of the
   * name (portfolio tech chips, Skill Refs v1.8).
   */
  alt: string;
  /** Extra class merged onto every `<img>` (chip-specific sizing/box). */
  className?: string;
}

/**
 * A skill's theme-aware icon (Icons v1.6). A single-URL skill renders one
 * `<img>`; a skill with a dark override renders BOTH and lets the CSS module swap
 * them by `data-theme` — no JS listener, so the icon follows a live theme toggle
 * for free. When the icon carries the accessible name (`alt` non-empty) both
 * variants share it, and since the hidden variant leaves the a11y tree only the
 * visible one is announced.
 *
 * Every img requests in CORS mode (`crossOrigin="anonymous"`): the CDN serves
 * ACAO only when the request carries an Origin header and sends no
 * `Vary: Origin`, so a plain no-cors `<img>` load would poison the browser cache
 * with a header-less response that then fails the sphere's crossOrigin texture
 * fetch of the SAME URL. Keeping every request CORS-mode keeps every cache entry
 * texture-compatible.
 */
export default function SkillIcon({ skill, alt, className }: SkillIconProps) {
  if (!skill.icon_source) return null;

  const box = className ? `${styles.icon} ${className}` : styles.icon;
  const decorative = alt === '';
  const a11y = decorative
    ? { alt: '', 'aria-hidden': true as const }
    : { alt };

  if (skill.icon_source_dark) {
    return (
      <>
        <img
          className={`${box} ${styles.iconLight}`}
          src={skill.icon_source}
          crossOrigin="anonymous"
          {...a11y}
        />
        <img
          className={`${box} ${styles.iconDark}`}
          src={skill.icon_source_dark}
          crossOrigin="anonymous"
          {...a11y}
        />
      </>
    );
  }

  return (
    <img
      className={box}
      src={skill.icon_source}
      crossOrigin="anonymous"
      {...a11y}
    />
  );
}
