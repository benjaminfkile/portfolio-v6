import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SmartLink, { internalPath } from './SmartLink';

// jsdom serves tests from http://localhost:3000 by default; that is "this site".
const ORIGIN = window.location.origin;

describe('internalPath', () => {
  it('returns the in-app path for a same-origin absolute URL', () => {
    expect(internalPath(`${ORIGIN}/blog/some-post?x=1#top`)).toBe('/blog/some-post?x=1#top');
  });

  it('treats a relative URL as internal', () => {
    expect(internalPath('/blog/some-post')).toBe('/blog/some-post');
  });

  it('returns null for another origin, including a different port or scheme', () => {
    expect(internalPath('https://example.com/blog/some-post')).toBeNull();
    expect(internalPath(`${ORIGIN.replace(/:\d+$/, '')}:9999/x`)).toBeNull();
  });

  it('returns null for an unparseable URL', () => {
    expect(internalPath('http://')).toBeNull();
  });
});

describe('SmartLink', () => {
  it('renders a same-origin link as in-page navigation inside a router', () => {
    const { container } = render(
      <MemoryRouter>
        <SmartLink href={`${ORIGIN}/blog/some-post`}>read</SmartLink>
      </MemoryRouter>,
    );
    const anchor = container.querySelector('a');
    expect(anchor).toHaveAttribute('href', '/blog/some-post');
    expect(anchor).not.toHaveAttribute('target');
    expect(anchor).toHaveTextContent('read');
  });

  it('renders a same-origin link as a plain same-tab anchor with no router', () => {
    const { container } = render(<SmartLink href={`${ORIGIN}/blog/some-post`}>read</SmartLink>);
    const anchor = container.querySelector('a');
    expect(anchor).toHaveAttribute('href', '/blog/some-post');
    expect(anchor).not.toHaveAttribute('target');
  });

  it('renders an off-site link in a new tab with noopener noreferrer', () => {
    const { container } = render(
      <MemoryRouter>
        <SmartLink href="https://example.com/x" className="c" data-link-type="repo">
          out
        </SmartLink>
      </MemoryRouter>,
    );
    const anchor = container.querySelector('a');
    expect(anchor).toHaveAttribute('href', 'https://example.com/x');
    expect(anchor).toHaveAttribute('target', '_blank');
    expect(anchor).toHaveAttribute('rel', 'noopener noreferrer');
    expect(anchor).toHaveClass('c');
    expect(anchor).toHaveAttribute('data-link-type', 'repo');
  });
});
