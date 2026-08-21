import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import { useDuolingo, type DuolingoState } from './useDuolingo';

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

/** A minimal consumer — the hook, not the rendering, is under test here. */
function Probe({
  language,
  onState,
}: {
  language: string;
  onState?: (state: DuolingoState) => void;
}) {
  const state = useDuolingo(language);
  onState?.(state);
  return <span data-status={state.status} />;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useDuolingo — shared per-language cache', () => {
  it('two consumers mounted with the same language share ONE fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        available: true,
        streak: 412,
        course: { title: 'Spanish', xp: 48_210, crowns: 155 },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(
      <>
        <Probe language="es" />
        <Probe language="es" />
      </>,
    );

    // Wait for the shared fetch to resolve, then assert exactly one HTTP call.
    await waitFor(() =>
      expect(
        document.querySelectorAll('[data-status="ready"]').length,
      ).toBe(2),
    );

    const duolingoCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).startsWith('/api/duolingo'),
    );
    expect(duolingoCalls).toHaveLength(1);
    expect(String(duolingoCalls[0][0])).toContain('language=es');
  });

  it('a second consumer that mounts after the fetch settles reads the cached ready state without re-fetching', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        available: true,
        streak: 100,
        course: { title: 'Spanish', xp: 1, crowns: 1 },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { unmount } = render(<Probe language="es" />);
    await waitFor(() =>
      expect(
        document.querySelector('[data-status]')?.getAttribute('data-status'),
      ).toBe('ready'),
    );
    expect(
      fetchMock.mock.calls.filter((c) =>
        String(c[0]).startsWith('/api/duolingo'),
      ),
    ).toHaveLength(1);

    unmount();

    // A second consumer mounts fresh; the module-level cache should serve it.
    const seen: DuolingoState[] = [];
    render(<Probe language="es" onState={(s) => seen.push(s)} />);
    // The initial render reads the cached ready state synchronously — no
    // loading-then-ready flicker.
    expect(seen[0]?.status).toBe('ready');
    expect(
      fetchMock.mock.calls.filter((c) =>
        String(c[0]).startsWith('/api/duolingo'),
      ),
    ).toHaveLength(1);
  });

  it('a different language mounts as its own cache and fetches once', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      const streak = String(url).includes('language=fr') ? 20 : 10;
      return Promise.resolve(
        jsonResponse({
          available: true,
          streak,
          course: { title: 'C', xp: 1, crowns: 1 },
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <>
        <Probe language="es" />
        <Probe language="fr" />
      </>,
    );

    await waitFor(() =>
      expect(
        document.querySelectorAll('[data-status="ready"]').length,
      ).toBe(2),
    );
    const duolingoCalls = fetchMock.mock.calls
      .map((c) => String(c[0]))
      .filter((u) => u.startsWith('/api/duolingo'));
    expect(duolingoCalls.sort()).toEqual([
      '/api/duolingo?language=es',
      '/api/duolingo?language=fr',
    ]);
  });

  it('settles to `unavailable` on an { available: false } payload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ available: false })),
    );

    const seen: DuolingoState[] = [];
    render(<Probe language="es" onState={(s) => seen.push(s)} />);

    await waitFor(() =>
      expect(seen[seen.length - 1]?.status).toBe('unavailable'),
    );
  });

  it('settles to `unavailable` (never throws) when the fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('network down')),
    );
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const seen: DuolingoState[] = [];
    render(<Probe language="es" onState={(s) => seen.push(s)} />);

    await waitFor(() =>
      expect(seen[seen.length - 1]?.status).toBe('unavailable'),
    );
    expect(errSpy).toHaveBeenCalled();
  });

  it('two mounts of the same language, one after the other, share ONE inflight fetch', async () => {
    // A fetch that never resolves — mount two probes and confirm only one call.
    const fetchMock = vi.fn().mockReturnValue(new Promise(() => {}));
    vi.stubGlobal('fetch', fetchMock);

    render(<Probe language="es" />);
    // Yield to let the useEffect kick off the first fetch.
    await act(async () => {
      await Promise.resolve();
    });
    render(<Probe language="es" />);
    await act(async () => {
      await Promise.resolve();
    });

    const duolingoCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).startsWith('/api/duolingo'),
    );
    expect(duolingoCalls).toHaveLength(1);
  });
});
