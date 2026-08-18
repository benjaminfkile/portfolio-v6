import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import ContactSection from './ContactSection';
import type { Link, Section } from '../types/content';

function contactSection(data: Record<string, unknown>): Section {
  return { id: 'sec-contact', type: 'contact', data, items: [] } as Section;
}

describe('ContactSection (DESIGN.md §5)', () => {
  it('renders the heading, body, and a mailto LinkButton from links', () => {
    // Email is not a schema field (contactData = heading/body/links) — an
    // email contact is expressed as a mailto: link in the ordered Link[].
    render(
      <ContactSection
        section={contactSection({
          heading: 'Get in touch',
          body: 'Reach out any time.',
          links: [
            {
              type: 'other',
              label: 'hello@benkile.com',
              url: 'mailto:hello@benkile.com',
            },
          ],
        })}
        media={{}}
      />,
    );

    expect(
      screen.getByRole('heading', { level: 2, name: 'Get in touch' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Reach out any time.')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'hello@benkile.com' }),
    ).toHaveAttribute('href', 'mailto:hello@benkile.com');
  });

  it('renders each Link as an external LinkButton in the actions row', () => {
    const links: Link[] = [
      { type: 'repo', label: 'GitHub', url: 'https://github.com/example' },
      { type: 'other', label: 'LinkedIn', url: 'https://linkedin.com/in/example' },
    ];

    render(
      <ContactSection
        section={contactSection({ heading: 'Contact', links })}
        media={{}}
      />,
    );

    const github = screen.getByRole('link', { name: 'GitHub' });
    expect(github).toHaveAttribute('href', 'https://github.com/example');
    // External links open in a new tab with a safe rel (LinkButton, §3.4).
    expect(github).toHaveAttribute('target', '_blank');
    expect(github).toHaveAttribute('rel', 'noreferrer noopener');
    expect(screen.getByRole('link', { name: 'LinkedIn' })).toBeInTheDocument();
  });

  it('emits no heading when the data has no heading (§7 headerless)', () => {
    const { container } = render(
      <ContactSection
        section={contactSection({ body: 'Just a note.' })}
        media={{}}
      />,
    );

    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(container.textContent).not.toContain('Contact');
    expect(screen.getByText('Just a note.')).toBeInTheDocument();
  });
});
