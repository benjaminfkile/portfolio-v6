import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import SectionShell from './SectionShell';
import styles from './SectionShell.module.css';

describe('SectionShell', () => {
  it('renders eyebrow, heading, intro, and children', () => {
    render(
      <SectionShell eyebrow="// status" title="Systems" intro="All nominal.">
        <p>body content</p>
      </SectionShell>,
    );
    expect(screen.getByText('// status')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Systems' }),
    ).toBeInTheDocument();
    expect(screen.getByText('All nominal.')).toBeInTheDocument();
    expect(screen.getByText('body content')).toBeInTheDocument();
  });

  it('defaults the heading to <h2>', () => {
    render(<SectionShell title="Default" />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'Default',
    );
  });

  it('honours a custom heading level', () => {
    render(<SectionShell title="Top" headingLevel="h1" />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Top');
  });

  it('omits the eyebrow and intro when not provided', () => {
    render(<SectionShell title="Bare" />);
    expect(document.querySelector(`.${styles.eyebrow}`)).toBeNull();
    expect(document.querySelector(`.${styles.intro}`)).toBeNull();
  });

  it('renders no heading node for an empty title (never a blank h1, §7)', () => {
    // A hero whose document has no title passes title="" — SectionShell must
    // not emit an empty heading (a WCAG failure and a stray outline entry).
    render(<SectionShell title="" headingLevel="h1" eyebrow="// dev" />);
    expect(screen.queryByRole('heading')).toBeNull();
    // The rest of the header (the eyebrow) still renders.
    expect(document.querySelector(`.${styles.eyebrow}`)).not.toBeNull();
  });

  it('emits no header wrapper at all when eyebrow, title, and intro are all absent (§7 headerless)', () => {
    // When the published data has NO heading / eyebrow / intro the shell must
    // render no header markup — no empty <div>, no reserved whitespace. Body
    // children (if any) still render.
    render(
      <SectionShell>
        <p>just a body</p>
      </SectionShell>,
    );
    expect(screen.queryByRole('heading')).toBeNull();
    expect(document.querySelector(`.${styles.header}`)).toBeNull();
    expect(document.querySelector(`.${styles.eyebrow}`)).toBeNull();
    expect(document.querySelector(`.${styles.intro}`)).toBeNull();
    expect(screen.getByText('just a body')).toBeInTheDocument();
  });

  it('renders headerless when only an id is set (no aria-labelledby to a nonexistent heading)', () => {
    const { container } = render(<SectionShell id="empty" />);
    const section = container.querySelector('section');
    // No heading means no id target — the shell must not point aria-labelledby
    // at an id that does not exist in the DOM (§7).
    expect(section).not.toHaveAttribute('aria-labelledby');
  });

  it('labels the section by its heading for assistive tech', () => {
    const { container } = render(<SectionShell id="status" title="Status" />);
    const section = container.querySelector('section');
    expect(section).toHaveAttribute('aria-labelledby', 'status-title');
    expect(screen.getByRole('heading', { name: 'Status' })).toHaveAttribute(
      'id',
      'status-title',
    );
  });

  it('can render as a different landmark element', () => {
    const { container } = render(
      <SectionShell as="article" title="Article" />,
    );
    expect(container.querySelector('article')).toBeInTheDocument();
  });
});
