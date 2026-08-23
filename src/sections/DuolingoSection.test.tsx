import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import DuolingoSection from './DuolingoSection';
import type { Section } from '../types/content';
import type { DuolingoResponse } from '../lib/api';

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function duolingoSection(data: Record<string, unknown>): Section {
  return { id: 'sec-duolingo', type: 'duolingo', data, items: [] } as Section;
}

function renderDuolingo(data: Record<string, unknown>) {
  return render(<DuolingoSection section={duolingoSection(data)} media={{}} />);
}

const available: DuolingoResponse = {
  available: true,
  streak: 847,
  total_xp: 52_400, course: { title: 'Spanish', xp: 48210 },
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('DuolingoSection (spec §3.5, DESIGN.md §5)', () => {
  it('renders the streak and course readout from a live fetch', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(available)));

    renderDuolingo({ language: 'es' });

    // Streak count + its "days" unit.
    expect(await screen.findByText('847')).toBeInTheDocument();
    expect(screen.getByText('days')).toBeInTheDocument();

    // Course readout: title as the Instrument label, total XP tabular-nums, course XP dim.
    expect(screen.getByText('Spanish')).toBeInTheDocument();
    expect(screen.queryByText('48,210 XP')).not.toBeInTheDocument();
    expect(screen.getByText('52,400 XP')).toBeInTheDocument();
    expect(screen.getByText('48,210 in Spanish')).toBeInTheDocument();
  });

  it('passes the configured language as the ?language= query param', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(available));
    vi.stubGlobal('fetch', fetchMock);

    renderDuolingo({ language: 'fr' });

    await screen.findByText('847');
    const call = fetchMock.mock.calls.find((c) =>
      String(c[0]).startsWith('/api/duolingo'),
    );
    expect(call).toBeTruthy();
    expect(String(call![0])).toContain('language=fr');
  });

  it('defaults the language to "es" when none is configured', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(available));
    vi.stubGlobal('fetch', fetchMock);

    renderDuolingo({});

    await screen.findByText('847');
    const call = fetchMock.mock.calls.find((c) =>
      String(c[0]).startsWith('/api/duolingo'),
    );
    expect(String(call![0])).toContain('language=es');
  });

  it('renders the manual score_label as a chip only when configured', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(available)));

    const { rerender } = renderDuolingo({ score_label: 'Duolingo Score 95' });

    // The manual score is present and distinct from the live values.
    expect(await screen.findByText('Duolingo Score 95')).toBeInTheDocument();

    // Without the config, no chip renders.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(available)));
    rerender(<DuolingoSection section={duolingoSection({})} media={{}} />);
    await waitFor(() =>
      expect(screen.queryByText('Duolingo Score 95')).not.toBeInTheDocument(),
    );
  });

  it('degrades to nothing on an { available: false } payload (§3.5)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ available: false })),
    );

    const { container } = renderDuolingo({ language: 'es' });

    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('degrades to nothing (never errors) when the fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({}, { ok: false, status: 500 })),
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { container } = renderDuolingo({ language: 'es' });

    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
