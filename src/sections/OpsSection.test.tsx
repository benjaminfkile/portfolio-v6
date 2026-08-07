import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import OpsSection from './OpsSection';
import { SECTION_REGISTRY } from '../registry';
import { fixtureOpsDocument, fixtureOpsReport } from '../test/fixtures';
import type { Section } from '../types/content';

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

function renderOps(data: Record<string, unknown> = { heading: 'Ops' }) {
  return render(<OpsSection section={opsSection(data)} media={{}} />);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('OpsSection replay (spec §3.5, DESIGN.md §5, v1.7)', () => {
  it('renders full-day widgets, a playhead scrubber, and an honest UTC-day label', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(fixtureOpsReport)));
    renderOps();

    expect(
      await screen.findByRole('heading', { name: 'CPU Utilization' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'ALB Request Count' }),
    ).toBeInTheDocument();

    // Honest window label + the report identity in the mono voice.
    expect(screen.getByText(/^24h ending /)).toBeInTheDocument();
    expect(screen.getByText(/2026-08-06/)).toBeInTheDocument();
    expect(screen.getByText(/GEN .*UTC/)).toBeInTheDocument();

    // The playhead is an ARIA slider spanning the day's 288 slots, defaulted to
    // the last real reading (slot 287 = 23:55Z).
    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('aria-valuemax', '287');
    expect(slider).toHaveAttribute('aria-valuenow', '287');
  });

  it('drives the readouts from the value at the playhead moment', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(fixtureOpsReport)));
    renderOps();

    const slider = await screen.findByRole('slider');

    // Default (slot 287): CPU 42%, 2xx 128, 5xx 2.
    expect(screen.getByText('CPU Utilization 42%')).toBeInTheDocument();
    expect(screen.getByText('128req/s')).toBeInTheDocument();

    // Scrub back to slot 6 (00:30Z): CPU 55%, 2xx 210, 5xx 7.
    fireEvent.keyDown(slider, { key: 'Home' }); // → slot 0
    for (let i = 0; i < 6; i++) fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(slider).toHaveAttribute('aria-valuenow', '6');
    expect(screen.getByText('CPU Utilization 55%')).toBeInTheDocument();
    expect(screen.getByText('210req/s')).toBeInTheDocument();
    expect(screen.getByText('7req/s')).toBeInTheDocument();
  });

  it('shows a gap (—) at a slot with no datapoint, never a zero', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(fixtureOpsReport)));
    renderOps();

    const slider = await screen.findByRole('slider');
    // Slot 3 (00:15Z) has no sample in either series.
    fireEvent.keyDown(slider, { key: 'Home' });
    for (let i = 0; i < 3; i++) fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(slider).toHaveAttribute('aria-valuenow', '3');

    // The gauge reads "—" (via its hidden summary) and no false 0%.
    expect(screen.getByText('CPU Utilization —')).toBeInTheDocument();
    expect(screen.queryByText('CPU Utilization 0%')).not.toBeInTheDocument();
    // The multi-series legend shows "—" for the gap.
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('marks every widget SVG decorative and draws a playhead cursor on charts (§7)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(fixtureOpsReport)));
    const { container } = renderOps();

    await screen.findByRole('heading', { name: 'CPU Utilization' });

    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThan(0);
    svgs.forEach((svg) => expect(svg).toHaveAttribute('aria-hidden', 'true'));

    // The chart draws a vertical playhead cursor line.
    expect(
      container.querySelector('[data-role="cursor"]'),
    ).toBeInTheDocument();
  });

  it('renders a calm placeholder (not nothing) when no report exists yet (404)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({}, { ok: false, status: 404 })),
    );
    renderOps({ heading: 'Ops' });

    // The section still renders — a placeholder panel, no thrown error.
    expect(await screen.findByText('NO REPORT YET')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Ops' })).toBeInTheDocument();
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('degrades to the calm placeholder on a transport failure (never errors)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({}, { ok: false, status: 500 })),
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderOps({ heading: 'Ops' });

    expect(await screen.findByText('NO REPORT YET')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders nothing while the first fetch is in flight', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));
    const { container } = renderOps();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the ops section through SECTION_REGISTRY from a fixture', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(fixtureOpsReport)));

    const section = fixtureOpsDocument.pages[0].sections[0];
    const OpsFromRegistry = SECTION_REGISTRY[section.type];
    render(createElement(OpsFromRegistry, { section, media: {} }));

    expect(
      await screen.findByRole('heading', { name: 'CPU Utilization' }),
    ).toBeInTheDocument();
    // The fixture's intro copy renders through the shell.
    expect(screen.getByText('Yesterday, on the record.')).toBeInTheDocument();
  });
});
