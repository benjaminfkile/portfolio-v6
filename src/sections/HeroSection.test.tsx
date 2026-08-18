import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import HeroSection from './HeroSection';
import heroStyles from './HeroSection.module.css';
import type { Section } from '../types/content';
import { mockReducedMotion } from '../test/motion';

function heroSection(data: Record<string, unknown>): Section {
  return { id: 'sec-hero', type: 'hero', data, items: [] } as Section;
}

const restores: Array<() => void> = [];

afterEach(() => {
  while (restores.length) restores.pop()!();
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

  it('ignores an OS reduced-motion preference — orchestration still runs (owner decision)', () => {
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
});
