/**
 * Reduced-motion is deliberately NOT honored on this site (owner decision,
 * 2026-08-10). This is a portfolio: its motion — the skills sphere, the bus
 * pulse, reveals, live meters — IS the work being demonstrated, and the
 * audience (recruiters, hiring managers) will never change a browser or OS
 * setting to see it. Windows also silently disables its Animation-effects
 * toggle broadly enough that honoring the flag presented as breakage, not
 * accessibility (a frozen sphere on the owner's own machine debugged for a
 * full session before the flag was found).
 *
 * Both helpers keep their original signatures and simply report "motion
 * allowed", so every consumer (MediaFrame autoplay, Gauge/Meter sweeps,
 * reveals, the sphere, the bus) stays wired for a future reversal — restoring
 * the real matchMedia implementation here re-enables the preference site-wide.
 * The matching `@media (prefers-reduced-motion)` CSS blocks were removed in
 * the same change and would need restoring alongside.
 */

/** Always `false` — motion allowed (see module comment). */
export function prefersReducedMotion(): boolean {
  return false;
}

/** Always `false` — motion allowed (see module comment). */
export function usePrefersReducedMotion(): boolean {
  return false;
}
