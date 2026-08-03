import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import GithubSection from './GithubSection';
import type { Section } from '../types/content';
import type { GithubResponse, GithubWeek } from '../lib/api';

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function githubSection(data: Record<string, unknown>): Section {
  return { id: 'sec-github', type: 'github', data, items: [] } as Section;
}

function renderGithub(data: Record<string, unknown>) {
  return render(<GithubSection section={githubSection(data)} media={{}} />);
}

/** A run of `n` identical weeks with the given seven-day counts. */
function weeks(n: number, days: number[]): GithubWeek[] {
  return Array.from({ length: n }, () => ({ days: [...days] }));
}

const emptyDays = [0, 0, 0, 0, 0, 0, 0];

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('GithubSection (spec §3.5, DESIGN.md §5)', () => {
  it('renders the total contributions and an accessible summary sentence', async () => {
    const body: GithubResponse = {
      available: true,
      total: 2143,
      weeks: weeks(4, emptyDays),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(body)));

    renderGithub({ weeks: 52 });

    // One visually-hidden summary sentence in place of per-cell labels (§5, §7).
    expect(
      await screen.findByText('2,143 contributions in the last year'),
    ).toBeInTheDocument();
    // The total also surfaces as the mono Instrument value.
    expect(screen.getByText('Contributions')).toBeInTheDocument();
  });

  it('maps day counts to a 5-step amber intensity ramp, and hides the grid', async () => {
    const body: GithubResponse = {
      available: true,
      total: 34,
      // max across the row is 10, so ratios 0 / .2 / .5 / .7 / 1 → levels 0/1/2/3/4.
      weeks: [{ days: [0, 2, 5, 7, 10, 10, 10] }],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(body)));

    const { container } = renderGithub({ weeks: 52 });

    await screen.findByText('34 contributions in the last year');

    // The calendar itself is decorative to assistive tech (§5, §7).
    const grid = container.querySelector('[aria-hidden="true"]');
    expect(grid).not.toBeNull();

    const cells = container.querySelectorAll('[data-level]');
    expect(cells).toHaveLength(7);
    expect(cells[0]).toHaveAttribute('data-level', '0');
    expect(cells[1]).toHaveAttribute('data-level', '1');
    expect(cells[2]).toHaveAttribute('data-level', '2');
    expect(cells[3]).toHaveAttribute('data-level', '3');
    expect(cells[4]).toHaveAttribute('data-level', '4');
  });

  it('slices the newest N weeks per the config (weeks arrive oldest→newest)', async () => {
    const body: GithubResponse = {
      available: true,
      total: 70,
      weeks: weeks(60, emptyDays),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(body)));

    const { container } = renderGithub({ weeks: 10 });

    await screen.findByText('70 contributions in the last year');
    // 10 weeks × 7 days = 70 cells, not the full 60 weeks.
    expect(container.querySelectorAll('[data-level]')).toHaveLength(70);
  });

  it('selects the NEWEST weeks, not the oldest, when slicing', async () => {
    const body: GithubResponse = {
      available: true,
      total: 70,
      weeks: [
        { days: [...emptyDays] }, // oldest — must be excluded
        { days: [...emptyDays] },
        { days: [10, 10, 10, 10, 10, 10, 10] }, // newest — must be kept
      ],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(body)));

    const { container } = renderGithub({ weeks: 1 });

    await screen.findByText('70 contributions in the last year');
    const cells = container.querySelectorAll('[data-level]');
    // Only the newest week is shown — all its cells are the top ramp step.
    expect(cells).toHaveLength(7);
    cells.forEach((cell) => expect(cell).toHaveAttribute('data-level', '4'));
  });

  it('degrades to nothing on an { available: false } payload (§3.5)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ available: false })),
    );

    const { container } = renderGithub({ weeks: 52 });

    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('degrades to nothing (never errors) when the fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({}, { ok: false, status: 500 })),
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { container } = renderGithub({ weeks: 52 });

    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
