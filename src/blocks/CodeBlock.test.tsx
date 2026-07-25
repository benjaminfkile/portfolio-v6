import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import CodeBlock from './CodeBlock';
import type { Block } from '../types/content';
import * as highlight from './highlight';

// Control the highlighter directly rather than loading Shiki in jsdom.
vi.mock('./highlight', () => ({
  highlightCode: vi.fn().mockResolvedValue(null),
}));

const highlightCode = vi.mocked(highlight.highlightCode);

// Defaults to a non-allowlisted language so tests that don't exercise
// highlighting never trigger the (async) highlighter import — keeping each test
// isolated. The highlighting test opts in with an allowlisted language.
function codeBlock(overrides: Partial<Extract<Block, { type: 'code' }>> = {}) {
  const block: Extract<Block, { type: 'code' }> = {
    type: 'code',
    language: 'plaintext',
    code: 'const answer = 42;',
    ...overrides,
  };
  return block;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('CodeBlock (spec §3.7)', () => {
  it('renders the raw code as plain text and shows an optional filename header', () => {
    const block = codeBlock({ filename: 'src/app.ts' });
    render(<CodeBlock block={block} media={{}} />);

    expect(screen.getByText('src/app.ts')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy/i })).toBeInTheDocument();
    expect(document.querySelector('pre')).toHaveTextContent('const answer = 42;');
  });

  it('copies the raw stored string via the Clipboard API and shows a transient confirmation', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    const block = codeBlock({ code: 'RAW\ncontent\t42' });
    render(<CodeBlock block={block} media={{}} />);

    const button = screen.getByRole('button', { name: /copy/i });
    button.click();

    // The raw stored string is copied — never the DOM's text content.
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith('RAW\ncontent\t42');

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument(),
    );

    vi.unstubAllGlobals();
  });

  it('falls back to selecting the block text when the Clipboard API is unavailable', () => {
    vi.stubGlobal('navigator', {});
    const addRange = vi.fn();
    const removeAllRanges = vi.fn();
    vi.spyOn(window, 'getSelection').mockReturnValue({
      addRange,
      removeAllRanges,
    } as unknown as Selection);

    render(<CodeBlock block={codeBlock()} media={{}} />);
    screen.getByRole('button', { name: /copy/i }).click();

    // No clipboard write attempted; the text is selected instead.
    expect(removeAllRanges).toHaveBeenCalled();
    expect(addRange).toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it('does not invoke the highlighter for a language outside the allowlist (renders plain text)', async () => {
    render(
      <CodeBlock block={codeBlock({ language: 'brainfuck', code: '+[.]' })} media={{}} />,
    );

    expect(document.querySelector('pre')).toHaveTextContent('+[.]');
    // The unknown language short-circuits before the highlighter is loaded.
    await waitFor(() => expect(highlightCode).not.toHaveBeenCalled());
  });

  it('dynamically loads the highlighter for an allowlisted language and renders coloured tokens', async () => {
    highlightCode.mockResolvedValueOnce([
      [
        { content: 'const', color: '#d73a49' },
        { content: ' answer = 42;', color: '#24292e' },
      ],
    ]);

    render(<CodeBlock block={codeBlock({ language: 'ts' })} media={{}} />);

    await waitFor(() =>
      expect(highlightCode).toHaveBeenCalledWith('const answer = 42;', 'ts'),
    );
    await waitFor(() => {
      const coloured = document.querySelector('pre code span[style]');
      expect(coloured).not.toBeNull();
      expect(coloured).toHaveTextContent('const');
    });
  });
});
