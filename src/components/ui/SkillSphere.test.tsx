import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import SkillSphere, { pickDetail, resolveSkillIconUrl } from './SkillSphere';
import type { SkillSphereSkill } from './SkillSphere';

const SKILLS: SkillSphereSkill[] = [
  { id: 's1', title: 'TypeScript', icon_source: 'https://media.example.com/ts.svg' },
  { id: 's2', title: 'React', icon_source: 'https://media.example.com/react.svg' },
  { id: 's3', title: 'Docker', icon_source: 'https://media.example.com/docker.svg' },
];

describe('pickDetail (auto sphere density)', () => {
  it('picks the smallest detail whose face count covers the skills', () => {
    // Face counts: 0→20, 1→80, 2→180, 3→320, 4→500.
    expect(pickDetail(0)).toBe(0);
    expect(pickDetail(1)).toBe(0);
    expect(pickDetail(20)).toBe(0); // exactly fills detail 0
    expect(pickDetail(21)).toBe(1); // one over → detail 1
    expect(pickDetail(80)).toBe(1); // boundary of detail 1
    expect(pickDetail(81)).toBe(2);
    expect(pickDetail(180)).toBe(2); // boundary of detail 2
    expect(pickDetail(181)).toBe(3);
    expect(pickDetail(320)).toBe(3); // boundary of detail 3
    expect(pickDetail(321)).toBe(4);
    expect(pickDetail(500)).toBe(4); // boundary of detail 4
  });

  it('clamps counts above the densest sphere to 4', () => {
    expect(pickDetail(501)).toBe(4);
    expect(pickDetail(10000)).toBe(4);
  });
});

describe('resolveSkillIconUrl (theme-aware icon resolution, Icons v1.6)', () => {
  const light = 'https://media.example.com/ts-light.svg';
  const dark = 'https://media.example.com/ts-dark.svg';

  it('uses icon_source_dark under the dark theme when present', () => {
    expect(
      resolveSkillIconUrl({ icon_source: light, icon_source_dark: dark }, false),
    ).toBe(dark);
  });

  it('falls back to icon_source under the dark theme when no override', () => {
    expect(resolveSkillIconUrl({ icon_source: light }, false)).toBe(light);
  });

  it('always uses icon_source under the light theme, even with an override', () => {
    expect(
      resolveSkillIconUrl({ icon_source: light, icon_source_dark: dark }, true),
    ).toBe(light);
    expect(resolveSkillIconUrl({ icon_source: light }, true)).toBe(light);
  });
});

describe('SkillSphere fallback (no WebGL — the jsdom path)', () => {
  // jsdom cannot create a WebGL context, so every render here takes the chip
  // fallback and never loads three.js.
  it('renders a chip grid of icon + name when WebGL is unavailable', () => {
    render(<SkillSphere skills={SKILLS} />);

    expect(screen.getByText('TypeScript')).toBeInTheDocument();
    expect(screen.getByText('React')).toBeInTheDocument();
    expect(screen.getByText('Docker')).toBeInTheDocument();

    // Each chip carries the icon as a decorative image (alt="", aria-hidden).
    const imgs = document.querySelectorAll('img');
    expect(imgs).toHaveLength(3);
    expect(imgs[0]).toHaveAttribute('src', 'https://media.example.com/ts.svg');
    expect(imgs[0]).toHaveAttribute('aria-hidden', 'true');
  });

  it('does not mount a <canvas> on the fallback path', () => {
    const { container } = render(<SkillSphere skills={SKILLS} />);
    expect(container.querySelector('canvas')).toBeNull();
  });

  it('renders both light + dark imgs for a skill with a dark override', () => {
    const skills: SkillSphereSkill[] = [
      {
        id: 'd1',
        title: 'Vercel',
        icon_source: 'https://media.example.com/vercel-light.svg',
        icon_source_dark: 'https://media.example.com/vercel-dark.svg',
      },
      // A single-URL neighbour still renders exactly one img.
      { id: 'd2', title: 'React', icon_source: 'https://media.example.com/react.svg' },
    ];
    const { container } = render(<SkillSphere skills={skills} />);

    const imgs = container.querySelectorAll('img');
    // Two for the dual-URL skill, one for the single-URL skill.
    expect(imgs).toHaveLength(3);

    const srcs = Array.from(imgs).map((img) => img.getAttribute('src'));
    expect(srcs).toContain('https://media.example.com/vercel-light.svg');
    expect(srcs).toContain('https://media.example.com/vercel-dark.svg');
    expect(srcs).toContain('https://media.example.com/react.svg');

    // CSS (not JS) drives the swap: both variants ship distinct classes so the
    // module rules can show/hide by data-theme. Every icon is decorative.
    imgs.forEach((img) => expect(img).toHaveAttribute('aria-hidden', 'true'));
    const dualImgs = Array.from(imgs).filter((img) => {
      const src = img.getAttribute('src') ?? '';
      return src.includes('vercel');
    });
    expect(dualImgs).toHaveLength(2);
    const classes = dualImgs.map((img) => img.className);
    expect(classes.some((c) => /chipIconLight/.test(c))).toBe(true);
    expect(classes.some((c) => /chipIconDark/.test(c))).toBe(true);
  });

  it('renders an empty chip grid for no skills without crashing', () => {
    const { container } = render(<SkillSphere skills={[]} />);
    expect(container.querySelector('ul')).toBeInTheDocument();
    expect(container.querySelectorAll('li')).toHaveLength(0);
    expect(container.querySelector('canvas')).toBeNull();
  });
});
