import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import GithubSection, { monthColumns } from './GithubSection';
import type { Section } from '../types/content';
import type { GithubResponse, GithubWeek } from '../lib/api';
import { fixtureGithub, fixtureGithubYear } from '../test/fixtures';
import styles from './GithubSection.module.css';

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function githubSection(data: Record<string, unknown> = {}): Section {
  return { id: 'sec-github', type: 'github', data, items: [] } as Section;
}

function renderGithub(data: Record<string, unknown> = {}) {
  return render(<GithubSection section={githubSection(data)} media={{}} />);
}

/** A run of `n` identical single-day weeks with the given level on each day. */
function levelWeeks(n: number, level: number): GithubWeek[] {
  return Array.from({ length: n }, (_, i) => ({
    days: Array.from({ length: 7 }, (_, d) => ({
      // Distinct, valid dates so month derivation has something to read.
      date: `2026-01-${String(1 + ((i * 7 + d) % 27)).padStart(2, '0')}`,
      count: level,
      level,
    })),
  }));
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('GithubSection (spec §3.5, DESIGN.md §5, v1.10)', () => {
  it('renders the total, the window, the grid, and an accessible summary', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(fixtureGithub)));

    const { container } = renderGithub();

    // The visually-hidden summary stands in for the labelled cells (§7).
    expect(
      await screen.findByText(
        '2,143 contributions between 2025-08-11 and 2026-08-09',
      ),
    ).toBeInTheDocument();
    // The total also surfaces as the mono Instrument value.
    expect(screen.getByText('Contributions')).toBeInTheDocument();
    expect(screen.getByText('2,143')).toBeInTheDocument();
    // The active window as an instrument caption.
    expect(screen.getByText('2025-08-11 → 2026-08-09')).toBeInTheDocument();
    // The day-grid: five weeks × seven days from the fixture.
    expect(container.querySelectorAll('[data-level]')).toHaveLength(35);
  });

  it('defaults to the trailing 12 months (no ?year=) and drives the picker from years', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(fixtureGithub));
    vi.stubGlobal('fetch', fetchMock);

    renderGithub();

    await screen.findByText('2,143');
    // The default fetch carries no year query.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/github');

    // The picker: LAST 12 MONTHS default + one option per year, newest-first.
    const select = screen.getByRole('combobox', { name: 'Contribution window' });
    const options = within(select).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual([
      'LAST 12 MONTHS',
      '2026',
      '2025',
      '2024',
    ]);
  });

  it('re-fetches ?year=YYYY when a year is chosen and re-renders that window', async () => {
    const fetchMock = vi.fn((path: string) =>
      Promise.resolve(
        jsonResponse(
          path.includes('year=2025') ? fixtureGithubYear : fixtureGithub,
        ),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    renderGithub();
    await screen.findByText('2,143');

    const select = screen.getByRole('combobox', { name: 'Contribution window' });
    fireEvent.change(select, { target: { value: '2025' } });

    // The chosen year re-fetches with ?year= and re-renders the new window.
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/github?year=2025', expect.anything()),
    );
    expect(await screen.findByText('1,876')).toBeInTheDocument();
    expect(screen.getByText('2025-01-01 → 2025-12-31')).toBeInTheDocument();
  });

  it('maps each day to its server level via a 5-step amber ramp class', async () => {
    const body: GithubResponse = {
      available: true,
      total: 15,
      from: '2026-02-01',
      to: '2026-02-07',
      years: [2026],
      weeks: [
        {
          days: [0, 1, 2, 3, 4, 4, 4].map((level, i) => ({
            date: `2026-02-0${i + 1}`,
            count: level,
            level,
          })),
        },
      ],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(body)));

    const { container } = renderGithub();

    await screen.findByText('15');
    const cells = container.querySelectorAll('[data-level]');
    expect(cells).toHaveLength(7);
    // Each cell reflects the server's level verbatim (0–4), not a recomputation.
    [0, 1, 2, 3, 4, 4, 4].forEach((level, i) => {
      expect(cells[i]).toHaveAttribute('data-level', String(level));
      // The ramp class for that level is applied (l0…l4).
      expect(cells[i]).toHaveClass(styles[`l${level}`]);
    });
  });

  it('derives month labels at each column where the month changes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(fixtureGithub)));

    renderGithub();

    // The fixture straddles July → August 2026: both labels appear once.
    expect(await screen.findByText('Jul')).toBeInTheDocument();
    expect(screen.getByText('Aug')).toBeInTheDocument();
    // And the sparse weekday rail.
    expect(screen.getByText('Mon')).toBeInTheDocument();
    expect(screen.getByText('Wed')).toBeInTheDocument();
    expect(screen.getByText('Fri')).toBeInTheDocument();
  });

  it('shows the hovered/tapped day in the aria-live readout (touch + mouse)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(fixtureGithub)));

    const { container } = renderGithub();
    await screen.findByText('2,143');

    // The very first cell of the fixture: 2026-07-12, count 0.
    const cell = container.querySelector('[data-date="2026-07-12"]') as HTMLElement;
    expect(cell).not.toBeNull();
    // A native title tooltip carries the same mono readout on hover.
    expect(cell).toHaveAttribute('title', '0 contributions · Sun, Jul 12, 2026');

    fireEvent.mouseEnter(cell);
    expect(
      screen.getByText('0 contributions · Sun, Jul 12, 2026'),
    ).toBeInTheDocument();

    // A tap (click) fills the same readout — the touch path.
    const busy = container.querySelector('[data-date="2026-07-17"]') as HTMLElement;
    fireEvent.click(busy);
    expect(
      screen.getByText('4 contributions · Fri, Jul 17, 2026'),
    ).toBeInTheDocument();
  });

  it('ignores a legacy `weeks` config key (v1.2)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(fixtureGithub)));

    const { container } = renderGithub({ weeks: 1 });

    await screen.findByText('2,143');
    // The legacy count does not slice the payload — every fixture week renders.
    expect(container.querySelectorAll('[data-level]')).toHaveLength(35);
  });

  it('degrades to nothing on an { available: false } first load (§3.5)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ available: false })),
    );

    const { container } = renderGithub();

    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('degrades to nothing (never errors) when the first fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({}, { ok: false, status: 500 })),
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { container } = renderGithub();

    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('degrades in place — keeping the picker — when a year re-fetch fails (§3.5)', async () => {
    const fetchMock = vi.fn((path: string) =>
      path.includes('year=')
        ? Promise.resolve(jsonResponse({ available: false }))
        : Promise.resolve(jsonResponse(fixtureGithub)),
    );
    vi.stubGlobal('fetch', fetchMock);

    renderGithub();
    await screen.findByText('2,143');

    const select = screen.getByRole('combobox', { name: 'Contribution window' });
    fireEvent.change(select, { target: { value: '2024' } });

    // The grid is gone, but the picker survives so the visitor can pick again.
    expect(await screen.findByText('Contribution data unavailable.')).toBeInTheDocument();
    expect(
      screen.getByRole('combobox', { name: 'Contribution window' }),
    ).toBeInTheDocument();
  });
});

describe('monthColumns (month-label derivation)', () => {
  it('emits one label per month change, at the first column of each month', () => {
    const weeks: GithubWeek[] = [
      { days: [{ date: '2026-06-28', count: 0, level: 0 }] },
      { days: [{ date: '2026-07-05', count: 0, level: 0 }] },
      { days: [{ date: '2026-07-12', count: 0, level: 0 }] },
      { days: [{ date: '2026-08-02', count: 0, level: 0 }] },
    ];
    expect(monthColumns(weeks)).toEqual([
      { col: 0, label: 'Jun' },
      { col: 1, label: 'Jul' },
      { col: 3, label: 'Aug' },
    ]);
  });

  it('skips empty weeks without emitting a stray label', () => {
    const weeks: GithubWeek[] = [
      { days: [] },
      { days: [{ date: '2026-03-01', count: 0, level: 0 }] },
    ];
    expect(monthColumns(weeks)).toEqual([{ col: 1, label: 'Mar' }]);
  });
});
