import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ThemeToggle from './ThemeToggle';
import * as beacon from '../lib/beacon';

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
  vi.restoreAllMocks();
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

  it('beacons a theme_toggle event on each click (§4.8)', () => {
    const spy = vi.spyOn(beacon, 'sendEvent').mockImplementation(() => {});
    render(<ThemeToggle />);

    fireEvent.click(screen.getByRole('button'));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenLastCalledWith('theme_toggle');
  });
});
