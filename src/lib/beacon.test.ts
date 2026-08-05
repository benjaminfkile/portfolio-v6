import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendEvent } from './beacon';

/**
 * Beacon client tests (spec §4.8). jsdom ships neither `navigator.sendBeacon`
 * nor `fetch` in a controllable form, so both are installed as spies. The
 * privacy gates — DNT, GPC, preview mode — must suppress *every* event, and the
 * happy path must post a JSON `{ event, path, referrer?, meta? }` body.
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
  it('posts via sendBeacon with a JSON blob carrying path, referrer, meta', async () => {
    sendEvent('link_out', { href: 'github.com/ben' });

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    const [endpoint, blob] = sendBeacon.mock.calls[0];
    expect(endpoint).toBe('/api/beacon');
    expect((blob as Blob).type).toBe('application/json');

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

  it('falls back to a keepalive fetch when sendBeacon is unavailable', () => {
    setNav('sendBeacon', undefined);
    sendEvent('theme_toggle');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [endpoint, init] = fetchSpy.mock.calls[0];
    expect(endpoint).toBe('/api/beacon');
    expect(init).toMatchObject({ method: 'POST', keepalive: true });
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
