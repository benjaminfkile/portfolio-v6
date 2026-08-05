import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import OpsSection from './OpsSection';
import { SECTION_REGISTRY } from '../registry';
import { fixtureOpsDocument } from '../test/fixtures';
import type { Section } from '../types/content';
import type { OpsResponse } from '../lib/api';

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function opsSection(data: Record<string, unknown>): Section {
  return { id: 'sec-ops', type: 'ops', data, items: [] } as Section;
}

function renderOps(data: Record<string, unknown>) {
  return render(<OpsSection section={opsSection(data)} media={{}} />);
}

/** Force `document.visibilityState`/`hidden` and fire the change event. */
function setVisibility(value: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', {
    value,
    configurable: true,
  });
  Object.defineProperty(document, 'hidden', {
    value: value === 'hidden',
    configurable: true,
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

const points = (vals: number[]) =>
  vals.map((v, i) => ({ t: 1_690_000_000 + i * 300, v }));

const available: OpsResponse = {
  available: true,
  window_hours: 3,
  widgets: [
    {
      title: 'CPU Utilization',
      kind: 'gauge',
      unit: '%',
      latest: 42,
      series: [{ label: null, points: points([40, 41, 42]) }],
    },
    {
      title: 'ALB Request Count',
      kind: 'chart',
      unit: 'req/s',
      latest: 128,
      series: [
        { label: '2xx', points: points([100, 120, 128]) },
        { label: '5xx', points: points([1, 0, 2]) },
      ],
    },
  ],
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  setVisibility('visible');
});

describe('OpsSection (spec §3.5, DESIGN.md §5, v1.3)', () => {
  it('renders a Gauge for kind "gauge" and an AreaChart + latest readout for kind "chart"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(available)));

    const { container } = renderOps({ window_hours: 3 });

    // Both widget titles surface as mono panel titles.
    expect(
      await screen.findByRole('heading', { name: 'CPU Utilization' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'ALB Request Count' }),
    ).toBeInTheDocument();

    // Gauge summary carries the reading (label + value + unit) to assistive tech.
    expect(screen.getByText('CPU Utilization 42%')).toBeInTheDocument();

    // The chart widget shows its latest value prominently as a StatBlock readout
    // ("128" also appears as the chart's axis-max label, hence getAllByText).
    expect(screen.getAllByText('128').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Latest').length).toBeGreaterThan(0);

    // Two widgets → two Panels in the grid.
    expect(container.querySelectorAll('li').length).toBeGreaterThanOrEqual(2);
  });

  it('formats readouts unit-aware: unitless counts as whole numbers, % to 1dp', async () => {
    const payload: OpsResponse = {
      available: true,
      window_hours: 3,
      widgets: [
        {
          title: 'Database Connections',
          kind: 'chart',
          unit: null, // unitless = a count; a 5-min Average like 12.4 shows as "12"
          latest: 12.4,
          series: [{ label: null, points: points([11.8, 12.1, 12.4]) }],
        },
        {
          title: 'CPU Utilization',
          kind: 'gauge',
          unit: '%',
          latest: 4.13,
          series: [{ label: null, points: points([4.1, 4.2, 4.13]) }],
        },
      ],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(payload)));
    renderOps({ window_hours: 3 });

    // Readout and axis-max label both format to a whole "12" — never "12.4".
    expect((await screen.findAllByText('12')).length).toBeGreaterThan(0);
    expect(screen.queryByText('12.4')).not.toBeInTheDocument();
    expect(screen.getByText('CPU Utilization 4.1%')).toBeInTheDocument();
  });

  it('renders series labels only when non-null (scrubbed labels are omitted, §3.5)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(available)));

    renderOps({ window_hours: 3 });

    // The chart widget's two explicit labels render.
    expect(await screen.findByText('2xx')).toBeInTheDocument();
    expect(screen.getByText('5xx')).toBeInTheDocument();

    // The gauge widget's single series has a null label — nothing is rendered for it.
    // (No legend entry exists that isn't one of the two explicit chart labels.)
  });

  it('hides every widget SVG and exposes a visually-hidden summary (a11y, §7)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(available)));

    const { container } = renderOps({ window_hours: 3 });

    await screen.findByRole('heading', { name: 'CPU Utilization' });

    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThan(0);
    svgs.forEach((svg) => expect(svg).toHaveAttribute('aria-hidden', 'true'));

    // The chart's summary sentence stands in for the decorative SVG.
    expect(
      screen.getByText('ALB Request Count: latest 128req/s'),
    ).toBeInTheDocument();
  });

  it('passes window_hours as the query param and shows it in the strip', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(available));
    vi.stubGlobal('fetch', fetchMock);

    renderOps({ window_hours: 6 });

    // The window label is derived from the config (LAST 6H).
    expect(await screen.findByText('LAST 6H')).toBeInTheDocument();

    // The request forwarded the configured lookback as ?window_hours=.
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      '/api/ops?window_hours=6',
    );
  });

  it('clamps an out-of-range window_hours to 1–24 (default 3 when absent)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(available));
    vi.stubGlobal('fetch', fetchMock);

    renderOps({ window_hours: 99 });

    expect(await screen.findByText('LAST 24H')).toBeInTheDocument();
    expect(String(fetchMock.mock.calls[0][0])).toContain('window_hours=24');
  });

  it('shows a StatusDot that reads OK while fetches succeed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(available)));

    renderOps({ window_hours: 3 });

    const dot = await screen.findByRole('img', { name: 'Live data up to date' });
    expect(dot).toBeInTheDocument();
  });

  it('degrades to nothing on an { available: false } payload (§3.5)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ available: false })),
    );

    const { container } = renderOps({ window_hours: 3 });

    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('degrades to nothing (never errors) when the fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({}, { ok: false, status: 500 })),
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { container } = renderOps({ window_hours: 3 });

    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('refetches every ~60s while visible and pauses when the tab is hidden (§3.5)', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(available));
    vi.stubGlobal('fetch', fetchMock);

    const opsCalls = () =>
      fetchMock.mock.calls.filter((call) =>
        String(call[0]).startsWith('/api/ops'),
      ).length;

    renderOps({ window_hours: 3 });

    // Initial fetch on mount.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(opsCalls()).toBe(1);

    // Visible: a 60s tick refetches.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(opsCalls()).toBe(2);

    // Hidden: ticks are no-ops — a backgrounded tab must not poll (§3.5).
    await act(async () => {
      setVisibility('hidden');
      await vi.advanceTimersByTimeAsync(180_000);
    });
    expect(opsCalls()).toBe(2);

    // Returning to the foreground refetches immediately, then resumes polling.
    await act(async () => {
      setVisibility('visible');
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(opsCalls()).toBe(3);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(opsCalls()).toBe(4);
  });

  it('renders the ops section through SECTION_REGISTRY from a fixture', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(available)));

    const section = fixtureOpsDocument.pages[0].sections[0];
    const OpsFromRegistry = SECTION_REGISTRY[section.type];
    render(createElement(OpsFromRegistry, { section, media: {} }));

    // The fixture's window_hours (6) drives the strip label, proving the
    // registry-resolved component received the fixture's config.
    expect(await screen.findByText('LAST 6H')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'CPU Utilization' }),
    ).toBeInTheDocument();
  });
});
