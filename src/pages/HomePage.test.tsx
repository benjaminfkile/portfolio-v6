import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import HomePage from './HomePage';
import type { ContentDocument } from '../types/content';
import { fixtureDocument } from '../test/fixtures';

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function stubContent(doc: ContentDocument) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(doc)));
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
    stubContent({ version: 0, published_at: null, sections: [] });

    renderHome();

    await waitFor(() =>
      expect(screen.queryByText('Loading…')).not.toBeInTheDocument(),
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('renders every static section from a realistic fixture document', async () => {
    stubContent(fixtureDocument);

    renderHome();

    // hero — the page's <h1>, plus its background from the media map.
    const hero = await screen.findByRole('heading', { level: 1, name: 'Ben Kile' });
    expect(hero).toBeInTheDocument();
    const heroImg = screen.getByAltText('A wide mountain skyline');
    expect(heroImg).toHaveAttribute(
      'src',
      'https://media.benkile.com/media/hero/backdrop.jpg',
    );

    // about — heading + both paragraphs (blank-line split).
    expect(
      screen.getByRole('heading', { level: 2, name: 'About me' }),
    ).toBeInTheDocument();
    expect(screen.getByText('First paragraph of the bio.')).toBeInTheDocument();
    expect(screen.getByText('Second paragraph of the bio.')).toBeInTheDocument();

    // timeline — entries with date ranges, one with resolved media.
    expect(
      screen.getByRole('heading', { level: 3, name: 'Staff Engineer, Acme Corp' }),
    ).toBeInTheDocument();
    expect(screen.getByText('2019 – 2022')).toBeInTheDocument();
    expect(screen.getByAltText('Acme Corp logo')).toBeInTheDocument();

    // skills — proficiency renders as a <meter>.
    const meters = screen.getAllByRole('meter');
    expect(meters).toHaveLength(2);
    expect(meters[0]).toHaveAttribute('aria-label', 'TypeScript proficiency');

    // portfolio — project title, resolved media, and its links.
    expect(
      screen.getByRole('heading', { level: 3, name: 'Portfolio v6' }),
    ).toBeInTheDocument();
    expect(screen.getByAltText('Portfolio v6 screenshot')).toBeInTheDocument();
    const repoLink = screen.getByRole('link', { name: 'portfolio-v6' });
    expect(repoLink).toHaveAttribute('href', 'https://github.com/example/portfolio-v6');

    // contact — mailto link.
    expect(screen.getByRole('link', { name: 'hello@benkile.com' })).toHaveAttribute(
      'href',
      'mailto:hello@benkile.com',
    );
  });

  it('renders live sections as nothing (placeholders) while still resolving the rest', async () => {
    stubContent(fixtureDocument);

    renderHome();

    // The static sections rendered...
    await screen.findByRole('heading', { level: 1, name: 'Ben Kile' });
    // ...but the live placeholders emit no visible content of their own.
    expect(screen.queryByText(/not listening/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/degraded/i)).not.toBeInTheDocument();
  });

  it('degrades silently and logs when a section type is unknown', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    stubContent({
      version: 1,
      published_at: '2026-07-24T18:00:00Z',
      sections: [
        { id: 'a', type: 'hero', data: { title: 'Ben Kile' }, items: [] },
        // A type this build does not recognise.
        {
          id: 'b',
          type: 'testimonials' as never,
          data: {},
          items: [],
        },
      ],
    });

    renderHome();

    // The known section still renders...
    await screen.findByRole('heading', { level: 1, name: 'Ben Kile' });
    // ...the unknown one renders nothing but is logged exactly once.
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('testimonials'),
    );
  });

  it('renders an error state (not a crash) when the fetch fails', async () => {
    stubContent({} as ContentDocument);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({}, { ok: false, status: 500 })),
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});

    renderHome();

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
