import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import PortfolioSection from './PortfolioSection';
import styles from './PortfolioSection.module.css';
import type { MediaMap, Section, SectionItem } from '../types/content';

function portfolioSection(
  items: SectionItem[],
  data: Record<string, unknown> = {},
): Section {
  return { id: 'sec-portfolio', type: 'portfolio', data, items } as Section;
}

function project(id: string, extra: Record<string, unknown> = {}): SectionItem {
  return {
    id,
    data: {
      title: `Project ${id}`,
      intro: '',
      description: '',
      media_id: '',
      tech_icons: [],
      links: [],
      ...extra,
    },
  } as SectionItem;
}

describe('PortfolioSection (DESIGN.md §5)', () => {
  it('renders a video for items with a playback_rate and a lazy image otherwise', () => {
    const media: MediaMap = {
      v1: { url: 'https://media.benkile.com/clip.mp4', alt: 'A demo clip' },
      i1: { url: 'https://media.benkile.com/shot.png', alt: 'A screenshot' },
    };
    const { container } = render(
      <PortfolioSection
        section={portfolioSection([
          project('p1', { media_id: 'v1', playback_rate: 1.5 }),
          project('p2', { media_id: 'i1' }),
        ])}
        media={media}
      />,
    );

    // playback_rate present → the clip renders through the video path (§6).
    const video = container.querySelector('video');
    expect(video).toHaveAttribute('src', 'https://media.benkile.com/clip.mp4');

    // No playback_rate → a lazily-loaded image.
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', 'https://media.benkile.com/shot.png');
    expect(img).toHaveAttribute('loading', 'lazy');
  });

  it('renders each link as a chip carrying its own label and a safe external rel', () => {
    render(
      <PortfolioSection
        section={portfolioSection([
          project('p1', {
            links: [
              {
                type: 'repo',
                label: 'portfolio-v6-api',
                url: 'https://github.com/benjaminfkile/portfolio-v6-api',
              },
              { type: 'prod', label: 'Live site', url: 'https://benkile.com' },
            ],
          }),
        ])}
        media={{}}
      />,
    );

    const repo = screen.getByRole('link', { name: 'portfolio-v6-api' });
    expect(repo).toHaveAttribute(
      'href',
      'https://github.com/benjaminfkile/portfolio-v6-api',
    );
    expect(repo).toHaveAttribute('target', '_blank');
    expect(repo).toHaveAttribute('rel', 'noreferrer noopener');
    expect(screen.getByRole('link', { name: 'Live site' })).toBeInTheDocument();
  });

  it('renders tech marks as small image chips', () => {
    const { container } = render(
      <PortfolioSection
        section={portfolioSection([
          project('p1', {
            tech_icons: [
              'https://media.benkile.com/react.svg',
              'https://media.benkile.com/node.svg',
            ],
          }),
        ])}
        media={{}}
      />,
    );

    const icons = container.querySelectorAll('img');
    expect(icons).toHaveLength(2);
    expect(icons[0]).toHaveAttribute('src', 'https://media.benkile.com/react.svg');
    // Each icon carries an accessible name derived from its filename (§7) — the
    // tech mark is otherwise unannounced to assistive tech.
    expect(icons[0]).toHaveAttribute('alt', 'react logo');
    expect(icons[1]).toHaveAttribute('alt', 'node logo');
  });

  it('alternates the media/text layout side per item', () => {
    render(
      <PortfolioSection
        section={portfolioSection([
          project('p1'),
          project('p2'),
          project('p3'),
        ])}
        media={{}}
      />,
    );

    const panels = screen.getAllByRole('article');
    expect(panels[0]).not.toHaveClass(styles.reverse);
    expect(panels[0]).toHaveAttribute('data-align', 'start');
    expect(panels[1]).toHaveClass(styles.reverse);
    expect(panels[1]).toHaveAttribute('data-align', 'end');
    expect(panels[2]).not.toHaveClass(styles.reverse);
    expect(panels[2]).toHaveAttribute('data-align', 'start');
  });

  it('falls back to a default heading', () => {
    render(<PortfolioSection section={portfolioSection([])} media={{}} />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'Portfolio' }),
    ).toBeInTheDocument();
  });
});
