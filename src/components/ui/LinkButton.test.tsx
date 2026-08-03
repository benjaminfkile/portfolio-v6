import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import LinkButton from './LinkButton';
import styles from './LinkButton.module.css';

describe('LinkButton', () => {
  it('renders a button by default and fires onClick', () => {
    const onClick = vi.fn();
    render(<LinkButton onClick={onClick}>Send</LinkButton>);
    const button = screen.getByRole('button', { name: 'Send' });
    expect(button).toHaveAttribute('type', 'button');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('renders an anchor when given an href', () => {
    render(<LinkButton href="/about">About</LinkButton>);
    const link = screen.getByRole('link', { name: 'About' });
    expect(link).toHaveAttribute('href', '/about');
  });

  it('defaults to the link variant and applies the button variant class', () => {
    const { rerender } = render(<LinkButton>Text</LinkButton>);
    expect(screen.getByRole('button', { name: 'Text' })).toHaveClass(
      styles.link,
    );

    rerender(<LinkButton variant="button">Shaped</LinkButton>);
    expect(screen.getByRole('button', { name: 'Shaped' })).toHaveClass(
      styles.button,
    );
  });

  it('adds noreferrer noopener + new tab for external anchors', () => {
    render(
      <LinkButton href="https://example.com" external>
        Docs
      </LinkButton>,
    );
    const link = screen.getByRole('link', { name: 'Docs' });
    expect(link).toHaveAttribute('rel', 'noreferrer noopener');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('does not mark internal anchors as external', () => {
    render(<LinkButton href="/contact">Contact</LinkButton>);
    const link = screen.getByRole('link', { name: 'Contact' });
    expect(link).not.toHaveAttribute('rel');
    expect(link).not.toHaveAttribute('target');
  });
});
