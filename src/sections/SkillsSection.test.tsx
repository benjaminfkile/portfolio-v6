import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import SkillsSection from './SkillsSection';
import type { Section, SectionItem } from '../types/content';
import { mockViewport } from '../test/viewport';

/**
 * Skills Console (v1.9, DESIGN.md §5) — the three-panel list / sphere / detail
 * console. jsdom has no WebGL, so the sphere renders its interactive chip
 * fallback: skill titles therefore appear in BOTH the list and the sphere
 * fallback. The list carries `aria-label="Skills"`, and the detail panel is a
 * `role="group"` labelled "Skill detail", so these suites scope queries to the
 * panel under test rather than relying on single-match text lookups.
 *
 * The console has two modes that key off the same 900px breakpoint the CSS
 * uses (`useIsDesktop`): DESKTOP is hover-preview only (no click anywhere
 * latches a persistent selection), MOBILE is tap-to-select on the sphere.
 * jsdom ships no matchMedia, so each suite installs `mockViewport(...)` to
 * pin the mode it exercises.
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
  return render(
    <SkillsSection
      section={skillsSection(skills, { heading: 'Skills' })}
      media={{}}
    />,
  );
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

describe('SkillsSection console — layout & list (desktop)', () => {
  let restore: () => void;
  beforeEach(() => {
    restore = mockViewport(true);
  });
  afterEach(() => restore());

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

  it('emits no heading when the section has none (§7 headerless)', () => {
    render(<SkillsSection section={skillsSection([])} media={{}} />);
    expect(screen.queryByRole('heading')).toBeNull();
    expect(within(list()).queryAllByRole('button')).toHaveLength(0);
  });
});

describe('SkillsSection console — desktop hover-preview (no latch)', () => {
  let restore: () => void;
  beforeEach(() => {
    restore = mockViewport(true);
  });
  afterEach(() => restore());

  it('shows the STANDBY empty state until a skill is previewed', () => {
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

  it('un-hover clears the preview back to STANDBY (no latch)', () => {
    renderConsole();
    const btn = listButton(/TypeScript/);
    fireEvent.mouseEnter(btn);
    expect(within(detail()).getByText('Daily driver.')).toBeInTheDocument();
    fireEvent.mouseLeave(btn);
    expect(within(detail()).getByText(/STANDBY/)).toBeInTheDocument();
  });

  it('list rows carry no aria-pressed (desktop is not a toggle)', () => {
    renderConsole();
    for (const row of within(list()).getAllByRole('button')) {
      expect(row).not.toHaveAttribute('aria-pressed');
    }
  });

  it('clicking a list row latches nothing — mouse-out returns to STANDBY', () => {
    renderConsole();
    const btn = listButton(/TypeScript/);
    fireEvent.click(btn);
    // A click after mouse-out must not survive: STANDBY comes back.
    fireEvent.mouseLeave(btn);
    expect(within(detail()).getByText(/STANDBY/)).toBeInTheDocument();
  });

  it('clicking a sphere chip latches nothing — no aria-pressed, no persistent detail', () => {
    renderConsole();
    const chip = chipButton(/Docker/);
    // Desktop chip advertises no toggle semantics — there's no aria-pressed at all.
    expect(chip).not.toHaveAttribute('aria-pressed');
    fireEvent.click(chip);
    fireEvent.mouseLeave(chip);
    // No persistent selection after the click clears.
    expect(within(detail()).getByText(/STANDBY/)).toBeInTheDocument();
  });

  it('marks the detail region aria-live=polite for un-spammy announcements', () => {
    renderConsole();
    expect(detail()).toHaveAttribute('aria-live', 'polite');
  });
});

describe('SkillsSection console — desktop keyboard focus preview', () => {
  let restore: () => void;
  beforeEach(() => {
    restore = mockViewport(true);
  });
  afterEach(() => restore());

  it('keyboard focus on a list row previews like hover', () => {
    renderConsole();
    fireEvent.focus(listButton(/React/));
    expect(
      within(detail()).getByText(/Comfortable with hooks/),
    ).toBeInTheDocument();
    expect(detail()).toHaveAttribute('tabindex', '0');
  });

  it('blur releases the preview — back to STANDBY', () => {
    renderConsole();
    const btn = listButton(/React/);
    fireEvent.focus(btn);
    expect(
      within(detail()).getByText(/Comfortable with hooks/),
    ).toBeInTheDocument();
    fireEvent.blur(btn);
    expect(within(detail()).getByText(/STANDBY/)).toBeInTheDocument();
  });
});

describe('SkillsSection console — DOM (chip) fallback highlight (desktop)', () => {
  let restore: () => void;
  beforeEach(() => {
    restore = mockViewport(true);
  });
  afterEach(() => restore());

  it('highlights the sphere chip for the previewed skill', () => {
    renderConsole();
    fireEvent.mouseEnter(listButton(/TypeScript/));
    expect(chipButton(/TypeScript/).className).toMatch(/chipActive/);
  });

  it('does not carry aria-pressed on desktop (hover-preview only)', () => {
    renderConsole();
    for (const chip of screen
      .getAllByRole('button')
      .filter((b) => /chip/.test(b.className))) {
      expect(chip).not.toHaveAttribute('aria-pressed');
    }
  });
});

describe('SkillsSection console — mobile selection (unchanged)', () => {
  // Below the 900px breakpoint the list is hidden (CSS), the sphere is the
  // only selector, and a tap on a chip LATCHES via aria-pressed so the detail
  // pane survives moving on. Tap again to unlock. This suite pins mobile mode
  // and asserts the byte-for-byte previous behaviour of that flow.
  let restore: () => void;
  beforeEach(() => {
    restore = mockViewport(false);
  });
  afterEach(() => restore());

  it('tap on a sphere chip locks it (aria-pressed) and survives mouse-out', () => {
    renderConsole();
    const chip = chipButton(/TypeScript/);
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    fireEvent.mouseLeave(chip);
    expect(within(detail()).getByText('Daily driver.')).toBeInTheDocument();
  });

  it('locking another chip moves the lock (exactly one at a time)', () => {
    renderConsole();
    const ts = chipButton(/TypeScript/);
    const react = chipButton(/React/);
    fireEvent.click(ts);
    fireEvent.click(react);
    expect(ts).toHaveAttribute('aria-pressed', 'false');
    expect(react).toHaveAttribute('aria-pressed', 'true');
    fireEvent.mouseLeave(react);
    expect(
      within(detail()).getByText(/Comfortable with hooks/),
    ).toBeInTheDocument();
  });

  it('tapping the locked chip again unlocks it (back to STANDBY)', () => {
    renderConsole();
    const chip = chipButton(/Docker/);
    fireEvent.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    fireEvent.mouseLeave(chip);
    expect(within(detail()).getByText(/STANDBY/)).toBeInTheDocument();
  });

  it('preview overrides the lock, and clearing preview falls back to the lock', () => {
    renderConsole();
    fireEvent.click(chipButton(/Docker/)); // lock Docker
    const react = chipButton(/React/);
    fireEvent.mouseEnter(react); // preview React over the lock
    expect(
      within(detail()).getByText(/Comfortable with hooks/),
    ).toBeInTheDocument();
    fireEvent.mouseLeave(react); // preview cleared → back to the Docker lock
    expect(
      within(detail()).getByText('Build and ship containers.'),
    ).toBeInTheDocument();
  });
});

describe('SkillsSection console — bus pulse', () => {
  // `usePrefersReducedMotion` unconditionally returns false site-wide (owner
  // decision, see prefersReducedMotion.ts) so these don't touch that mock:
  // motion is always allowed and the pulse fires regardless of the OS flag.
  it('fires a one-shot bus packet on a desktop preview change', () => {
    const restore = mockViewport(true);
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

  it('fires a bus packet on a mobile lock toggle', () => {
    const restore = mockViewport(false);
    try {
      renderConsole();
      fireEvent.click(chipButton(/React/));
      expect(screen.getByTestId('skill-bus-packet')).toBeInTheDocument();
    } finally {
      restore();
    }
  });
});
