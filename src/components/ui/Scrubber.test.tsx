import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import Scrubber from './Scrubber';

function renderScrubber(value = 100, onChange = vi.fn()) {
  render(
    <Scrubber
      min={0}
      max={287}
      value={value}
      onChange={onChange}
      pageStep={12}
      label="Playhead"
      valueText={`slot ${value}`}
    />,
  );
  return { slider: screen.getByRole('slider'), onChange };
}

describe('Scrubber (a11y playhead, DESIGN.md §5/§7)', () => {
  it('exposes ARIA slider semantics with a human valuetext', () => {
    const { slider } = renderScrubber(100);
    expect(slider).toHaveAttribute('aria-valuemin', '0');
    expect(slider).toHaveAttribute('aria-valuemax', '287');
    expect(slider).toHaveAttribute('aria-valuenow', '100');
    expect(slider).toHaveAttribute('aria-valuetext', 'slot 100');
    expect(slider).toHaveAttribute('aria-label', 'Playhead');
    expect(slider).toHaveAttribute('aria-orientation', 'horizontal');
    // Keyboard-reachable.
    expect(slider).toHaveAttribute('tabindex', '0');
  });

  it('steps with the arrow keys (±1) and pages with PageUp/PageDown', () => {
    const { slider, onChange } = renderScrubber(100);

    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith(101);
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenLastCalledWith(99);
    fireEvent.keyDown(slider, { key: 'ArrowUp' });
    expect(onChange).toHaveBeenLastCalledWith(101);
    fireEvent.keyDown(slider, { key: 'ArrowDown' });
    expect(onChange).toHaveBeenLastCalledWith(99);
    fireEvent.keyDown(slider, { key: 'PageUp' });
    expect(onChange).toHaveBeenLastCalledWith(112);
    fireEvent.keyDown(slider, { key: 'PageDown' });
    expect(onChange).toHaveBeenLastCalledWith(88);
  });

  it('jumps to the ends with Home/End', () => {
    const { slider, onChange } = renderScrubber(100);

    fireEvent.keyDown(slider, { key: 'Home' });
    expect(onChange).toHaveBeenLastCalledWith(0);
    fireEvent.keyDown(slider, { key: 'End' });
    expect(onChange).toHaveBeenLastCalledWith(287);
  });

  it('clamps at the bounds — no callback past an end', () => {
    const onChange = vi.fn();
    const { slider } = renderScrubber(0, onChange);

    fireEvent.keyDown(slider, { key: 'ArrowLeft' }); // already at min
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(slider, { key: 'PageDown' }); // still clamped to 0
    expect(onChange).not.toHaveBeenCalled();
  });

  it('ignores keys it does not own (e.g. Tab, Enter)', () => {
    const { slider, onChange } = renderScrubber(100);
    fireEvent.keyDown(slider, { key: 'Tab' });
    fireEvent.keyDown(slider, { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
  });
});
