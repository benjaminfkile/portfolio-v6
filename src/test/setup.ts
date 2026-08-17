import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { __resetNowPlayingForTests } from '../lib/useNowPlaying';
import {
  __installFakeHubForTests,
  __resetHubDoubleForTests,
} from './hubDouble';

// React Testing Library does not auto-clean between tests under Vitest unless
// afterEach is registered explicitly.
afterEach(() => {
  cleanup();
  // The shared now-playing store is module-level state — reset it after every
  // test (post-unmount) so a snapshot from one test can't leak into the next.
  __resetNowPlayingForTests();
  __resetHubDoubleForTests();
});

// Install a controllable SignalR hub double for every test. Individual tests
// can drive it via `hubDouble.ts` helpers when they care; tests that don't
// touch the hub get a default "never connects" behavior so the fast-polling
// path is exercised naturally.
__installFakeHubForTests();
