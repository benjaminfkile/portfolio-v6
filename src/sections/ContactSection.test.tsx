import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import ContactSection from './ContactSection';
import type { Link, Section } from '../types/content';

function contactSection(data: Record<string, unknown>): Section {
  return { id: 'sec-contact', type: 'contact', data, items: [] } as Section;
}

describe('ContactSection (DESIGN.md §5)', () => {
  it('renders the heading, body, and an email mailto LinkButton', () => {
    render(
      <ContactSection
        section={contactSection({
          title: 'Get in touch',
          body: 'Reach out any time.',
          email: 'hello@benkile.com',
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
        section={contactSection({ title: 'Contact', links })}
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

  it('falls back to a default heading and renders no row without actions', () => {
    render(
      <ContactSection
        section={contactSection({ body: 'Just a note.' })}
        media={{}}
      />,
    );

    expect(
      screen.getByRole('heading', { level: 2, name: 'Contact' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
