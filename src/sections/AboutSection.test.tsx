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
          title: 'About me',
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

  it('falls back to a default heading when none is provided', () => {
    render(<AboutSection section={aboutSection({ body: 'Bio.' })} media={{}} />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'About' }),
    ).toBeInTheDocument();
  });

  it('renders an optional eyebrow', () => {
    render(
      <AboutSection
        section={aboutSection({ title: 'About me', eyebrow: '// about' })}
        media={{}}
      />,
    );

    expect(screen.getByText('// about')).toBeInTheDocument();
  });
});
