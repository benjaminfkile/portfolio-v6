import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import Instrument from './Instrument';
import styles from './Instrument.module.css';

describe('Instrument', () => {
  it('renders the label and value', () => {
    render(<Instrument label="API" value="120ms" />);
    expect(screen.getByText('API')).toBeInTheDocument();
    expect(screen.getByText('120ms')).toBeInTheDocument();
  });

  it('accepts the value as children', () => {
    render(<Instrument label="SITE">v6</Instrument>);
    expect(screen.getByText('v6')).toBeInTheDocument();
  });

  it('renders the value in --text by default and amber when accented', () => {
    const { rerender } = render(<Instrument label="L" value="plain" />);
    expect(screen.getByText('plain')).not.toHaveClass(styles.accent);

    rerender(<Instrument label="L" value="live" accent />);
    expect(screen.getByText('live')).toHaveClass(styles.accent);
  });

  it('renders a leading slot when provided', () => {
    render(
      <Instrument label="STATUS" value="up" leading={<i data-testid="dot" />} />,
    );
    expect(screen.getByTestId('dot')).toBeInTheDocument();
  });

  it('applies an aria-live region when requested', () => {
    render(<Instrument label="NOW PLAYING" value="Track" live="polite" />);
    expect(screen.getByText('Track')).toHaveAttribute('aria-live', 'polite');
  });
});
