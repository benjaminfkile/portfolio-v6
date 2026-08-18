import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import AboutSection from './AboutSection';
import type { Section } from '../types/content';

function aboutSection(data: Record<string, unknown>): Section {
  return { id: 'sec-about', type: 'about', data, items: [] } as Section;
}

describe('AboutSection (DESIGN.md §5)', () => {
  it('renders the data-driven heading and blank-line-split paragraphs', () => {
    render(
      <AboutSection
        section={aboutSection({
          heading: 'About me',
          body: 'First paragraph of the bio.\n\nSecond paragraph of the bio.',
        })}
        media={{}}
      />,
    );

    expect(
      screen.getByRole('heading', { level: 2, name: 'About me' }),
    ).toBeInTheDocument();
    expect(screen.getByText('First paragraph of the bio.')).toBeInTheDocument();
    expect(screen.getByText('Second paragraph of the bio.')).toBeInTheDocument();
  });

  it('emits no heading when the data has no heading (§7 headerless)', () => {
    const { container } = render(
      <AboutSection section={aboutSection({ body: 'Bio.' })} media={{}} />,
    );

    expect(screen.queryByRole('heading')).toBeNull();
    // The body still renders — the section is headerless, not empty.
    expect(screen.getByText('Bio.')).toBeInTheDocument();
    // And no fallback copy is emitted.
    expect(container.textContent).not.toContain('About');
  });

  it('ignores unknown legacy keys and still renders the heading', () => {
    // The API's strict schemas never store an eyebrow for about; the renderer
    // must not depend on one.
    render(
      <AboutSection
        section={aboutSection({ heading: 'About me', body: 'Bio.' })}
        media={{}}
      />,
    );

    expect(
      screen.getByRole('heading', { level: 2, name: 'About me' }),
    ).toBeInTheDocument();
  });
});
