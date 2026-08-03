import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ThemeToggle from './ThemeToggle';

function setInitialTheme(theme: 'dark' | 'light') {
  document.documentElement.dataset.theme = theme;
}

beforeEach(() => {
  localStorage.clear();
  // Default: the no-flash script would have stamped dark (native theme).
  setInitialTheme('dark');
});

afterEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe('ThemeToggle', () => {
  it('names the destination theme, not the current one', () => {
    render(<ThemeToggle />);
    expect(
      screen.getByRole('button', { name: 'Switch to light theme' }),
    ).toBeInTheDocument();
  });

  it('toggles data-theme to light and persists the choice', () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole('button'));

    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('theme')).toBe('light');
    // Label now points back to dark.
    expect(
      screen.getByRole('button', { name: 'Switch to dark theme' }),
    ).toBeInTheDocument();
  });

  it('toggles back to dark on a second click', () => {
    render(<ThemeToggle />);
    const button = screen.getByRole('button');

    fireEvent.click(button);
    fireEvent.click(button);

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(
      screen.getByRole('button', { name: 'Switch to light theme' }),
    ).toBeInTheDocument();
  });

  it('restores the theme already stamped on <html> (light)', () => {
    setInitialTheme('light');
    render(<ThemeToggle />);

    // Mounting in light must not flip the theme; label points to dark.
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(
      screen.getByRole('button', { name: 'Switch to dark theme' }),
    ).toBeInTheDocument();
  });
});
