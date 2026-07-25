import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import HomePage from './HomePage';
import type { ContentDocument } from '../types/content';

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function renderHome() {
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('HomePage', () => {
  it('renders a clean empty page (no error) when sections is empty', async () => {
    const doc: ContentDocument = { version: 0, published_at: null, sections: [] };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(doc)));

    renderHome();

    // Loading resolves...
    await waitFor(() =>
      expect(screen.queryByText('Loading…')).not.toBeInTheDocument(),
    );

    // ...to a clean page: no error, no section list.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('renders a placeholder list of section types when present', async () => {
    const doc: ContentDocument = {
      version: 42,
      published_at: '2026-07-24T18:00:00Z',
      sections: [
        { id: 'a', type: 'hero', data: {}, items: [] },
        { id: 'b', type: 'portfolio', data: {}, items: [] },
      ],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(doc)));

    renderHome();

    expect(await screen.findByText('hero')).toBeInTheDocument();
    expect(screen.getByText('portfolio')).toBeInTheDocument();
    expect(screen.getByRole('list')).toBeInTheDocument();
  });

  it('renders an error state (not a crash) when the fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({}, { ok: false, status: 500 })),
    );
    // Silence the expected console.error.
    vi.spyOn(console, 'error').mockImplementation(() => {});

    renderHome();

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
