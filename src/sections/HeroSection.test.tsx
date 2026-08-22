import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import HeroSection from './HeroSection';
import heroStyles from './HeroSection.module.css';
import type { Section } from '../types/content';
import { mockReducedMotion } from '../test/motion';

function heroSection(data: Record<string, unknown>): Section {
  return { id: 'sec-hero', type: 'hero', data, items: [] } as Section;
}

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

const restores: Array<() => void> = [];

// HeroStrip now lives in the hero body slot and subscribes to useNowPlaying;
// stub the API so its shared fetch resolves quietly in every hero test.
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(jsonResponse({ playing: false })),
  );
});

afterEach(() => {
  while (restores.length) restores.pop()!();
  vi.unstubAllGlobals();
});

describe('HeroSection (DESIGN.md §5, §6)', () => {
  it('renders the tagline eyebrow, display h1, and intro from section data', () => {
    restores.push(mockReducedMotion(false));

    render(
      <HeroSection
        section={heroSection({
          title: 'Ben Kile',
          tagline: '// software developer',
          intro: 'Building quietly humming systems.',
        })}
        media={{}}
      />,
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'Ben Kile' }),
    ).toBeInTheDocument();
    expect(screen.getByText('// software developer')).toBeInTheDocument();
    expect(
      screen.getByText('Building quietly humming systems.'),
    ).toBeInTheDocument();
  });

  it('emits no heading and no header block when the section has no title, tagline, or intro', () => {
    restores.push(mockReducedMotion(false));

    const { container } = render(
      <HeroSection section={heroSection({})} media={{}} />,
    );

    // No h1 anywhere in the tree — no fallback copy, no empty element (§7).
    expect(container.querySelector('h1')).toBeNull();
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
  });

  it('renders the optional background image with its media-map alt', () => {
    restores.push(mockReducedMotion(false));

    render(
      <HeroSection
        section={heroSection({
          title: 'Ben Kile',
          background_media_id: 'media-hero',
        })}
        media={{
          'media-hero': {
            url: 'https://media.benkile.com/hero.jpg',
            alt: 'A wide skyline',
          },
        }}
      />,
    );

    const img = screen.getByAltText('A wide skyline');
    expect(img).toHaveAttribute('src', 'https://media.benkile.com/hero.jpg');
  });

  it('renders a tagged light-theme variant alongside the default when background_light_media_id is set', () => {
    restores.push(mockReducedMotion(false));

    render(
      <HeroSection
        section={heroSection({
          background_media_id: 'media-dark',
          background_light_media_id: 'media-light',
        })}
        media={{
          'media-dark': {
            url: 'https://media.benkile.com/dark.jpg',
            alt: 'Night',
          },
          'media-light': {
            url: 'https://media.benkile.com/light.jpg',
            alt: 'Day',
          },
        }}
      />,
    );

    expect(screen.getByAltText('Night')).toHaveAttribute(
      'data-variant',
      'dark',
    );
    expect(screen.getByAltText('Day')).toHaveAttribute('data-variant', 'light');
  });

  it('tags a lone dark image so it renders on the dark theme only', () => {
    restores.push(mockReducedMotion(false));

    render(
      <HeroSection
        section={heroSection({ background_media_id: 'media-hero' })}
        media={{
          'media-hero': {
            url: 'https://media.benkile.com/hero.jpg',
            alt: 'Only',
          },
        }}
      />,
    );

    expect(screen.getByAltText('Only')).toHaveAttribute('data-variant', 'dark');
  });

  it('inset-pads the text container without a backdrop, so the layout does not jump', () => {
    restores.push(mockReducedMotion(false));

    const { container } = render(
      <HeroSection
        section={heroSection({
          title: 'Ben Kile',
          tagline: '// software developer',
          intro: 'Building quietly humming systems.',
        })}
        media={{}}
      />,
    );

    const section = container.querySelector('section');
    expect(section).toHaveClass(heroStyles.hero);
  });

  it('inset-pads the text container behind a backdrop, so eyebrow/headline/intro never touch the image edge', () => {
    restores.push(mockReducedMotion(false));

    const { container } = render(
      <HeroSection
        section={heroSection({
          title: 'Ben Kile',
          tagline: '// software developer',
          intro: 'Building quietly humming systems.',
          background_media_id: 'media-hero',
        })}
        media={{
          'media-hero': {
            url: 'https://media.benkile.com/hero.jpg',
            alt: 'A wide skyline',
          },
        }}
      />,
    );

    const section = container.querySelector('section');
    expect(section).toHaveClass(heroStyles.hero);
    // The backdrop still covers the whole hero box behind the padded text.
    expect(container.querySelector(`.${heroStyles.backdrop}`)).not.toBeNull();
  });

  it('runs the page-load orchestration when motion is allowed', () => {
    restores.push(mockReducedMotion(false));

    const { container } = render(
      <HeroSection
        section={heroSection({ title: 'Ben Kile', tagline: '// dev' })}
        media={{}}
      />,
    );

    expect(container.querySelector('section')).toHaveClass(heroStyles.animated);
  });

  it('ignores an OS reduced-motion preference (orchestration still runs, owner decision)', () => {
    restores.push(mockReducedMotion(true));

    const { container } = render(
      <HeroSection
        section={heroSection({ title: 'Ben Kile', tagline: '// dev' })}
        media={{}}
      />,
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'Ben Kile' }),
    ).toBeInTheDocument();
    expect(container.querySelector('section')).toHaveClass(heroStyles.animated);
  });

  describe('background tuning (task 132)', () => {
    const HERO_CSS = readFileSync(
      resolve(process.cwd(), 'src/sections/HeroSection.module.css'),
      'utf8',
    );

    it('switches per-theme backdrop variants purely in CSS', () => {
      // CSS does the theme switch: light hidden by default, shown (and dark hidden) on light.
      expect(HERO_CSS).toMatch(
        /\.backdropImg\[data-variant=['"]light['"]\]\s*\{[^}]*display:\s*none/,
      );
      expect(HERO_CSS).toMatch(
        /:root\[data-theme=['"]light['"]\]\s+\.backdropImg\[data-variant=['"]light['"]\][^}]*display:\s*block/,
      );
      expect(HERO_CSS).toMatch(
        /:root\[data-theme=['"]light['"]\]\s+\.backdropImg\[data-variant=['"]dark['"]\][^}]*display:\s*none/,
      );
    });

    function renderWithBackground(background: unknown) {
      restores.push(mockReducedMotion(false));
      return render(
        <HeroSection
          section={heroSection({
            title: 'Ben Kile',
            background_media_id: 'media-hero',
            background,
          })}
          media={{
            'media-hero': {
              url: 'https://media.benkile.com/hero.jpg',
              alt: 'A wide skyline',
            },
          }}
        />,
      );
    }

    it('sets no CSS custom properties when background is absent (defaults hold via the module fallbacks)', () => {
      restores.push(mockReducedMotion(false));
      const { container } = render(
        <HeroSection
          section={heroSection({
            title: 'Ben Kile',
            background_media_id: 'media-hero',
          })}
          media={{
            'media-hero': {
              url: 'https://media.benkile.com/hero.jpg',
              alt: 'A wide skyline',
            },
          }}
        />,
      );
      const backdrop = container.querySelector<HTMLElement>(
        `.${heroStyles.backdrop}`,
      );
      expect(backdrop).not.toBeNull();
      // No inline style is set, so the CSS fallbacks (0.1 dark / 0.06 light,
      // cover, 50% 50%, no filters, scale 1, no overlay) drive the render.
      expect(backdrop!.getAttribute('style')).toBeNull();
    });

    it('reflects every custom knob as a CSS variable on the backdrop element', () => {
      const { container } = renderWithBackground({
        opacity_dark: 0.25,
        opacity_light: 0.12,
        object_fit: 'contain',
        object_position: 'center top',
        blur_px: 6,
        grayscale: 0.3,
        brightness: 1.1,
        contrast: 0.9,
        saturate: 1.2,
        scale: 1.15,
        overlay_dark: 0.4,
        overlay_light: 0.2,
      });
      const backdrop = container.querySelector<HTMLElement>(
        `.${heroStyles.backdrop}`,
      )!;
      const style = backdrop.getAttribute('style') ?? '';
      expect(style).toContain('--hero-bg-opacity-dark: 0.25');
      expect(style).toContain('--hero-bg-opacity-light: 0.12');
      expect(style).toContain('--hero-bg-fit: contain');
      expect(style).toContain('--hero-bg-position: center top');
      expect(style).toContain('--hero-bg-blur: 6px');
      expect(style).toContain('--hero-bg-grayscale: 0.3');
      expect(style).toContain('--hero-bg-brightness: 1.1');
      expect(style).toContain('--hero-bg-contrast: 0.9');
      expect(style).toContain('--hero-bg-saturate: 1.2');
      expect(style).toContain('--hero-bg-scale: 1.15');
      expect(style).toContain('--hero-bg-overlay-dark: 0.4');
      expect(style).toContain('--hero-bg-overlay-light: 0.2');
    });

    it('clamps out-of-range numeric knobs to the contract bounds', () => {
      const { container } = renderWithBackground({
        opacity_dark: 5,
        opacity_light: -1,
        blur_px: 500,
        grayscale: 9,
        brightness: -1,
        contrast: 99,
        saturate: -2,
        scale: 10,
        overlay_dark: -0.5,
        overlay_light: 5,
      });
      const style =
        container
          .querySelector<HTMLElement>(`.${heroStyles.backdrop}`)!
          .getAttribute('style') ?? '';
      expect(style).toContain('--hero-bg-opacity-dark: 1');
      expect(style).toContain('--hero-bg-opacity-light: 0');
      expect(style).toContain('--hero-bg-blur: 40px');
      expect(style).toContain('--hero-bg-grayscale: 1');
      expect(style).toContain('--hero-bg-brightness: 0');
      expect(style).toContain('--hero-bg-contrast: 2');
      expect(style).toContain('--hero-bg-saturate: 0');
      expect(style).toContain('--hero-bg-scale: 2');
      expect(style).toContain('--hero-bg-overlay-dark: 0');
      expect(style).toContain('--hero-bg-overlay-light: 1');
    });

    it('drops invalid object_fit values and any non-finite numbers (defaults hold)', () => {
      const { container } = renderWithBackground({
        object_fit: 'weird',
        opacity_dark: Number.NaN,
        blur_px: 'oops',
        // A valid knob so the style attribute is emitted at all.
        contrast: 1.5,
      });
      const style =
        container
          .querySelector<HTMLElement>(`.${heroStyles.backdrop}`)!
          .getAttribute('style') ?? '';
      expect(style).not.toContain('--hero-bg-fit');
      expect(style).not.toContain('--hero-bg-opacity-dark');
      expect(style).not.toContain('--hero-bg-blur');
      expect(style).toContain('--hero-bg-contrast: 1.5');
    });

    it('drops object_position values with disallowed characters or over 40 chars', () => {
      const { container } = renderWithBackground({
        object_position: 'url(evil.png)',
        // A valid knob so the style attribute is present.
        opacity_dark: 0.2,
      });
      const s1 =
        container
          .querySelector<HTMLElement>(`.${heroStyles.backdrop}`)!
          .getAttribute('style') ?? '';
      expect(s1).not.toContain('--hero-bg-position');

      const { container: c2 } = renderWithBackground({
        // 41 characters, all otherwise-allowed - rejected by the length cap.
        object_position: '5% 5% ' + 'a'.repeat(35),
        opacity_dark: 0.2,
      });
      const s2 =
        c2
          .querySelector<HTMLElement>(`.${heroStyles.backdrop}`)!
          .getAttribute('style') ?? '';
      expect(s2).not.toContain('--hero-bg-position');
    });

    it('the CSS module swaps to opacity_light under :root[data-theme="light"] with no JS', () => {
      // Both dark and light custom properties are always set, so the CSS
      // module can pick either one purely by the html data-theme flag.
      const { container } = renderWithBackground({
        opacity_dark: 0.2,
        opacity_light: 0.05,
      });
      const style =
        container
          .querySelector<HTMLElement>(`.${heroStyles.backdrop}`)!
          .getAttribute('style') ?? '';
      expect(style).toContain('--hero-bg-opacity-dark: 0.2');
      expect(style).toContain('--hero-bg-opacity-light: 0.05');

      // Dark rule: .backdropImg opacity reads --hero-bg-opacity-dark with 0.1
      // as the fallback.
      expect(HERO_CSS).toMatch(
        /\.backdropImg[^}]*opacity:\s*var\(--hero-bg-opacity-dark,\s*0\.1\)/,
      );
      // Light-theme override: same class, but the light custom property.
      expect(HERO_CSS).toMatch(
        /:root\[data-theme=['"]light['"]\]\s+\.backdropImg[^}]*opacity:\s*var\(--hero-bg-opacity-light,\s*0\.06\)/,
      );
    });

    it('paints a --ground-coloured overlay via .backdrop::after, with a per-theme alpha', () => {
      // The overlay itself lives entirely in CSS; JS only provides the alpha.
      expect(HERO_CSS).toMatch(
        /\.backdrop::after[^}]*background-color:\s*var\(--ground\)/,
      );
      expect(HERO_CSS).toMatch(
        /\.backdrop::after[^}]*opacity:\s*var\(--hero-bg-overlay-dark,\s*0\)/,
      );
      expect(HERO_CSS).toMatch(
        /:root\[data-theme=['"]light['"]\]\s+\.backdrop::after[^}]*opacity:\s*var\(--hero-bg-overlay-light,\s*0\)/,
      );
    });

    it('keeps overflow: hidden on .backdrop so scale > 1 cannot widen the page', () => {
      // App.overflow enforces the 320px sweep at the page level; this covers
      // the specific hero rule that keeps a scaled image contained.
      expect(HERO_CSS).toMatch(/\.backdrop\s*\{[^}]*overflow:\s*hidden/);
    });
  });

  it('mounts the HeroStrip in the SectionShell body slot (nth-child(2))', () => {
    restores.push(mockReducedMotion(false));

    const { container } = render(
      <HeroSection
        section={heroSection({
          title: 'Ben Kile',
          tagline: '// software developer',
          intro: 'Building quietly humming systems.',
        })}
        media={{}}
      />,
    );

    // The body slot is the SectionShell's second direct child; the strip has to
    // land inside it so the existing 180ms stagger picks it up.
    const section = container.querySelector('section');
    expect(section).not.toBeNull();
    const bodySlot = section!.children[1];
    expect(bodySlot).toBeDefined();
    // The strip advertises itself as a list of instrument items.
    const strip = bodySlot!.querySelector('[role="list"]');
    expect(strip).not.toBeNull();
    // And the Spotify item is inside it.
    expect(strip!.querySelector('[role="listitem"]')).not.toBeNull();
  });
});
