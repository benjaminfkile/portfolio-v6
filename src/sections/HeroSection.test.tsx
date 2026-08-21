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
