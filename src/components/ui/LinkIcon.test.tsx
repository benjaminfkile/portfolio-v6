import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import LinkIcon from './LinkIcon';
import type { LinkType } from '../../types/content';

const ALL_TYPES: LinkType[] = [
  'repo',
  'prod',
  'dev',
  'docs',
  'demo',
  'package',
  'article',
  'other',
];

describe('LinkIcon', () => {
  it.each(ALL_TYPES)('renders an aria-hidden inline SVG for %s', (type) => {
    const { container } = render(<LinkIcon type={type} />);
    const svg = container.querySelector('svg')!;
    expect(svg).toBeInTheDocument();
    // The chip label carries the meaning — the icon adds no a11y noise.
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('focusable', 'false');
    // Sized to line-height so it scales with the chip's text.
    expect(svg).toHaveAttribute('width', '1em');
    expect(svg).toHaveAttribute('height', '1em');
  });

  it('renders a distinct path for each link type (icons are not aliases)', () => {
    // Two `type`s share the external-link glyph deliberately (prod/dev/other);
    // every other pair should draw a different shape.
    const shapes = new Map<LinkType, string>();
    for (const type of ALL_TYPES) {
      const { container } = render(<LinkIcon type={type} />);
      shapes.set(type, container.querySelector('svg')!.innerHTML);
    }
    // repo is the GitHub mark — unique.
    expect(shapes.get('repo')).not.toBe(shapes.get('docs'));
    expect(shapes.get('repo')).not.toBe(shapes.get('demo'));
    expect(shapes.get('repo')).not.toBe(shapes.get('article'));
    expect(shapes.get('repo')).not.toBe(shapes.get('package'));
    expect(shapes.get('repo')).not.toBe(shapes.get('other'));
    // docs / demo / package / article each render their own glyph.
    expect(shapes.get('docs')).not.toBe(shapes.get('demo'));
    expect(shapes.get('docs')).not.toBe(shapes.get('package'));
    expect(shapes.get('docs')).not.toBe(shapes.get('article'));
    expect(shapes.get('demo')).not.toBe(shapes.get('package'));
    expect(shapes.get('demo')).not.toBe(shapes.get('article'));
    expect(shapes.get('package')).not.toBe(shapes.get('article'));
  });

  it('draws the GitHub mark for repo (a filled path, brand silhouette)', () => {
    const { container } = render(<LinkIcon type="repo" />);
    const svg = container.querySelector('svg')!;
    // Rendered as a single filled path so it inherits currentColor.
    const path = svg.querySelector('path')!;
    expect(path).toHaveAttribute('fill', 'currentColor');
    // The 16×16 GitHub viewBox is the canonical size for the mark.
    expect(svg).toHaveAttribute('viewBox', '0 0 16 16');
  });

  it('inherits colour via currentColor (no hard-coded fill on the container)', () => {
    const { container } = render(<LinkIcon type="docs" />);
    const svg = container.querySelector('svg')!;
    // Stroke variants use currentColor on the SVG itself.
    expect(svg.getAttribute('stroke')).toBe('currentColor');
  });
});
