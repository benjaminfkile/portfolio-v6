import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import SkillsSection from './SkillsSection';
import type { Section, SectionItem } from '../types/content';
import { mockReducedMotion } from '../test/motion';

/**
 * Skills Console (v1.9, DESIGN.md §5) — the three-panel list / sphere / detail
 * console. jsdom has no WebGL, so the sphere renders its interactive chip
 * fallback: skill titles therefore appear in BOTH the list and the sphere
 * fallback. The list carries `aria-label="Skills"`, and the detail panel is a
 * `role="group"` labelled "Skill detail", so these suites scope queries to the
 * panel under test rather than relying on single-match text lookups.
 */

function skillsSection(
  items: SectionItem[],
  data: Record<string, unknown> = {},
): Section {
  return { id: 'sec-skills', type: 'skills', data, items } as Section;
}

const skills: SectionItem[] = [
  {
    id: 's1',
    data: {
      title: 'TypeScript',
      description: 'Daily driver.',
      icon_source: 'https://media.benkile.com/ts.svg',
    },
  },
  {
    id: 's2',
    data: {
      title: 'React',
      description: 'Comfortable with hooks and suspense across a big app.',
      icon_source: 'https://media.benkile.com/react.svg',
    },
  },
  {
    id: 's3',
    data: {
      title: 'Docker',
      description: 'Build and ship containers.',
      icon_source: 'https://media.benkile.com/docker.svg',
    },
  },
];

function renderConsole() {
  return render(<SkillsSection section={skillsSection(skills)} media={{}} />);
}

/** The left-panel list (labelled), distinct from the sphere's chip fallback. */
function list() {
  return screen.getByRole('list', { name: 'Skills' });
}

/** A left-panel row button by its skill title. */
function listButton(name: RegExp) {
  return within(list()).getByRole('button', { name });
}

/** The right-panel detail readout. */
function detail() {
  return screen.getByRole('group', { name: 'Skill detail' });
}

/** The sphere fallback's chip button for a skill (the one carrying the chip
 *  class, not the list row). */
function chipButton(name: RegExp): HTMLElement {
  const found = screen
    .getAllByRole('button', { name })
    .find((b) => /chip/.test(b.className));
  if (!found) throw new Error(`no chip button for ${name}`);
  return found;
}

describe('SkillsSection console — layout & list', () => {
  it('renders a labelled section with a heading', () => {
    renderConsole();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Skills' }),
    ).toBeInTheDocument();
  });

  it('renders one list entry per skill, in section item order', () => {
    renderConsole();
    const rows = within(list()).getAllByRole('button');
    expect(rows.map((b) => b.textContent)).toEqual([
      'TypeScript',
      'React',
      'Docker',
    ]);
  });

  it('falls back to a default heading and an empty list for no skills', () => {
    render(<SkillsSection section={skillsSection([])} media={{}} />);
    expect(
      screen.getByRole('heading', { level: 2, name: 'Skills' }),
    ).toBeInTheDocument();
    expect(within(list()).queryAllByRole('button')).toHaveLength(0);
  });
});

describe('SkillsSection console — preview (hover/focus)', () => {
  it('shows the STANDBY empty state until a skill is previewed or locked', () => {
    renderConsole();
    expect(within(detail()).getByText(/STANDBY/)).toBeInTheDocument();
    expect(detail()).toHaveAttribute('tabindex', '-1');
  });

  it('hover previews a skill — the detail shows its description', () => {
    renderConsole();
    fireEvent.mouseEnter(listButton(/TypeScript/));
    expect(within(detail()).getByText('Daily driver.')).toBeInTheDocument();
    // Focusable now there is something to scroll.
    expect(detail()).toHaveAttribute('tabindex', '0');
  });

  it('focus previews a skill too (keyboard parity)', () => {
    renderConsole();
    fireEvent.focus(listButton(/React/));
    expect(
      within(detail()).getByText(/Comfortable with hooks/),
    ).toBeInTheDocument();
  });

  it('un-hover clears the preview back to STANDBY when nothing is locked', () => {
    renderConsole();
    const btn = listButton(/TypeScript/);
    fireEvent.mouseEnter(btn);
    expect(within(detail()).getByText('Daily driver.')).toBeInTheDocument();
    fireEvent.mouseLeave(btn);
    expect(within(detail()).getByText(/STANDBY/)).toBeInTheDocument();
  });

  it('marks the detail region aria-live=polite for un-spammy announcements', () => {
    renderConsole();
    expect(detail()).toHaveAttribute('aria-live', 'polite');
  });
});

