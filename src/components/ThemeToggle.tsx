import { useCallback, useEffect, useState } from 'react';
import { sendEvent } from '../lib/beacon';
import styles from './ThemeToggle.module.css';

export type Theme = 'dark' | 'light';

/**
 * Read the theme currently stamped on <html>. The no-flash inline script in
 * index.html sets this before first paint, so the toggle stays in sync with what
 * the user actually sees on mount (DESIGN.md §2).
 */
function readTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

/**
 * ThemeToggle — flips between the dark (native) and light Control Room themes,
 * persists the choice to localStorage('theme'), and stamps data-theme on <html>.
 * Rendered in the "instrument voice" (mono). Not mounted here; task 4 mounts it
 * in the nav.
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(readTheme);

  // Keep <html data-theme> in sync with React state (covers the toggle click;
  // on mount it re-affirms what the inline script already set).
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggle = useCallback(() => {
    // Fire-and-forget analytics (spec §4.8); suppressed under DNT/GPC/preview.
    sendEvent('theme_toggle');
    setTheme((current) => {
      const next: Theme = current === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem('theme', next);
      } catch {
        /* localStorage may be unavailable (private mode); the toggle still works
           for the current session. */
      }
      return next;
    });
  }, []);

  // Label names the destination, not the current state (DESIGN.md §7 a11y).
  const label =
    theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';

  return (
    <button
      type="button"
      className={styles.toggle}
      onClick={toggle}
      aria-label={label}
      title={label}
    >
      <span aria-hidden="true" className={styles.icon}>
        {theme === 'dark' ? '☾' : '☀'}
      </span>
      <span aria-hidden="true" className={styles.label}>
        {theme === 'dark' ? 'DARK' : 'LIGHT'}
      </span>
    </button>
  );
}
