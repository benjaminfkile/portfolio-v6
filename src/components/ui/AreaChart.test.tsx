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
    expect(container.querySelectorAll('[data-role="series"]')).toHaveLength(2);
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
