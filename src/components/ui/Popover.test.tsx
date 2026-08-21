import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { fireEvent } from '@testing-library/dom';
import Popover from './Popover';

/**
 * Popover primitive tests (task 129). Covers the two interaction models - 
 * hover-capable devices open on hover with an intent delay and close on
 * mouseleave/blur, touch devices open on click and close on outside click - 
 * plus Escape handling and the focus-return-to-trigger a11y contract.
 *
 * jsdom ships no matchMedia at all, so each test installs a stub that reports
 * matches for whichever query the code under test asks about. `(hover: hover)
 * and (pointer: fine)` returns the requested value; `(prefers-reduced-motion)`
 * always reports `false` here (motion allowed, matching the site's fixed hook
 * - see prefersReducedMotion.ts).
 *
 * NOTE - @testing-library/dom fires `mouseover`/`mouseout` (which bubble) for
 * the React synthetic `mouseenter`/`mouseleave` events. Firing `mouseEnter`
 * directly does not reach React's handler.
 */

interface MatchMediaOpts {
  hover?: boolean;
}

function installMatchMedia({ hover = true }: MatchMediaOpts = {}): () => void {
  const original = window.matchMedia;
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches:
      query.includes('hover: hover') || query.includes('pointer: fine')
        ? hover
        : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as typeof window.matchMedia;
  return () => {
    window.matchMedia = original;
  };
}

function renderPopover(overrides: Partial<React.ComponentProps<typeof Popover>> = {}) {
  return render(
    <Popover
      panelRole="dialog"
      panelLabel="details"
      content={<a href="https://example.com/track">open track</a>}
      {...overrides}
    >
      <span>trigger label</span>
    </Popover>,
  );
}

const restores: Array<() => void> = [];

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  while (restores.length) restores.pop()!();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Popover (task 129)', () => {
  it('renders a button trigger with aria-expanded=false and aria-controls linking a hidden panel', () => {
    restores.push(installMatchMedia({ hover: true }));
    renderPopover();

    const trigger = screen.getByRole('button');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    const controlsId = trigger.getAttribute('aria-controls');
    expect(controlsId).toBeTruthy();
    // Panel not in the DOM while closed - screen readers read the button alone.
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('hover: opens after a ~150ms intent delay, closes on mouseleave after a matching delay', async () => {
    restores.push(installMatchMedia({ hover: true }));
    renderPopover();

    const trigger = screen.getByRole('button');
    act(() => {
      fireEvent.mouseOver(trigger);
    });
    // Intent delay: nothing yet.
    expect(screen.queryByRole('dialog')).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(160);
    });
    const panel = screen.getByRole('dialog', { name: 'details' });
    expect(panel).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(panel.id).toBe(trigger.getAttribute('aria-controls'));

    act(() => {
      fireEvent.mouseOut(trigger);
    });
    // Close is scheduled - still open before the intent delay elapses.
    expect(screen.queryByRole('dialog')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(160);
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('hover: keyboard focus opens without waiting for the intent delay', () => {
    restores.push(installMatchMedia({ hover: true }));
    renderPopover();

    const trigger = screen.getByRole('button');
    act(() => {
      trigger.focus();
      fireEvent.focus(trigger);
    });
    // Instant open on focus - no timer needed.
    expect(screen.getByRole('dialog', { name: 'details' })).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('Escape closes and returns focus to the trigger', async () => {
    restores.push(installMatchMedia({ hover: true }));
    renderPopover();

    const trigger = screen.getByRole('button');
    act(() => {
      trigger.focus();
      fireEvent.focus(trigger);
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // Escape from anywhere in the document closes and returns focus.
    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' });
      // Drain the blur-safety setTimeout so it doesn't reopen anything later.
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('touch (no hover): tap opens, tap outside closes, tap trigger again closes', () => {
    restores.push(installMatchMedia({ hover: false }));
    render(
      <div>
        <Popover
          panelRole="dialog"
          panelLabel="details"
          content={<a href="https://example.com">open</a>}
        >
          <span>trigger label</span>
        </Popover>
        <div data-testid="outside">outside</div>
      </div>,
    );

    const trigger = screen.getByRole('button');
    // Hovering must not open on a non-hover-capable device (no timer schedule).
    act(() => {
      fireEvent.mouseOver(trigger);
      vi.advanceTimersByTime(500);
    });
    expect(screen.queryByRole('dialog')).toBeNull();

    // Tap (click) opens.
    act(() => {
      fireEvent.click(trigger);
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // Tap outside closes.
    act(() => {
      fireEvent.mouseDown(screen.getByTestId('outside'));
    });
    expect(screen.queryByRole('dialog')).toBeNull();

    // Tap trigger again closes (open then close).
    act(() => {
      fireEvent.click(trigger);
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    act(() => {
      fireEvent.click(trigger);
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('touch (no hover): keyboard focus does NOT open (no hover intent path)', () => {
    restores.push(installMatchMedia({ hover: false }));
    renderPopover();

    const trigger = screen.getByRole('button');
    act(() => {
      trigger.focus();
      fireEvent.focus(trigger);
    });
    // On touch devices the focus path is not wired - visitors tap to open.
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a moving mouse from trigger to panel keeps it open (matched-delay dance)', async () => {
    restores.push(installMatchMedia({ hover: true }));
    renderPopover();

    const trigger = screen.getByRole('button');
    await act(async () => {
      fireEvent.mouseOver(trigger);
      await vi.advanceTimersByTimeAsync(160);
    });
    const panel = screen.getByRole('dialog');

    // Mouse leaves the trigger - close is scheduled. Cross the gap into panel
    // BEFORE the intent delay lapses; panel's mouseenter must cancel the close.
    await act(async () => {
      fireEvent.mouseOut(trigger);
      await vi.advanceTimersByTimeAsync(50);
      fireEvent.mouseOver(panel);
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(screen.queryByRole('dialog')).toBeInTheDocument();
  });

  it('panelRole="tooltip" renders the panel as a tooltip', () => {
    restores.push(installMatchMedia({ hover: true }));
    renderPopover({
      panelRole: 'tooltip',
      panelLabel: 'stats',
      content: <span>read-only</span>,
    });

    const trigger = screen.getByRole('button');
    act(() => {
      fireEvent.click(trigger);
    });
    // A read-only popover reads as a tooltip, not a dialog.
    expect(screen.getByRole('tooltip', { name: 'stats' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