describe('SkillsSection console — lock (checkable selection)', () => {
  it('click locks a skill (aria-pressed) and the lock survives mouse-out', () => {
    renderConsole();
    const btn = listButton(/TypeScript/);
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-pressed', 'true');
    // Mouse-out: the locked description stays (the whole point — scrollable).
    fireEvent.mouseLeave(btn);
    expect(within(detail()).getByText('Daily driver.')).toBeInTheDocument();
  });

  it('locking another skill moves the lock (exactly one at a time)', () => {
    renderConsole();
    const ts = listButton(/TypeScript/);
    const react = listButton(/React/);
    fireEvent.click(ts);
    fireEvent.click(react);
    expect(ts).toHaveAttribute('aria-pressed', 'false');
    expect(react).toHaveAttribute('aria-pressed', 'true');
    fireEvent.mouseLeave(react);
    expect(
      within(detail()).getByText(/Comfortable with hooks/),
    ).toBeInTheDocument();
  });

  it('clicking the locked skill again unlocks it (back to STANDBY)', () => {
    renderConsole();
    const btn = listButton(/Docker/);
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    fireEvent.mouseLeave(btn);
    expect(within(detail()).getByText(/STANDBY/)).toBeInTheDocument();
  });

  it('preview overrides the lock, and clearing preview falls back to the lock', () => {
    renderConsole();
    fireEvent.click(listButton(/Docker/)); // lock Docker
    const react = listButton(/React/);
    fireEvent.mouseEnter(react); // preview React over the lock
    expect(
      within(detail()).getByText(/Comfortable with hooks/),
    ).toBeInTheDocument();
    fireEvent.mouseLeave(react); // preview cleared → back to the Docker lock
    expect(within(detail()).getByText('Build and ship containers.')).toBeInTheDocument();
  });
});

describe('SkillsSection console — DOM (chip) fallback highlight', () => {
  it('highlights the sphere chip for the previewed skill', () => {
    renderConsole();
    fireEvent.mouseEnter(listButton(/TypeScript/));
    expect(chipButton(/TypeScript/).className).toMatch(/chipActive/);
  });

  it('reflects the lock on the sphere chip via aria-pressed', () => {
    renderConsole();
    fireEvent.click(listButton(/React/));
    expect(chipButton(/React/)).toHaveAttribute('aria-pressed', 'true');
    // A different chip is not pressed.
    expect(chipButton(/Docker/)).toHaveAttribute('aria-pressed', 'false');
  });

  it('locking from the sphere chip syncs the list + detail', () => {
    renderConsole();
    fireEvent.click(chipButton(/Docker/));
    expect(listButton(/Docker/)).toHaveAttribute('aria-pressed', 'true');
    expect(within(detail()).getByText('Build and ship containers.')).toBeInTheDocument();
  });
});

describe('SkillsSection console — bus pulse & reduced motion', () => {
  it('fires a one-shot bus packet on a preview change (motion allowed)', () => {
    const restore = mockReducedMotion(false);
    try {
      renderConsole();
      // Nothing has changed yet → no packet.
      expect(screen.queryByTestId('skill-bus-packet')).not.toBeInTheDocument();
      fireEvent.mouseEnter(listButton(/TypeScript/));
      expect(screen.getByTestId('skill-bus-packet')).toBeInTheDocument();
    } finally {
      restore();
    }
  });

  it('fires a bus packet on a lock toggle (motion allowed)', () => {
    const restore = mockReducedMotion(false);
    try {
      renderConsole();
      fireEvent.click(listButton(/React/));
      expect(screen.getByTestId('skill-bus-packet')).toBeInTheDocument();
    } finally {
      restore();
    }
  });

  it('ignores an OS reduced-motion preference — the bus packet still fires (owner decision)', () => {
    const restore = mockReducedMotion(true);
    try {
      renderConsole();
      fireEvent.mouseEnter(listButton(/TypeScript/));
      fireEvent.click(listButton(/TypeScript/));
      expect(screen.getByTestId('skill-bus-packet')).toBeInTheDocument();
    } finally {
      restore();
    }
  });
});
