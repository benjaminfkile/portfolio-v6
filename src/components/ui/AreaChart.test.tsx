import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import AreaChart from './AreaChart';
import type { AreaPoint } from './AreaChart';
import { mockReducedMotion } from '../../test/motion';

const three: AreaPoint[] = [
  { t: 0, v: 10 },
  { t: 1, v: 30 },
  { t: 2, v: 20 },
];

/** Count `M`/`L` vertices in a path's `d` — one per coordinate pair. */
const vertexCount = (d: string) => (d.match(/[ML]/g) ?? []).length;

describe('AreaChart', () => {
  const restores: Array<() => void> = [];
  afterEach(() => {
    while (restores.length) restores.pop()!();
  });

  it('marks the SVG decorative and renders the visually-hidden summary', () => {
    const { container } = render(
      <AreaChart points={three} summary="Requests over the last 3 hours" />,
    );
    expect(container.querySelector('svg')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    expect(
      screen.getByText('Requests over the last 3 hours'),
    ).toBeInTheDocument();
  });

  it('builds a line path with one vertex per point', () => {
    const { container } = render(
      <AreaChart points={three} summary="three points" />,
    );
    const line = container.querySelector('[data-role="line"]') as SVGPathElement;
    expect(line).toBeTruthy();
    expect(vertexCount(line.getAttribute('d')!)).toBe(3);

    // The area fill closes the same 3 vertices down to the baseline (+2 corners).
    const area = container.querySelector('[data-role="area"]') as SVGPathElement;
    expect(vertexCount(area.getAttribute('d')!)).toBe(5);
  });

  it('emphasises the latest point with an amber dot at the newest sample', () => {
    const { container } = render(
      <AreaChart points={three} summary="latest 20" />,
    );
    const dot = container.querySelector('[data-role="dot"]') as SVGCircleElement;
    expect(dot).toBeTruthy();
    // Latest sample is the highest x (rightmost) in the plot.
    const cx = parseFloat(dot.getAttribute('cx')!);
    expect(cx).toBeGreaterThan(90);
  });

  it('renders min/max as mono labels from the data domain', () => {
    render(<AreaChart points={three} summary="min max" />);
    expect(screen.getByText('30')).toBeInTheDocument(); // max
    expect(screen.getByText('10')).toBeInTheDocument(); // min
  });

  it('draws a second series in place, with no area fill for it', () => {
    const series: AreaPoint[] = [
      { t: 0, v: 5 },
      { t: 1, v: 8 },
      { t: 2, v: 6 },
    ];
    const { container } = render(
      <AreaChart points={three} series={series} summary="two series" />,
    );
    const secondary = container.querySelector(
      '[data-role="series"]',
    ) as SVGPathElement;
    expect(secondary).toBeTruthy();
    expect(vertexCount(secondary.getAttribute('d')!)).toBe(3);
    expect(secondary).toHaveAttribute('fill', 'none');
    // Exactly one area fill — the secondary series contributes none.
    expect(container.querySelectorAll('[data-role="area"]')).toHaveLength(1);
  });

  it('draws every overlay when series is an array of series (3-metric widgets)', () => {
    const overlayA: AreaPoint[] = [
      { t: 0, v: 5 },
      { t: 1, v: 8 },
    ];
    const overlayB: AreaPoint[] = [
      { t: 0, v: 500 },
      { t: 1, v: 540 },
    ];
    const { container } = render(
      <AreaChart points={three} series={[overlayA, overlayB]} summary="three series" />,
    );
    const overlays = container.querySelectorAll('[data-role="series"]');
    expect(overlays).toHaveLength(2);
    // Overlays are keyed so CSS can differentiate them (solid vs dashed) and
    // the legend swatches can mirror the actual strokes.
    expect(overlays[0]).toHaveAttribute('data-series', '1');
    expect(overlays[1]).toHaveAttribute('data-series', '2');
    expect(container.querySelectorAll('[data-role="area"]')).toHaveLength(1);
    // Domain spans ALL series: max label comes from the tallest overlay.
    expect(screen.getByText('540')).toBeInTheDocument();
  });

  it('handles a single point by drawing only the latest dot (no line)', () => {
    const { container } = render(
      <AreaChart points={[{ t: 0, v: 42 }]} summary="one point" />,
    );
    expect(container.querySelector('[data-role="line"]')).toBeNull();
    expect(container.querySelector('[data-role="area"]')).toBeNull();
    expect(container.querySelector('[data-role="dot"]')).toBeTruthy();
    expect(screen.getByText('one point')).toBeInTheDocument();
  });

  it('handles an empty series without crashing', () => {
    const { container } = render(<AreaChart points={[]} summary="no data" />);
    expect(container.querySelector('[data-role="dot"]')).toBeNull();
    expect(container.querySelector('[data-role="line"]')).toBeNull();
    expect(screen.getByText('no data')).toBeInTheDocument();
  });

  it('maps x by time when a domain is given (gaps read as spacing, not compression)', () => {
    // Two samples an hour apart within a 24h domain sit near the left edge.
    const domain: [number, number] = [0, 24 * 60];
    const timed: AreaPoint[] = [
      { t: 0, v: 10 },
      { t: 60, v: 20 },
    ];
    const { container } = render(
      <AreaChart points={timed} domain={domain} summary="timed" />,
    );
    const line = container.querySelector('[data-role="line"]') as SVGPathElement;
    const xs = [...line.getAttribute('d')!.matchAll(/[ML] ([\d.]+)/g)].map((m) =>
      parseFloat(m[1]),
    );
    // First at the very left; second only ~1/24 of the width in — not the far right.
    expect(xs[0]).toBeLessThan(5);
    expect(xs[1]).toBeLessThan(12);
  });

  it('draws a playhead cursor line and dot, and drops the latest dot', () => {
    const domain: [number, number] = [0, 100];
    const { container } = render(
      <AreaChart
        points={three.map((p, i) => ({ t: i * 50, v: p.v }))}
        domain={domain}
        cursor={{ t: 50, v: 30 }}
        summary="cursor"
      />,
    );
    const cursor = container.querySelector('[data-role="cursor"]');
    expect(cursor).toBeTruthy();
    // The cursor at t=50 sits mid-plot.
    expect(parseFloat(cursor!.getAttribute('x1')!)).toBeGreaterThan(45);
    // The emphasised dot follows the playhead, not the newest sample.
    expect(container.querySelector('[data-role="cursor-dot"]')).toBeTruthy();
    expect(container.querySelector('[data-role="dot"]')).toBeNull();
  });

  it('draws the cursor line but no dot at a gap (null value)', () => {
    const domain: [number, number] = [0, 100];
    const { container } = render(
      <AreaChart
        points={three.map((p, i) => ({ t: i * 50, v: p.v }))}
        domain={domain}
        cursor={{ t: 20, v: null }}
        summary="gap cursor"
      />,
    );
    expect(container.querySelector('[data-role="cursor"]')).toBeTruthy();
    expect(container.querySelector('[data-role="cursor-dot"]')).toBeNull();
  });

  it('renders its final static geometry under reduced motion', () => {
    restores.push(mockReducedMotion(true));
    const { container } = render(
      <AreaChart points={three} summary="static" />,
    );
    // No reveal/observer wiring: the full line is present immediately.
    const line = container.querySelector('[data-role="line"]') as SVGPathElement;
    expect(vertexCount(line.getAttribute('d')!)).toBe(3);
  });
});
