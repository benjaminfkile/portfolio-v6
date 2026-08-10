import { afterEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { useRevealOnce } from './useRevealOnce';
import {
  MockIntersectionObserver,
  installIntersectionObserver,
  mockReducedMotion,
  removeIntersectionObserver,
} from '../test/motion';

function Probe() {
  const [ref, revealed] = useRevealOnce<HTMLDivElement>();
  return <div ref={ref} data-testid="probe" data-revealed={String(revealed)} />;
}

const revealed = () =>
  screen.getByTestId('probe').getAttribute('data-revealed');

describe('useRevealOnce', () => {
  const restores: Array<() => void> = [];
  afterEach(() => {
    while (restores.length) restores.pop()!();
  });

  it('starts hidden and reveals once when the element enters the viewport', () => {
    restores.push(mockReducedMotion(false), installIntersectionObserver());

    render(<Probe />);
    expect(revealed()).toBe('false');

    const observer = MockIntersectionObserver.last!;
    expect(observer.observe).toHaveBeenCalledTimes(1);

    act(() => observer.triggerAll(true));
    expect(revealed()).toBe('true');
    // Fires once: the observer disconnects on the first intersection.
    expect(observer.disconnect).toHaveBeenCalled();
  });

  it('ignores a non-intersecting entry and stays hidden', () => {
    restores.push(mockReducedMotion(false), installIntersectionObserver());

    render(<Probe />);
    const observer = MockIntersectionObserver.last!;

    act(() => observer.triggerAll(false));
    expect(revealed()).toBe('false');
    expect(observer.disconnect).not.toHaveBeenCalled();
  });

  it('ignores an OS reduced-motion preference — reveal still runs on view (owner decision)', () => {
    restores.push(mockReducedMotion(true), installIntersectionObserver());

    render(<Probe />);
    // Motion is unconditional: the observer arms exactly as in the default case.
    expect(revealed()).toBe('false');
    expect(MockIntersectionObserver.instances).toHaveLength(1);
    act(() => MockIntersectionObserver.last?.triggerAll());
    expect(revealed()).toBe('true');
  });

  it('reveals immediately when IntersectionObserver is unavailable', () => {
    restores.push(mockReducedMotion(false), removeIntersectionObserver());

    render(<Probe />);
    expect(revealed()).toBe('true');
  });
});
