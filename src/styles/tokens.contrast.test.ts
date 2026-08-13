import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Contrast enforcement AS A TEST (DESIGN.md §2 contrast floor, task 8/8 §1).
 *
 * DESIGN.md §2 fixes a hard floor of WCAG AA — 4.5:1 for body/text roles and
 * 3:1 for large-text/UI roles — in BOTH themes, and says to verify, not eyeball.
 * This suite parses the real tokens.css (the single source of truth) rather than
 * hard-coding colours, computes the WCAG 2.x relative-luminance contrast ratio
 * for the pairs that actually render, and asserts each clears its floor. If a
 * token regresses below its floor this test fails and the token — not the test —
 * must be fixed (keeping the hue intent), per the task's rule.
 */

// Resolved from the Vitest working directory (the repo root) rather than
// import.meta.url, which Vite rewrites to a non-file scheme under jsdom.
const tokensCss = readFileSync(
  resolve(process.cwd(), 'src/styles/tokens.css'),
  'utf8',
);

/**
 * Split tokens.css into its two theme blocks and pull the solid `#rrggbb`
 * colour tokens out of each. Dark lives on the first `:root {` block; light
 * overrides live under `:root[data-theme='light']`. Non-hex tokens (the rgba
 * washes `--amber-soft`/`--grid`, type/space/radius) are ignored — none of the
 * rendered text/UI pairs below depend on them.
 */
function parseThemeColors(css: string): {
  dark: Record<string, string>;
  light: Record<string, string>;
} {
  const lightIndex = css.indexOf("[data-theme='light']");
  expect(lightIndex).toBeGreaterThan(-1);
  const darkSection = css.slice(0, lightIndex);
  const lightSection = css.slice(lightIndex);

  const grab = (section: string): Record<string, string> => {
    const out: Record<string, string> = {};
    const re = /(--[\w-]+):\s*(#[0-9a-fA-F]{6})\b/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(section)) !== null) {
      out[m[1]] = m[2].toLowerCase();
    }
    return out;
  };

  return { dark: grab(darkSection), light: grab(lightSection) };
}

/** sRGB channel → linear light (WCAG 2.x relative-luminance formula). */
function channelToLinear(srgb8: number): number {
  const c = srgb8 / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (
    0.2126 * channelToLinear(r) +
    0.7152 * channelToLinear(g) +
    0.0722 * channelToLinear(b)
  );
}

/** WCAG contrast ratio between two solid colours, in [1, 21]. */
function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const { dark, light } = parseThemeColors(tokensCss);
const THEMES = [
  { name: 'dark', colors: dark },
  { name: 'light', colors: light },
] as const;

const AA_TEXT = 4.5; // body/text roles (DESIGN.md §2)
const AA_LARGE = 3; // large-text / UI roles (status dots, meter fill)

/**
 * The pairs that matter (task 8/8 §1): the three prose text roles on both the
 * ground and every panel surface, the amber accent (links, live values,
 * eyebrows) on panels and the ground, and each semantic status colour on the
 * panel it labels. Backgrounds a token is ever painted on are listed per token.
 */
const TEXT_PAIRS: { fg: string; bg: string }[] = [
  { fg: '--text', bg: '--ground' },
  { fg: '--text', bg: '--panel' },
  { fg: '--text', bg: '--panel-2' },
  { fg: '--text-bright', bg: '--ground' },
  { fg: '--text-bright', bg: '--panel' },
  { fg: '--text-bright', bg: '--panel-2' },
  { fg: '--text-dim', bg: '--ground' },
  { fg: '--text-dim', bg: '--panel' },
  { fg: '--text-dim', bg: '--panel-2' },
  // Amber is a text role: live mono values, section eyebrows, active nav. It
  // renders on the ground (eyebrows/nav) and on panels (values) alike.
  { fg: '--amber', bg: '--ground' },
  { fg: '--amber', bg: '--panel' },
  // Prose links are their own text role: bare anchors in blog/markdown copy,
  // which renders on the ground and inside panels (quotes, cards).
  { fg: '--link', bg: '--ground' },
  { fg: '--link', bg: '--panel' },
  { fg: '--link', bg: '--panel-2' },
];

// Semantic colours only ever carry status as a StatusDot (UI mark, ≥3:1); text
// always accompanies the dot (DESIGN.md §7), so they sit at the large/UI floor.
const UI_PAIRS: { fg: string; bg: string }[] = [
  { fg: '--ok', bg: '--panel' },
  { fg: '--warn', bg: '--panel' },
  { fg: '--err', bg: '--panel' },
];

describe('tokens.css contrast floor (DESIGN.md §2, WCAG AA, both themes)', () => {
  it('parses solid colour tokens for both themes', () => {
    for (const { name, colors } of THEMES) {
      for (const token of [
        '--ground',
        '--panel',
        '--panel-2',
        '--text',
        '--text-bright',
        '--text-dim',
        '--amber',
        '--link',
        '--ok',
        '--warn',
        '--err',
      ]) {
        expect(colors[token], `${name} ${token}`).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  for (const { name, colors } of THEMES) {
    describe(`${name} theme`, () => {
      for (const { fg, bg } of TEXT_PAIRS) {
        it(`${fg} on ${bg} meets AA body text (≥4.5:1)`, () => {
          const ratio = contrastRatio(colors[fg], colors[bg]);
          expect(
            ratio,
            `${name}: ${fg} (${colors[fg]}) on ${bg} (${colors[bg]}) = ${ratio.toFixed(2)}:1`,
          ).toBeGreaterThanOrEqual(AA_TEXT);
        });
      }

      for (const { fg, bg } of UI_PAIRS) {
        it(`${fg} on ${bg} meets AA large/UI (≥3:1)`, () => {
          const ratio = contrastRatio(colors[fg], colors[bg]);
          expect(
            ratio,
            `${name}: ${fg} (${colors[fg]}) on ${bg} (${colors[bg]}) = ${ratio.toFixed(2)}:1`,
          ).toBeGreaterThanOrEqual(AA_LARGE);
        });
      }
    });
  }
});
