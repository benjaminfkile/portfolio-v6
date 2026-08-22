import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SiteFooter from './SiteFooter';
import { fixtureDocument } from '../test/fixtures';
import type { ContentDocument } from '../types/content';

/**
 * SiteFooter renders the contact row from the document's `contact` section
 * (2026-08-22: contact lives in the footer, never in the page flow).
 */
function stubContent(document: ContentDocument | null) {
  const fetchMock = vi.fn((path: string) => {
    if (path.startsWith('/api/content')) {
      return document
        ? Promise.resolve(
            new Response(JSON.stringify(document), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
          )
        : Promise.resolve(new Response('nope', { status: 500 }));
    }
    return Promise.resolve(new Response('{}', { status: 200 }));
  });
  vi.stubGlobal('fetch', fetchMock);
}

function renderFooter() {
  return render(
    <MemoryRouter>
      <SiteFooter />
    </MemoryRouter>,
  );
}

describe('SiteFooter contact row', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders every contact link with an icon and the body line, and no heading', async () => {
    const doc = structuredClone(fixtureDocument);
    const contact = doc.pages[0].sections.find((s) => s.type === 'contact')!;
    contact.data = {
      heading: 'Get in touch',
      body: 'Reach out any time.',
      links: [
        { type: 'email', label: 'hello@benkile.com', url: 'mailto:hello@benkile.com' },
        { type: 'phone', label: '406-555-0100', url: 'tel:+14065550100' },
        { type: 'linkedin', label: 'LinkedIn', url: 'https://www.linkedin.com/in/example' },
        { type: 'instagram', label: 'Instagram', url: 'https://instagram.com/example' },
        { type: 'facebook', label: 'Facebook', url: 'https://facebook.com/example' },
      ],
    };
    stubContent(doc);
    renderFooter();

    const list = await screen.findByRole('list', { name: 'Contact' });
    expect(list.querySelectorAll('li')).toHaveLength(5);
    expect(list.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(5);

    const email = screen.getByRole('link', { name: 'hello@benkile.com' });
    expect(email).toHaveAttribute('href', 'mailto:hello@benkile.com');
    expect(email).not.toHaveAttribute('target');

    const li = screen.getByRole('link', { name: 'LinkedIn' });
    expect(li).toHaveAttribute('target', '_blank');
    expect(li).toHaveAttribute('rel', 'noreferrer noopener');

    expect(screen.getByText('Reach out any time.')).toBeInTheDocument();
    expect(screen.queryByText('Get in touch')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('renders no contact row when the document has no contact section', async () => {
    const doc = structuredClone(fixtureDocument);
    for (const page of doc.pages) {
      page.sections = page.sections.filter((s) => s.type !== 'contact');
    }
    stubContent(doc);
    renderFooter();

    expect(await screen.findByText(`SITE v${doc.version}`)).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Contact' })).not.toBeInTheDocument();
  });

  it('still renders the brand when content fails to load', async () => {
    stubContent(null);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderFooter();

    expect(await screen.findByText('ben kile')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Contact' })).not.toBeInTheDocument();
  });
});
