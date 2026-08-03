import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import Ticker from './Ticker';
import styles from './Ticker.module.css';

describe('Ticker', () => {
  it('duplicates its content and hides the copy from assistive tech', () => {
    render(
      <Ticker aria-label="Live feed">
        <span>ITEM</span>
      </Ticker>,
    );
    // The content appears twice (the duplication technique) ...
    expect(screen.getAllByText('ITEM')).toHaveLength(2);

    // ... but the second copy is aria-hidden so it is announced once.
    const hidden = document.querySelector('[aria-hidden="true"]');
    expect(hidden).not.toBeNull();
    expect(hidden!).toHaveTextContent('ITEM');
  });

  it('names the marquee region and drives duration via a custom property', () => {
    render(
      <Ticker aria-label="Live feed" duration={12}>
        <span>ITEM</span>
      </Ticker>,
    );
    const region = screen.getByLabelText('Live feed');
    expect(region.style.getPropertyValue('--ticker-duration')).toBe('12s');
  });

  it('keeps the scroll track class the reduced-motion query targets', () => {
    // The scroll is CSS-driven; the @media (prefers-reduced-motion) rule in the
    // module halts it without changing markup (mirrors StatusDot). Asserting the
    // class is present verifies the static-ticker hook stays wired.
    const { container } = render(
      <Ticker>
        <span>ITEM</span>
      </Ticker>,
    );
    expect(container.querySelector(`.${styles.track}`)).not.toBeNull();
  });
});
