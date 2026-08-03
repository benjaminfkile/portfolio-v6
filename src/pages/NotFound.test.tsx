import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NotFound from './NotFound';

describe('NotFound', () => {
  it('renders the instrument-voice 404 with a NO SIGNAL label and a home link', () => {
    render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>,
    );

    // The single h1 is the page heading, not the mono eyebrow label (§7).
    expect(
      screen.getByRole('heading', { level: 1, name: 'Page not found' }),
    ).toBeInTheDocument();
    // The instrument voice "NO SIGNAL" label (DESIGN.md §5).
    expect(screen.getByText('NO SIGNAL')).toBeInTheDocument();
    // A LinkButton home.
    expect(
      screen.getByRole('link', { name: /back to the home page/i }),
    ).toHaveAttribute('href', '/');
    // It renders inside the main landmark with the skip-link target id.
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
  });
});
