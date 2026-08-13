import type { Theme } from '../components/ThemeToggle';

/**
 * Code-block theme configuration (spec §3.7) — THE place to change how code
 * snippets are coloured. One Shiki theme per site theme; swapping a theme is a
 * two-field edit here (`name` + `load`), nothing else in the pipeline knows
 * which themes exist. Any theme bundled with Shiki works — see
 * `node_modules/shiki/dist/themes/` for the catalogue.
 *
 * Each entry pairs the Shiki theme id with a lazy loader, mirroring
 * `LANG_LOADERS` in `highlight.ts`: a distinct dynamic import per theme so the
 * bundler splits each into its own chunk and a visitor only downloads the theme
 * their site theme actually uses.
 */
export interface CodeThemeEntry {
  /** Shiki theme id, as passed to `codeToTokens` (must match the loaded file). */
  name: string;
  /** Lazy import of the theme JSON module. */
  load: () => Promise<{ default: unknown }>;
}

export const CODE_THEMES: Record<Theme, CodeThemeEntry> = {
  dark: {
    name: 'github-dark-default',
    load: () => import('shiki/themes/github-dark-default.mjs'),
  },
  light: {
    name: 'github-light',
    load: () => import('shiki/themes/github-light.mjs'),
  },
};

/**
 * The site theme currently stamped on `<html>` — same semantics as
 * `ThemeToggle`: anything other than an explicit `light` is the native dark
 * theme (including before the no-flash script runs, and in non-DOM tests).
 */
export function readSiteTheme(): Theme {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}
