import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import SkillsSection from './SkillsSection';
import type { Section, SectionItem } from '../types/content';

function skillsSection(
  items: SectionItem[],
  data: Record<string, unknown> = {},
): Section {
  return { id: 'sec-skills', type: 'skills', data, items } as Section;
}

describe('SkillsSection (DESIGN.md §5)', () => {
  it('renders each skill icon, name, and a Meter at its proficiency percent', () => {
    render(
      <SkillsSection
        section={skillsSection([
          {
            id: 's1',
            data: {
              title: 'TypeScript',
              description: '',
              icon_source: 'https://media.benkile.com/ts.svg',
              proficiency: 85,
            },
          },
          {
            id: 's2',
            data: {
              title: 'React',
              description: '',
              icon_source: 'https://media.benkile.com/react.svg',
              proficiency: 70,
            },
          },
        ])}
        media={{}}
      />,
    );

    // The icon's alt is the skill title (DESIGN.md §5).
    expect(screen.getByRole('img', { name: 'TypeScript' })).toHaveAttribute(
      'src',
      'https://media.benkile.com/ts.svg',
    );
    expect(screen.getByText('React')).toBeInTheDocument();

    // The Meter renders the proficiency as a mono percent readout and exposes
    // matching meter semantics.
    expect(screen.getByText('85%')).toBeInTheDocument();
    expect(screen.getByText('70%')).toBeInTheDocument();
    const meters = screen.getAllByRole('meter');
    expect(meters[0]).toHaveAttribute('aria-valuenow', '85');
    expect(meters[1]).toHaveAttribute('aria-valuenow', '70');
  });

  it('clamps an out-of-range proficiency to the 0–100 meter scale', () => {
    render(
      <SkillsSection
        section={skillsSection([
          {
            id: 's1',
            data: {
              title: 'Docker',
              description: '',
              icon_source: 'https://media.benkile.com/docker.svg',
              proficiency: 140,
            },
          },
        ])}
        media={{}}
      />,
    );

    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '100');
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('falls back to a default heading', () => {
    render(<SkillsSection section={skillsSection([])} media={{}} />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'Skills' }),
    ).toBeInTheDocument();
  });
});
