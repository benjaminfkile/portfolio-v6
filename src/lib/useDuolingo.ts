import { useEffect, useState } from 'react';
import { getDuolingo } from './api';
import type { DuolingoResponse } from './api';

/**
 * Shared Duolingo state — one module-level cache keyed by language, consumed by
 * every component that wants the live Duolingo readout (the standalone
 * {@link ../sections/DuolingoSection} and the hero-strip item, spec §3.5).
 *
 * The `/api/duolingo` payload changes over days (a streak ticks once a day, XP
 * over sessions), so the fetch runs ONCE on the first consumer's mount for a
 * given language and every later consumer with that language reads the cached
 * result — a page with both the standalone section and the hero-strip item
 * therefore only hits the endpoint once. Same degrade rule as the section
 * itself: an `{ available: false }` payload, a shape drift, or a failed fetch
 * settles to `unavailable`, which consumers render as nothing.
 */
export type DuolingoState =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'ready'; data: Extract<DuolingoResponse, { available: true }> };

const INITIAL: DuolingoState = { status: 'loading' };

const cache = new Map<string, DuolingoState>();
const inflight = new Map<string, Promise<void>>();
const subscribers = new Map<string, Set<() => void>>();

function emit(language: string, next: DuolingoState): void {
  cache.set(language, next);
  subscribers.get(language)?.forEach((listener) => listener());
}

function ensure(language: string): void {
  if (cache.has(language) && cache.get(language)!.status !== 'loading') return;
  if (inflight.has(language)) return;

  cache.set(language, INITIAL);
  const promise = getDuolingo(language)
    .then((data) => {
      emit(
        language,
        data.available
          ? { status: 'ready', data }
          : { status: 'unavailable' },
      );
    })
    .catch((error: unknown) => {
      // Degrade to nothing — a failed fetch is not a broken widget (§3.5).
      emit(language, { status: 'unavailable' });
      console.error('Failed to load Duolingo', error);
    })
    .finally(() => {
      inflight.delete(language);
    });
  inflight.set(language, promise);
}

/**
 * Subscribe to the shared Duolingo state for `language`. Every mounted consumer
 * for the same language reads the same snapshot and re-renders together; the
 * underlying HTTP fetch is single, shared, and cached for the lifetime of the
 * module (no polling). Consumers render `unavailable` and `loading` as nothing.
 */
export function useDuolingo(language: string): DuolingoState {
  const [state, setState] = useState<DuolingoState>(
    () => cache.get(language) ?? INITIAL,
  );

  useEffect(() => {
    ensure(language);
    setState(cache.get(language) ?? INITIAL);

    const listener = () => {
      setState(cache.get(language) ?? INITIAL);
    };
    let set = subscribers.get(language);
    if (!set) {
      set = new Set();
      subscribers.set(language, set);
    }
    set.add(listener);
    return () => {
      set!.delete(listener);
    };
  }, [language]);

  return state;
}

/**
 * Test-only: clear the module-level cache and subscribers so state can't leak
 * between test cases. Does not abort in-flight fetches — tests should stub
 * `fetch` per case and let any prior promise resolve quietly into the reset
 * cache.
 */
export function __resetDuolingoForTests(): void {
  cache.clear();
  inflight.clear();
  subscribers.clear();
}
