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

const twoSkills: SectionItem[] = [
  {
    id: 's1',
    data: {
      title: 'TypeScript',
      description: '',
      icon_source: 'https://media.benkile.com/ts.svg',
    },
  },
  {
    id: 's2',
    data: {
      title: 'React',
      description: '',
      icon_source: 'https://media.benkile.com/react.svg',
    },
  },
];

describe('SkillsSection (DESIGN.md §5)', () => {
  it('renders inside a SectionShell with the SkillSphere fallback (chips + a11y list)', () => {
    // jsdom has no WebGL, so SkillSphere takes its chip fallback: an icon+name
    // chip per skill (icons decorative). No meters, no canvas.
    const { container } = render(
      <SkillsSection section={skillsSection(twoSkills)} media={{}} />,
    );

    // SectionShell landmark + default heading.
    expect(
      screen.getByRole('heading', { level: 2, name: 'Skills' }),
    ).toBeInTheDocument();

    // Fallback chips carry the skill names; icons are decorative (alt="").
    expect(screen.getByText('TypeScript')).toBeInTheDocument();
    expect(screen.getByText('React')).toBeInTheDocument();
    const imgs = container.querySelectorAll('img');
    expect(imgs).toHaveLength(2);
    expect(imgs[0]).toHaveAttribute('src', 'https://media.benkile.com/ts.svg');
    expect(imgs[0]).toHaveAttribute('aria-hidden', 'true');

    // The v5 skill rating is gone in v1.5 — no meters, no canvas on the jsdom path.
    expect(screen.queryAllByRole('meter')).toHaveLength(0);
    expect(container.querySelector('canvas')).toBeNull();
  });

  it('falls back to a default heading', () => {
    render(<SkillsSection section={skillsSection([])} media={{}} />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'Skills' }),
    ).toBeInTheDocument();
  });
});
