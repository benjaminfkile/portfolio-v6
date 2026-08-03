import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import TagChip from './TagChip';
import styles from './TagChip.module.css';

describe('TagChip', () => {
  it('renders as a span by default', () => {
    render(<TagChip>TypeScript</TagChip>);
    const chip = screen.getByText('TypeScript');
    expect(chip.tagName).toBe('SPAN');
    expect(chip).toHaveClass(styles.chip);
    expect(chip).not.toHaveClass(styles.link);
  });

  it('renders as an anchor when given an href', () => {
    render(<TagChip href="/tags/react">React</TagChip>);
    const link = screen.getByRole('link', { name: 'React' });
    expect(link).toHaveAttribute('href', '/tags/react');
    expect(link).toHaveClass(styles.link);
  });

  it('adds noreferrer noopener + new tab for external links', () => {
    render(
      <TagChip href="https://example.com" external>
        Repo
      </TagChip>,
    );
    const link = screen.getByRole('link', { name: 'Repo' });
    expect(link).toHaveAttribute('rel', 'noreferrer noopener');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('does not add external attributes to internal links', () => {
    render(<TagChip href="/local">Local</TagChip>);
    const link = screen.getByRole('link', { name: 'Local' });
    expect(link).not.toHaveAttribute('rel');
    expect(link).not.toHaveAttribute('target');
  });
});
