import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SmartLink, { canonicalHosts, internalPath } from './SmartLink';

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

  it('treats the apex domain and its www. form as the same site', () => {
    // jsdom origin is http://localhost:3000; build the apex/www pair from it.
    const host = window.location.hostname;
    const port = window.location.port;
    expect(internalPath(`http://www.${host}:${port}/blog/p`)).toBe('/blog/p');
  });

  it('ignores scheme when deciding whether a link is internal', () => {
    const httpsSame = `https://${window.location.host}/blog/p`;
    expect(internalPath(httpsSame)).toBe('/blog/p');
  });

  it('returns null for an unparseable URL', () => {
    expect(internalPath('http://')).toBeNull();
  });
});

describe('internalPath on a non-canonical origin (preview deployment, localhost)', () => {
  // jsdom serves tests from localhost, which is NOT the canonical host, so this
  // is exactly the *.vercel.app situation: content links written against the
  // production domain must still count as internal and resolve to a path on
  // the current origin (never a jump to prod, never a new tab).
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults the canonical host to benkile.com', () => {
    vi.stubEnv('VITE_SITE_HOSTS', undefined as unknown as string);
    expect(canonicalHosts()).toEqual(['benkile.com']);
    expect(internalPath('https://benkile.com/blog/some-post?x=1#top')).toBe('/blog/some-post?x=1#top');
    expect(internalPath('https://www.benkile.com/blog/some-post')).toBe('/blog/some-post');
  });

  it('honors VITE_SITE_HOSTS as a comma-separated list, ignoring www. and whitespace', () => {
    vi.stubEnv('VITE_SITE_HOSTS', ' www.example.org, other.test ');
    expect(canonicalHosts()).toEqual(['example.org', 'other.test']);
    expect(internalPath('https://example.org/p')).toBe('/p');
    expect(internalPath('https://www.other.test/q')).toBe('/q');
    expect(internalPath('https://benkile.com/p')).toBeNull();
  });

  it('still treats unrelated hosts, and a canonical host on an explicit port, as off-site', () => {
    expect(internalPath('https://example.com/blog/some-post')).toBeNull();
    expect(internalPath('https://benkile.com:8443/blog/some-post')).toBeNull();
    expect(internalPath('https://api.benkile.com/portfolio-v6-api/api/posts')).toBeNull();
  });

  it('renders a canonical-host link as in-place navigation inside a router', () => {
    const { container } = render(
      <MemoryRouter>
        <SmartLink href="https://benkile.com/blog/building-wisper">Building Wisper</SmartLink>
      </MemoryRouter>,
    );
    const anchor = container.querySelector('a');
    expect(anchor).toHaveAttribute('href', '/blog/building-wisper');
    expect(anchor).not.toHaveAttribute('target');
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
