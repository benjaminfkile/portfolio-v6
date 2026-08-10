import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PortfolioSection from './PortfolioSection';
import styles from './PortfolioSection.module.css';
import type { MediaMap, Section, SectionItem, SkillsItem } from '../types/content';
import type { SkillsById } from '../lib/skillsIndex';
import { buildSkillsIndex } from '../lib/skillsIndex';
import { fixtureSkillRefsDocument } from '../test/fixtures';

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

  it('renders LEGACY tech_icons as small image chips, unchanged (pre-v1.8)', () => {
    // A pre-v1.8 item carries `tech_icons` and NO `skill_refs`, so it keeps the
    // legacy raw-URL rendering with filename-stem names.
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

describe('PortfolioSection — Skill Refs v1.8', () => {
  const skill = (over: Partial<SkillsItem> = {}): SkillsItem => ({
    title: 'TypeScript',
    description: '',
    icon_source: 'https://cdn.example.com/icons/ts.svg',
    ...over,
  });

  const skillsById: SkillsById = {
    'sk-ts': skill(),
    'sk-vercel': skill({
      title: 'Vercel',
      icon_source: 'https://cdn.example.com/icons/vercel-light.svg',
      icon_source_dark: 'https://cdn.example.com/icons/vercel-dark.svg',
    }),
  };

  afterEach(() => vi.restoreAllMocks());

  it('renders one chip per resolved skill_ref, in order, using the skill title as the accessible name', () => {
    const { container } = render(
      <PortfolioSection
        section={portfolioSection([
          project('p1', { skill_refs: ['sk-vercel', 'sk-ts'], tech_icons: [] }),
        ])}
        media={{}}
        skillsById={skillsById}
      />,
    );

    // Accessible name comes from the skill title — no filename-stem guessing.
    // 'Vercel' carries a dark override → two imgs (CSS-swapped) share the alt.
    expect(screen.getAllByAltText('Vercel')).toHaveLength(2);
    expect(screen.getByAltText('TypeScript')).toBeInTheDocument();

    // Order follows skill_refs: the Vercel chip precedes the TypeScript chip.
    const chipList = container.querySelector(`.${styles.techIcons}`)!;
    const chipItems = chipList.querySelectorAll(':scope > li');
    expect(chipItems).toHaveLength(2);
    expect(chipItems[0].querySelector('img')).toHaveAttribute('alt', 'Vercel');
    expect(chipItems[1].querySelector('img')).toHaveAttribute('alt', 'TypeScript');
  });

  it('picks the theme-aware icon: both light+dark imgs with an override, one without', () => {
    const { container } = render(
      <PortfolioSection
        section={portfolioSection([
          project('p1', { skill_refs: ['sk-vercel', 'sk-ts'], tech_icons: [] }),
        ])}
        media={{}}
        skillsById={skillsById}
      />,
    );

    const srcs = Array.from(container.querySelectorAll('img')).map((img) =>
      img.getAttribute('src'),
    );
    // Vercel ships both variants for the CSS-driven live theme swap...
    expect(srcs).toContain('https://cdn.example.com/icons/vercel-light.svg');
    expect(srcs).toContain('https://cdn.example.com/icons/vercel-dark.svg');
    // ...TypeScript has no override, so exactly one img.
    expect(srcs).toContain('https://cdn.example.com/icons/ts.svg');
    expect(srcs).toHaveLength(3);

    // The dual variants ship the shared SkillIcon swap classes (CSS, not JS).
    const vercelImgs = Array.from(container.querySelectorAll('img')).filter((img) =>
      (img.getAttribute('src') ?? '').includes('vercel'),
    );
    const classes = vercelImgs.map((img) => img.className).join(' ');
    expect(classes).toMatch(/iconLight/);
    expect(classes).toMatch(/iconDark/);
  });

  it('silently skips an unresolvable ref (console.warn at most, no warning UI)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = render(
      <PortfolioSection
        section={portfolioSection([
          project('p1', {
            skill_refs: ['sk-ts', 'sk-nope'],
            tech_icons: [],
          }),
        ])}
        media={{}}
        skillsById={skillsById}
      />,
    );

    // Only the resolvable ref renders a chip; the missing one is dropped.
    // (Count imgs, not .techIcon — the skill-refs path renders bare SkillIcons;
    // .techIcon belongs to the legacy raw-URL path only.)
    expect(screen.getByAltText('TypeScript')).toBeInTheDocument();
    expect(container.querySelectorAll('img')).toHaveLength(1);
    // No warning UI — a console.warn is the loudest it gets.
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('sk-nope'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not fall back to tech_icons when skill_refs is present (a v1.8 item ignores legacy icons)', () => {
    render(
      <PortfolioSection
        section={portfolioSection([
          project('p1', {
            skill_refs: ['sk-ts'],
            tech_icons: ['https://media.benkile.com/react.svg'],
          }),
        ])}
        media={{}}
        skillsById={skillsById}
      />,
    );

    expect(screen.getByAltText('TypeScript')).toBeInTheDocument();
    // The legacy URL is not rendered — presence of skill_refs is the discriminator.
    expect(
      screen.queryByAltText('react logo'),
    ).not.toBeInTheDocument();
  });

  it('renders no chips (and does not crash) for an item whose skill_refs is empty', () => {
    const { container } = render(
      <PortfolioSection
        section={portfolioSection([
          project('p1', { skill_refs: [], tech_icons: [] }),
        ])}
        media={{}}
        skillsById={skillsById}
      />,
    );

    expect(container.querySelectorAll(`.${styles.techIcon}`)).toHaveLength(0);
  });

  it('resolves refs that point at skills on OTHER pages (whole-document index)', () => {
    // Build the same index ContentPage threads down, from a multi-page document.
    const index = buildSkillsIndex(fixtureSkillRefsDocument);
    const portfolio = fixtureSkillRefsDocument.pages[0].sections.find(
      (s) => s.type === 'portfolio',
    )!;

    render(<PortfolioSection section={portfolio} media={{}} skillsById={index} />);

    // sk-ts + sk-vercel live on `home`; sk-docker lives on the `tools` page — all
    // three resolve. sk-missing (also in skill_refs) is skipped.
    expect(screen.getByAltText('TypeScript')).toBeInTheDocument();
    expect(screen.getAllByAltText('Vercel')).toHaveLength(2);
    expect(screen.getByAltText('Docker')).toBeInTheDocument();
  });
});

describe('PortfolioSection — Post Refs v1.14', () => {
  function renderPortfolio(...items: SectionItem[]) {
    return render(
      <MemoryRouter>
        <PortfolioSection section={portfolioSection(items)} media={{}} />
      </MemoryRouter>,
    );
  }

  it('renders a "From the blog" list of ordered internal links to /blog/<slug>', () => {
    renderPortfolio(
      project('p1', {
        posts: [
          { id: 'po-1', slug: 'shipping-fast', title: 'Shipping fast', blog: null },
          { id: 'po-2', slug: 'on-testing', title: 'On testing', blog: null },
        ],
      }),
    );

    // The row is a nav-less list with an accessible label (§A11y).
    const list = screen.getByRole('list', { name: 'Related blog posts' });
    // Visible "From the blog" header sits above the list.
    expect(screen.getByText('From the blog')).toBeInTheDocument();

    // Author order is preserved and each entry routes to /blog/<slug>.
    const links = within(list).getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveTextContent('Shipping fast');
    expect(links[0]).toHaveAttribute('href', '/blog/shipping-fast');
    expect(links[1]).toHaveTextContent('On testing');
    expect(links[1]).toHaveAttribute('href', '/blog/on-testing');
  });

  it('uses client-side routing — internal links never open a new tab', () => {
    renderPortfolio(
      project('p1', {
        posts: [{ id: 'po-1', slug: 'hello', title: 'Hello', blog: null }],
      }),
    );

    const link = screen.getByRole('link', { name: 'Hello' });
    // react-router Link → a relative in-app href, no target/rel escape hatch.
    expect(link).toHaveAttribute('href', '/blog/hello');
    expect(link).not.toHaveAttribute('target');
    expect(link).not.toHaveAttribute('rel');
  });

  it('shows the blog name as a dim mono prefix when a post has a blog', () => {
    const { container } = renderPortfolio(
      project('p1', {
        posts: [
          {
            id: 'po-1',
            slug: 'controllers',
            title: 'Controllers',
            blog: { slug: 'code', name: 'Code' },
          },
          { id: 'po-2', slug: 'no-blog', title: 'Orphan', blog: null },
        ],
      }),
    );

    // The blog-carrying post reads "Code — Controllers"; the prefix is its own
    // mono span so it can be dimmed apart from the title.
    const withBlog = screen.getByRole('link', { name: 'Code — Controllers' });
    expect(withBlog).toHaveClass(styles.postLink);
    expect(within(withBlog).getByText('Code —')).toHaveClass(styles.postBlog);

    // A blog-less post carries no prefix span at all.
    const orphan = screen.getByRole('link', { name: 'Orphan' });
    expect(orphan.querySelector(`.${styles.postBlog}`)).toBeNull();

    // Exactly one prefix span across the panel.
    expect(container.querySelectorAll(`.${styles.postBlog}`)).toHaveLength(1);
  });

  it('renders nothing for an item whose posts array is empty', () => {
    renderPortfolio(project('p1', { posts: [] }));

    expect(screen.queryByText('From the blog')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('list', { name: 'Related blog posts' }),
    ).not.toBeInTheDocument();
  });

  it('renders nothing when posts is absent (pre-v1.14 payload)', () => {
    renderPortfolio(project('p1'));

    expect(screen.queryByText('From the blog')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('list', { name: 'Related blog posts' }),
    ).not.toBeInTheDocument();
  });
});
