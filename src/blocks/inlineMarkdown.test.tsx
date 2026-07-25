import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { renderInline } from './inlineMarkdown';

/** Render a run of inline markdown into a container for querying. */
function renderMd(text: string) {
  return render(<p>{renderInline(text)}</p>);
}

describe('renderInline — constrained markdown subset (spec §3.7)', () => {
  it('renders **bold** as <strong>', () => {
    const { container } = renderMd('a **bold** word');
    const strong = container.querySelector('strong');
    expect(strong).not.toBeNull();
    expect(strong).toHaveTextContent('bold');
  });

  it('renders *italic* and _italic_ as <em>', () => {
    const { container } = renderMd('an *emphatic* and _also_ word');
    const ems = container.querySelectorAll('em');
    expect(ems).toHaveLength(2);
    expect(ems[0]).toHaveTextContent('emphatic');
    expect(ems[1]).toHaveTextContent('also');
  });

  it('renders `inline code` as <code> without re-parsing its contents', () => {
    const { container } = renderMd('call `foo(**not bold**)` please');
    const code = container.querySelector('code');
    expect(code).not.toBeNull();
    // The asterisks inside code are literal — no <strong> is produced.
    expect(code).toHaveTextContent('foo(**not bold**)');
    expect(container.querySelector('strong')).toBeNull();
  });

  it('renders an http(s) [link](url) as an off-site anchor', () => {
    const { container } = renderMd('see [the site](https://example.com/x)');
    const anchor = container.querySelector('a');
    expect(anchor).not.toBeNull();
    expect(anchor).toHaveAttribute('href', 'https://example.com/x');
    expect(anchor).toHaveAttribute('target', '_blank');
    expect(anchor).toHaveAttribute('rel', 'noopener noreferrer');
    expect(anchor).toHaveTextContent('the site');
  });

  it('renders a javascript: link as inert label text, never an anchor', () => {
    const { container } = renderMd('click [here](javascript:alert-1) now');
    // No anchor is ever created for an unsafe protocol…
    expect(container.querySelector('a')).toBeNull();
    // …and the label survives as inert text.
    expect(container).toHaveTextContent('here');
  });

  it('renders a data: link as inert label text, never an anchor', () => {
    const { container } = renderMd('[x](data:text/html,<script>alert(1)</script>)');
    expect(container.querySelector('a')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
  });

  it('renders raw HTML as inert visible text — no elements are created', () => {
    const hostile = '<script>alert(1)</script> and <img src=x onerror=alert(1)>';
    const { container } = renderMd(hostile);
    // The markup never becomes real DOM…
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    // …it is shown verbatim as text instead.
    expect(container).toHaveTextContent(hostile);
  });

  it('leaves an unterminated single marker as literal text', () => {
    // Each case has exactly one dangling marker with no partner to close it.
    const star = renderMd('50 * 3 = 150');
    expect(star.container.querySelector('em')).toBeNull();
    expect(star.container).toHaveTextContent('50 * 3 = 150');

    const tick = renderMd('run `cmd to start');
    expect(tick.container.querySelector('code')).toBeNull();
    expect(tick.container).toHaveTextContent('run `cmd to start');

    const bold = renderMd('a ** with no close');
    expect(bold.container.querySelector('strong')).toBeNull();
    expect(bold.container.querySelector('em')).toBeNull();
    expect(bold.container).toHaveTextContent('a ** with no close');
  });
});

/**
 * A structural guarantee for acceptance criterion 1454: the whole `src` tree
 * must never use `dangerouslySetInnerHTML`. This is the one API that could
 * reintroduce an HTML render path, so we assert its total absence.
 */
describe('no dangerouslySetInnerHTML anywhere in src (spec §3.7)', () => {
  function walk(dir: string): string[] {
    const files: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) files.push(...walk(full));
      else if (/\.(tsx?|jsx?)$/.test(entry)) files.push(full);
    }
    return files;
  }

  it('does not appear as a usage in any source file', () => {
    const root = join(process.cwd(), 'src');
    // Match the actual JSX prop usage (an assignment or object key), not the
    // identifier appearing in prose or comments.
    const usage = /dangerouslySetInnerHTML\s*[=:]/;
    const offenders = walk(root).filter((file) =>
      usage.test(readFileSync(file, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});
