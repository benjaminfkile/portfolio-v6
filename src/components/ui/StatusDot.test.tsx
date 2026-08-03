import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatusDot from './StatusDot';
import styles from './StatusDot.module.css';

describe('StatusDot', () => {
  it('applies the variant class for each status', () => {
    const { rerender, container } = render(<StatusDot variant="ok" />);
    expect(container.firstChild).toHaveClass(styles.ok);

    rerender(<StatusDot variant="warn" />);
    expect(container.firstChild).toHaveClass(styles.warn);

    rerender(<StatusDot variant="err" />);
    expect(container.firstChild).toHaveClass(styles.err);
  });

  it('is decorative (aria-hidden) with no accessible name by default', () => {
    const { container } = render(<StatusDot variant="ok" />);
    const dot = container.firstChild as HTMLElement;
    expect(dot).toHaveAttribute('aria-hidden', 'true');
    expect(dot).not.toHaveAttribute('role');
  });

  it('exposes an accessible name when labelled', () => {
    render(<StatusDot variant="err" label="API down" />);
    const dot = screen.getByRole('img', { name: 'API down' });
    expect(dot).toBeInTheDocument();
    expect(dot).not.toHaveAttribute('aria-hidden');
  });

  it('always carries the pulse class (CSS disables it under reduced motion)', () => {
    const { container } = render(<StatusDot variant="ok" />);
    // The dot base class owns the 2s pulse animation; the reduced-motion media
    // query in the module turns it static without changing the markup.
    expect(container.firstChild).toHaveClass(styles.dot);
  });
});
