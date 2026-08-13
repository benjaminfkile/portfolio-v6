import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendEvent } from './beacon';

/**
 * Beacon client tests (spec §4.8). jsdom ships neither `navigator.sendBeacon`
 * nor `fetch` in a controllable form, so both are installed as spies. The
 * privacy gates — DNT, GPC, preview mode — must suppress *every* event, and the
 * happy path must post a JSON `{ event, path, referrer?, meta? }` body against
 * the API origin with a CORS-safelisted content type (bug #42: `application/json`
 * blows the preflight cross-origin and hit Vercel's 405 rewriter).
 */

let sendBeacon: ReturnType<typeof vi.fn>;
let fetchSpy: ReturnType<typeof vi.fn>;

/** Set the current URL (path + optional query) the way navigation would. */
function setUrl(url: string): void {
  window.history.pushState({}, '', url);
}

/** Define a (re)configurable navigator property. */
function setNav(prop: string, value: unknown): void {
  Object.defineProperty(navigator, prop, { value, configurable: true });
}

beforeEach(() => {
  setUrl('/work');
  sendBeacon = vi.fn().mockReturnValue(true);
  setNav('sendBeacon', sendBeacon);
  setNav('doNotTrack', null);
  setNav('globalPrivacyControl', undefined);
  // A referrer for the body; jsdom's document.referrer defaults to ''.
  Object.defineProperty(document, 'referrer', {
    value: 'https://ref.example/from',
    configurable: true,
  });
  fetchSpy = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.restoreAllMocks();
});

/** Read a Blob's text via FileReader — jsdom's Blob has no `.text()`. */
function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

/** Parse the JSON body handed to sendBeacon (a Blob). */
async function beaconBody(): Promise<Record<string, unknown>> {
  const blob = sendBeacon.mock.calls[0][1] as Blob;
  return JSON.parse(await readBlob(blob));
}

describe('sendEvent', () => {
  it('posts via sendBeacon with a CORS-safelisted text/plain blob carrying path, referrer, meta', async () => {
    sendEvent('link_out', { href: 'github.com/ben' });

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    const [endpoint, blob] = sendBeacon.mock.calls[0];
    expect(endpoint).toBe('/api/beacon');
    // Content type must be CORS-safelisted (bug #42): application/json triggers
    // a preflight sendBeacon cannot make, failing cross-origin silently.
    expect((blob as Blob).type).toBe('text/plain');

    expect(await beaconBody()).toEqual({
      event: 'link_out',
      path: '/work',
      referrer: 'https://ref.example/from',
      meta: { href: 'github.com/ben' },
    });
    // sendBeacon succeeded: no fallback fetch.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('omits referrer and meta when absent', async () => {
    Object.defineProperty(document, 'referrer', {
      value: '',
      configurable: true,
    });
    sendEvent('pageview');

    const body = await beaconBody();
    expect(body).toEqual({ event: 'pageview', path: '/work' });
    expect('referrer' in body).toBe(false);
    expect('meta' in body).toBe(false);
  });

  it('sends nothing when Do Not Track is "1"', () => {
    setNav('doNotTrack', '1');
    sendEvent('pageview');
    expect(sendBeacon).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sends nothing when Global Privacy Control is set', () => {
    setNav('globalPrivacyControl', true);
    sendEvent('pageview');
    expect(sendBeacon).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sends nothing in preview mode (?preview= token present)', () => {
    setUrl('/work?preview=tok123');
    sendEvent('pageview');
    expect(sendBeacon).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('still beacons for an empty ?preview (not a real token)', () => {
    setUrl('/work?preview=');
    sendEvent('pageview');
    expect(sendBeacon).toHaveBeenCalledTimes(1);
  });

  it('falls back to a keepalive fetch with a text/plain Content-Type when sendBeacon is unavailable', () => {
    setNav('sendBeacon', undefined);
    sendEvent('theme_toggle');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [endpoint, init] = fetchSpy.mock.calls[0];
    expect(endpoint).toBe('/api/beacon');
    expect(init).toMatchObject({ method: 'POST', keepalive: true });
    // Content type must be CORS-safelisted (bug #42) — an application/json
    // Content-Type would trigger a preflight the keepalive fetch cannot survive.
    expect((init as RequestInit).headers).toMatchObject({
      'Content-Type': 'text/plain',
    });
    expect(JSON.parse(init.body as string)).toMatchObject({
      event: 'theme_toggle',
      path: '/work',
    });
  });

  it('falls back to fetch when sendBeacon refuses the payload (returns false)', () => {
    sendBeacon.mockReturnValue(false);
    sendEvent('scroll_depth');

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][1]).toMatchObject({ keepalive: true });
  });

  it('swallows a rejected fallback fetch (fire-and-forget)', () => {
    setNav('sendBeacon', undefined);
    fetchSpy.mockRejectedValue(new Error('network'));
    expect(() => sendEvent('pageview')).not.toThrow();
  });
});

/**
 * Endpoint resolution (bug #42). The endpoint is derived once at module import
 * from `VITE_API_BASE_URL` so events reach the API origin on the deployed site,
 * with the same-origin relative path as the fallback for tests / local dev.
 * Each test resets the module cache so the new env is picked up on import.
 */
describe('sendEvent endpoint resolution', () => {
  it('prefixes the API base URL when VITE_API_BASE_URL is set (deployed origin, no more 405 from Vercel)', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test');
    vi.resetModules();
    const { sendEvent: sendEventFresh } = await import('./beacon');

    sendEventFresh('pageview');

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect(sendBeacon.mock.calls[0][0]).toBe('https://api.example.test/api/beacon');
  });

  it('strips a trailing slash from the base URL before appending /api/beacon', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test/');
    vi.resetModules();
    const { sendEvent: sendEventFresh } = await import('./beacon');

    sendEventFresh('pageview');

    expect(sendBeacon.mock.calls[0][0]).toBe('https://api.example.test/api/beacon');
  });

  it('falls back to the same-origin relative path when VITE_API_BASE_URL is empty', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '');
    vi.resetModules();
    const { sendEvent: sendEventFresh } = await import('./beacon');

    sendEventFresh('pageview');

    expect(sendBeacon.mock.calls[0][0]).toBe('/api/beacon');
  });

  it('applies the base URL to the fetch fallback too', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test');
    vi.resetModules();
    const { sendEvent: sendEventFresh } = await import('./beacon');
    setNav('sendBeacon', undefined);

    sendEventFresh('pageview');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toBe('https://api.example.test/api/beacon');
  });
});
