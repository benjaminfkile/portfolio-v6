import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import StatusSection from './StatusSection';
import type { Section } from '../types/content';
import type { StatusResponse } from '../lib/api';

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function statusSection(data: Record<string, unknown>): Section {
  return { id: 'sec-status', type: 'status', data, items: [] } as Section;
}

function renderStatus(data: Record<string, unknown>) {
  return render(<StatusSection section={statusSection(data)} media={{}} />);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('StatusSection (spec §3.5)', () => {
  it('degrades to "unavailable" (never a broken page) when the fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({}, { ok: false, status: 500 })),
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});

    renderStatus({
      title: 'Status',
      services: [],
      show_response_times: false,
    });

    expect(await screen.findByText(/unavailable/i)).toBeInTheDocument();
    // Degrade, not error: nothing throws and there is no crash/alert role.
    expect(screen.getByRole('heading', { name: 'Status' })).toBeInTheDocument();
  });

  it('renders an honest degraded state when the API reports one', async () => {
    const body: StatusResponse = {
      degraded: true,
      services: [
        { name: 'Gateway', ok: true },
        { name: 'API', ok: false },
      ],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(body)));

    renderStatus({ services: ['Gateway', 'API'], show_response_times: false });

    expect(await screen.findByText(/degraded/i)).toBeInTheDocument();
    // The offending service is shown as down, not hidden.
    expect(screen.getByText('API')).toBeInTheDocument();
    expect(screen.getByText('Down')).toBeInTheDocument();
  });

  it('renders the curated service list with response times when configured', async () => {
    const body: StatusResponse = {
      degraded: false,
      services: [
        { name: 'Gateway', ok: true, response_time_ms: 12 },
        { name: 'API', ok: true, response_time_ms: 40 },
        { name: 'Hidden', ok: true, response_time_ms: 99 },
      ],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(body)));

    // Config curates which services to show and asks for response times.
    renderStatus({ services: ['Gateway', 'API'], show_response_times: true });

    await screen.findByText('Gateway');
    expect(screen.getByText('12 ms')).toBeInTheDocument();
    expect(screen.getByText('40 ms')).toBeInTheDocument();
    // A service not named in config is not displayed.
    expect(screen.queryByText('Hidden')).not.toBeInTheDocument();
  });

  it('omits response times when show_response_times is off', async () => {
    const body: StatusResponse = {
      degraded: false,
      services: [{ name: 'Gateway', ok: true, response_time_ms: 12 }],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(body)));

    renderStatus({ services: ['Gateway'], show_response_times: false });

    await screen.findByText('Gateway');
    await waitFor(() =>
      expect(screen.queryByText('12 ms')).not.toBeInTheDocument(),
    );
  });
});
