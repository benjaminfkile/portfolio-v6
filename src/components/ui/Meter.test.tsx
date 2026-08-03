import { afterEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import Meter from './Meter';
import {
  MockIntersectionObserver,
  installIntersectionObserver,
  mockReducedMotion,
} from '../../test/motion';

const fillWidth = () =>
  (screen.getByRole('meter').firstElementChild as HTMLElement).style.width;

describe('Meter', () => {
  const restores: Array<() => void> = [];
  afterEach(() => {
    while (restores.length) restores.pop()!();
  });

  it('exposes meter semantics with a clamped value', () => {
    restores.push(mockReducedMotion(false), installIntersectionObserver());

    render(<Meter value={140} label="TypeScript" />);
    const meter = screen.getByRole('meter', { name: 'TypeScript' });
    expect(meter).toHaveAttribute('aria-valuenow', '100');
    expect(meter).toHaveAttribute('aria-valuemin', '0');
    expect(meter).toHaveAttribute('aria-valuemax', '100');

    render(<Meter value={-20} label="Rust" />);
    expect(screen.getByRole('meter', { name: 'Rust' })).toHaveAttribute(
      'aria-valuenow',
      '0',
    );
  });

  it('animates the fill from zero on first reveal', () => {
    restores.push(mockReducedMotion(false), installIntersectionObserver());

    render(<Meter value={75} label="React" />);
    // Before the element scrolls into view the fill sits at zero width.
    expect(fillWidth()).toBe('0%');

    act(() => MockIntersectionObserver.last!.triggerAll(true));
    expect(fillWidth()).toBe('75%');
  });

  it('renders fully filled and static under reduced motion (no observer)', () => {
    restores.push(mockReducedMotion(true), installIntersectionObserver());

    render(<Meter value={60} label="Node" />);
    expect(fillWidth()).toBe('60%');
    expect(MockIntersectionObserver.instances).toHaveLength(0);
  });

  it('renders a mono tabular numeric readout when asked', () => {
    restores.push(mockReducedMotion(true), installIntersectionObserver());

    render(<Meter value={42} label="Go" showLabel showValue />);
    expect(screen.getByText('Go')).toBeInTheDocument();
    expect(screen.getByText('42%')).toBeInTheDocument();
  });
});
