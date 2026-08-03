import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import Panel from './Panel';
import styles from './Panel.module.css';

describe('Panel', () => {
  it('renders its children inside the panel surface', () => {
    render(
      <Panel>
        <span>panel body</span>
      </Panel>,
    );
    const body = screen.getByText('panel body');
    expect(body.parentElement).toHaveClass(styles.panel);
  });

  it('is a plain (non-raised) surface by default', () => {
    render(<Panel data-testid="p">flat</Panel>);
    const panel = screen.getByTestId('p');
    expect(panel).toHaveClass(styles.panel);
    expect(panel).not.toHaveClass(styles.raised);
  });

  it('applies the raised variant class', () => {
    render(
      <Panel raised data-testid="p">
        lifted
      </Panel>,
    );
    expect(screen.getByTestId('p')).toHaveClass(styles.raised);
  });

  it('can render as a different element and forwards extra props', () => {
    render(
      <Panel as="section" aria-label="group" className="extra" data-testid="p">
        x
      </Panel>,
    );
    const panel = screen.getByTestId('p');
    expect(panel.tagName).toBe('SECTION');
    expect(panel).toHaveAttribute('aria-label', 'group');
    expect(panel).toHaveClass('extra');
  });
});
