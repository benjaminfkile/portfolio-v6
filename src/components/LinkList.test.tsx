import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import LinkList from './LinkList';
import type { Link } from '../types/content';

function makeLinks(specs: Array<[Link['type'], string]>): Link[] {
  return specs.map(([type, label], i) => ({
    type,
    label,
    url: `https://example.com/${label}-${i}`,
  }));
}

describe('LinkList', () => {
  it('renders nothing for an empty array', () => {
    const { container } = render(<LinkList links={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a flat row (no group headings) at or below the ~4 threshold', () => {
    render(
      <LinkList
        links={makeLinks([
          ['repo', 'api'],
          ['repo', 'web'],
          ['prod', 'Live'],
          ['docs', 'Docs'],
        ])}
      />,
    );

    // Four anchors, one list, and no grouping headings.
    expect(screen.getAllByRole('link')).toHaveLength(4);
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('groups by type under headings once past the threshold', () => {
    render(
      <LinkList
        links={makeLinks([
          ['repo', 'api'],
          ['repo', 'web'],
          ['prod', 'Live'],
          ['dev', 'Staging'],
          ['docs', 'Docs'],
        ])}
      />,
    );

    // Five links now regroup by type; each distinct type gets a heading.
    expect(screen.getByRole('heading', { name: 'Repositories' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Live' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Development' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Docs' })).toBeInTheDocument();

    // All five anchors are still present.
    expect(screen.getAllByRole('link')).toHaveLength(5);
  });

  it('preserves first-seen order of the groups', () => {
    render(
      <LinkList
        links={makeLinks([
          ['docs', 'Docs'],
          ['repo', 'api'],
          ['repo', 'web'],
          ['prod', 'Live'],
          ['repo', 'infra'],
        ])}
      />,
    );

    const headings = screen.getAllByRole('heading').map((h) => h.textContent);
    // 'docs' appeared first, then 'repo', then 'prod'.
    expect(headings).toEqual(['Docs', 'Repositories', 'Live']);
  });

  it('opens every link in a new tab with rel="noopener noreferrer"', () => {
    render(
      <LinkList
        links={makeLinks([
          ['repo', 'api'],
          ['prod', 'Live'],
        ])}
      />,
    );

    for (const anchor of screen.getAllByRole('link')) {
      expect(anchor).toHaveAttribute('target', '_blank');
      expect(anchor).toHaveAttribute('rel', 'noopener noreferrer');
    }
  });
});
