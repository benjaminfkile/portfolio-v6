import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import HeroSection from './HeroSection';
import heroStyles from './HeroSection.module.css';
import type { Section } from '../types/content';
import { mockReducedMotion } from '../test/motion';

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

/** The strip's live fetches are not under test here — answer them benignly. */
function stubStripFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn((path: string) => {
      if (path.startsWith('/api/now-playing')) {
        return Promise.resolve(jsonResponse({ playing: false }));
      }
      return Promise.resolve(jsonResponse({ degraded: false, services: [] }));
    }),
  );
}

function heroSection(data: Record<string, unknown>): Section {
  return { id: 'sec-hero', type: 'hero', data, items: [] } as Section;
}

const restores: Array<() => void> = [];

afterEach(() => {
  while (restores.length) restores.pop()!();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('HeroSection (DESIGN.md §5, §6)', () => {
  it('renders the tagline eyebrow, display h1, and intro from section data', async () => {
    restores.push(mockReducedMotion(false));
    stubStripFetch();

    render(
      <HeroSection
        section={heroSection({
          title: 'Ben Kile',
          tagline: '// software developer',
          intro: 'Building quietly humming systems.',
        })}
        media={{}}
        documentVersion={42}
      />,
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'Ben Kile' }),
    ).toBeInTheDocument();
    expect(screen.getByText('// software developer')).toBeInTheDocument();
    expect(
      screen.getByText('Building quietly humming systems.'),
    ).toBeInTheDocument();
    // The SITE readout is fed by the threaded document version, not a fetch.
    expect(screen.getByText('v42')).toBeInTheDocument();
    // Let the strip's live fetches settle so no state updates escape act().
    await screen.findByText('Operational');
  });

  it('renders the optional background image with its media-map alt', async () => {
    restores.push(mockReducedMotion(false));
    stubStripFetch();

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
        documentVersion={1}
      />,
    );

    const img = screen.getByAltText('A wide skyline');
    expect(img).toHaveAttribute('src', 'https://media.benkile.com/hero.jpg');
    await screen.findByText('Operational');
  });

  it('runs the page-load orchestration when motion is allowed', async () => {
    restores.push(mockReducedMotion(false));
    stubStripFetch();

    const { container } = render(
      <HeroSection
        section={heroSection({ title: 'Ben Kile', tagline: '// dev' })}
        media={{}}
        documentVersion={1}
      />,
    );

    expect(container.querySelector('section')).toHaveClass(heroStyles.animated);
    await screen.findByText('Operational');
  });

  it('ignores an OS reduced-motion preference — orchestration still runs (owner decision)', async () => {
    restores.push(mockReducedMotion(true));
    stubStripFetch();

    const { container } = render(
      <HeroSection
        section={heroSection({ title: 'Ben Kile', tagline: '// dev' })}
        media={{}}
        documentVersion={1}
      />,
    );

    // Content is present and the page-load orchestration class is applied
    // exactly as in the default case.
    expect(
      screen.getByRole('heading', { level: 1, name: 'Ben Kile' }),
    ).toBeInTheDocument();
    expect(container.querySelector('section')).toHaveClass(heroStyles.animated);
    await screen.findByText('Operational');
  });
});
