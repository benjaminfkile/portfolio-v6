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
