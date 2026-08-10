import { afterEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import Gauge from './Gauge';
import {
  MockIntersectionObserver,
  installIntersectionObserver,
  mockReducedMotion,
} from '../../test/motion';

/** Read the value arc's dash geometry from its inline style. */
const arc = (container: HTMLElement) =>
  container.querySelector('[data-role="value"]') as SVGPathElement;
const dashArray = (container: HTMLElement) =>
  parseFloat(arc(container).style.strokeDasharray);
const dashOffset = (container: HTMLElement) =>
  parseFloat(arc(container).style.strokeDashoffset);

describe('Gauge', () => {
  const restores: Array<() => void> = [];
  afterEach(() => {
    while (restores.length) restores.pop()!();
  });

  it('marks the SVG decorative and exposes a visually-hidden reading', () => {
    restores.push(mockReducedMotion(true), installIntersectionObserver());

    const { container } = render(
      <Gauge value={12} label="CPU utilization" unit="%" />,
    );
    expect(container.querySelector('svg')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    expect(screen.getByText('CPU utilization 12%')).toBeInTheDocument();
  });

  it('formats raw metric doubles compactly by default, and via a custom format', () => {
    restores.push(mockReducedMotion(true), installIntersectionObserver());

    // A raw CloudWatch double must never render verbatim (it overflows the dial).
    const raw = render(
      <Gauge value={4.131730772880646} label="RDS CPU" unit="%" />,
    );
    expect(raw.getByText('RDS CPU 4.1%')).toBeInTheDocument();
    expect(raw.container.textContent).not.toContain('4.131730772880646');

    const custom = render(
      <Gauge value={92.55} label="Memory" unit="%" format={(v) => String(Math.round(v))} />,
    );
    expect(custom.getByText('Memory 93%')).toBeInTheDocument();
  });

  it('clamps out-of-range values for both readout and arc', () => {
    restores.push(mockReducedMotion(true), installIntersectionObserver());

    // Over max: readout pins to max and the arc fills completely (offset ~0).
    const over = render(<Gauge value={140} max={100} label="Load" unit="%" />);
    act(() => MockIntersectionObserver.last!.triggerAll(true));
    expect(over.getByText('Load 100%')).toBeInTheDocument();
    expect(dashOffset(over.container)).toBeCloseTo(0, 2);

    // Below zero: readout pins to 0 and the arc is empty (offset === length).
    const under = render(<Gauge value={-30} max={100} label="Dip" unit="%" />);
    act(() => MockIntersectionObserver.last!.triggerAll(true));
    expect(under.getByText('Dip 0%')).toBeInTheDocument();
    expect(dashOffset(under.container)).toBeCloseTo(dashArray(under.container), 2);
  });

  it('sets the sweep proportional to value / max', () => {
    restores.push(mockReducedMotion(true), installIntersectionObserver());

    // A half-full gauge hides half the arc: offset ≈ length / 2.
    const { container } = render(<Gauge value={30} max={60} label="Half" />);
    act(() => MockIntersectionObserver.last!.triggerAll(true));
    expect(dashOffset(container)).toBeCloseTo(dashArray(container) / 2, 2);
  });

  it('sweeps the arc in from empty on first reveal', () => {
    restores.push(mockReducedMotion(false), installIntersectionObserver());

    const { container } = render(<Gauge value={75} max={100} label="CPU" />);
    // Before the gauge scrolls into view the whole arc is hidden.
    expect(dashOffset(container)).toBeCloseTo(dashArray(container), 2);

    act(() => MockIntersectionObserver.last!.triggerAll(true));
    // Revealed: 75% shown, so a quarter of the arc remains hidden.
    expect(dashOffset(container)).toBeCloseTo(dashArray(container) * 0.25, 2);
  });

  it('ignores an OS reduced-motion preference — the sweep still runs (owner decision)', () => {
    restores.push(mockReducedMotion(true), installIntersectionObserver());

    const { container } = render(<Gauge value={40} max={100} label="Mem" />);
    // The reveal wiring arms exactly as in the default case.
    expect(MockIntersectionObserver.instances).toHaveLength(1);
    act(() => MockIntersectionObserver.last!.triggerAll(true));
    expect(dashOffset(container)).toBeCloseTo(dashArray(container) * 0.6, 2);
  });
});
