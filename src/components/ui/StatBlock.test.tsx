import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatBlock from './StatBlock';

describe('StatBlock', () => {
  it('renders the value, unit and mono label', () => {
    render(<StatBlock value={128} unit="ms" label="p95 latency" />);
    expect(screen.getByText('128')).toBeInTheDocument();
    expect(screen.getByText('ms')).toBeInTheDocument();
    expect(screen.getByText('p95 latency')).toBeInTheDocument();
  });

  it('renders the optional delta line when provided', () => {
    render(<StatBlock value={42} label="Errors" delta="-8% vs. 3h" />);
    expect(screen.getByText('-8% vs. 3h')).toBeInTheDocument();
  });

  it('omits the unit and delta slots when not provided', () => {
    const { container } = render(<StatBlock value={7} label="Deploys" />);
    // Only the value span (with its number) and the label span exist.
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('Deploys')).toBeInTheDocument();
    // No empty unit/delta spans are emitted.
    expect(container.querySelectorAll('span')).toHaveLength(2);
  });
});
