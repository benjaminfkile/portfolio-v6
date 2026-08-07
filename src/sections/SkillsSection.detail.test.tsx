import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Section, SectionItem } from '../types/content';

// The sphere density is a canvas-only concern — the jsdom chip fallback ignores
// `detail` entirely — so passthrough is asserted against a stubbed SkillSphere
// that records the props SkillsSection hands it. (Its own file so this module
// mock doesn't replace the real SkillSphere in SkillsSection.test.tsx.)
const detailSpy = vi.fn();
vi.mock('../components/ui/SkillSphere', () => ({
  default: (props: { skills: { id: string }[]; detail?: number }) => {
    detailSpy(props.detail);
    return <div data-testid="sphere">{props.skills.length} skills</div>;
  },
}));

// Imported after the mock is registered (vi.mock is hoisted regardless).
const { default: SkillsSection } = await import('./SkillsSection');

function skillsSection(
  items: SectionItem[],
  data: Record<string, unknown> = {},
): Section {
  return { id: 'sec-skills', type: 'skills', data, items } as Section;
}

const twoSkills: SectionItem[] = [
  { id: 's1', data: { title: 'TypeScript', description: '', icon_source: 'a.svg' } },
  { id: 's2', data: { title: 'React', description: '', icon_source: 'b.svg' } },
];

describe('SkillsSection sphere_detail passthrough', () => {
  it('passes the configured sphere_detail through to SkillSphere', () => {
    render(
      <SkillsSection
        section={skillsSection(twoSkills, { sphere_detail: 3 })}
        media={{}}
      />,
    );

    expect(screen.getByTestId('sphere')).toHaveTextContent('2 skills');
    expect(detailSpy).toHaveBeenLastCalledWith(3);
  });

  it('leaves detail undefined (auto-fit) when sphere_detail is absent', () => {
    render(<SkillsSection section={skillsSection(twoSkills)} media={{}} />);

    expect(detailSpy).toHaveBeenLastCalledWith(undefined);
  });
});
