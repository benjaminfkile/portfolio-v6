import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import ResumeSection from './ResumeSection';
import { resumeDownloadUrl } from '../lib/api';
import type { Section } from '../types/content';

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function resumeSection(data: Record<string, unknown> = {}): Section {
  return { id: 'sec-resume', type: 'resume', data, items: [] } as Section;
}

function renderResume(data: Record<string, unknown> = {}) {
  return render(<ResumeSection section={resumeSection(data)} media={{}} />);
}

const availablePayload = {
  available: true,
  url: 'https://cdn.example.com/resume/v42.pdf',
  filename: 'ben-kile-resume-v42.pdf',
  bytes: 210_484,
  uploaded_at: '2026-08-17T10:00:00Z',
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ResumeSection (spec §3.5, DESIGN.md §5)', () => {
  it('renders the inline viewer and action buttons when a resume is available', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(availablePayload)));

    const { container } = renderResume();

    // Section heading is present up-front (SectionShell), and the viewer +
    // buttons appear once the live fetch resolves.
    expect(screen.getByRole('heading', { name: 'Resume' })).toBeInTheDocument();

    await waitFor(() => {
      expect(container.querySelector('object')).toBeInTheDocument();
    });

    const embed = container.querySelector('object')!;
    expect(embed.getAttribute('data')).toBe(availablePayload.url);
    expect(embed.getAttribute('type')).toBe('application/pdf');
    // Accessibility: the embed carries a label and a title for AT.
    expect(embed.getAttribute('aria-label')).toContain(availablePayload.filename);
    expect(embed.getAttribute('title')).toBeTruthy();

    // Buttons — the download button and the open-in-new-tab link.
    const download = screen.getByRole('link', { name: /download pdf/i });
    expect(download).toHaveAttribute('href', resumeDownloadUrl);
    // Download button asks the browser to save with the API-provided filename.
    expect(download).toHaveAttribute('download', availablePayload.filename);

    const openLinks = screen.getAllByRole('link', { name: /open (resume|in new tab)/i });
    expect(openLinks.length).toBeGreaterThan(0);
    for (const link of openLinks) {
      expect(link).toHaveAttribute('href', availablePayload.url);
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    }
  });

  it('renders a calm empty state on available:false (§3.5 degrade)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ available: false })),
    );

    const { container } = renderResume();

    expect(await screen.findByText(/no resume available/i)).toBeInTheDocument();
    // The section still renders its heading (page outline intact) but never a
    // broken embed or an alert role.
    expect(screen.getByRole('heading', { name: 'Resume' })).toBeInTheDocument();
    expect(container.querySelector('object')).toBeNull();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('degrades quietly when the fetch fails — no crash, no console errors surfaced', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({}, { ok: false, status: 500 })),
    );
    // The section swallows the error into a console.error; capture it so the
    // test suite stays clean and so we can assert it does not throw.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { container } = renderResume();

    expect(await screen.findByText(/no resume available/i)).toBeInTheDocument();
    expect(container.querySelector('object')).toBeNull();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    // The log line is intentional (§3.5), and no *uncaught* console errors
    // reached the test runner (nothing rethrew).
    expect(consoleError).toHaveBeenCalledTimes(1);
  });

  it('honors an author-provided heading and intro override', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(availablePayload)));

    renderResume({ heading: 'Curriculum Vitae', intro: 'Updated August 2026.' });

    expect(
      await screen.findByRole('heading', { name: 'Curriculum Vitae' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Updated August 2026.')).toBeInTheDocument();
  });
});
