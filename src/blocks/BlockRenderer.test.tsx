import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import BlockRenderer from './BlockRenderer';
import { fixturePost } from '../test/fixtures';

// The code block would otherwise dynamically import the real highlighter; mock
// it so these tests stay offline and deterministic. The plain-text fallback is
// what renders when it resolves to null.
vi.mock('./highlight', () => ({
  highlightCode: vi.fn().mockResolvedValue(null),
}));

describe('BlockRenderer — the block pipeline (spec §3.7)', () => {
  it('renders every one of the eight block types from a fixture body', () => {
    const { container } = render(
      <BlockRenderer body={fixturePost.body} media={fixturePost.media ?? {}} />,
    );

    // heading
    expect(
      screen.getByRole('heading', { name: 'A heading', level: 2 }),
    ).toBeInTheDocument();

    // paragraph with inline markdown
    expect(container.querySelector('p')).toHaveTextContent(
      'Some bold, some italic, some code, and a link.',
    );
    expect(container.querySelector('strong')).toHaveTextContent('bold');

    // code — filename header + copy control + raw code text
    expect(screen.getByText('src/answer.ts')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /copy/i }),
    ).toBeInTheDocument();
    expect(container.querySelector('pre')).toHaveTextContent(
      'const answer: number = 42;',
    );

    // media — resolved from the post media map, with caption
    const img = screen.getByAltText('An architecture diagram');
    expect(img).toHaveAttribute(
      'src',
      'https://media.benkile.com/media/posts/diagram.png',
    );
    expect(screen.getByText('The diagram')).toBeInTheDocument();

    // list
    expect(container.querySelector('ul')).toBeInTheDocument();
    expect(screen.getByText('First item')).toBeInTheDocument();

    // quote with attribution
    expect(container.querySelector('blockquote')).toHaveTextContent(
      'A quotable line.',
    );
    expect(screen.getByText('Someone')).toBeInTheDocument();

    // links — rendered through the shared LinkList
    const link = screen.getByRole('link', { name: 'Source' });
    expect(link).toHaveAttribute('href', 'https://github.com/example/repo');

    // divider
    expect(container.querySelector('hr')).toBeInTheDocument();
  });

  it('renders nothing (and does not crash) for an unknown block type', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const body = [
      { type: 'paragraph', text: 'kept' },
      { type: 'not-a-real-block' },
    ] as unknown as typeof fixturePost.body;

    const { container } = render(<BlockRenderer body={body} media={{}} />);

    expect(screen.getByText('kept')).toBeInTheDocument();
    // Only the paragraph rendered; the unknown block produced no element.
    expect(container.querySelectorAll('p')).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Unknown block type "not-a-real-block"'),
    );
    warn.mockRestore();
  });
});
