import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { __resetNowPlayingForTests } from '../lib/useNowPlaying';

// React Testing Library does not auto-clean between tests under Vitest unless
// afterEach is registered explicitly.
afterEach(() => {
  cleanup();
  // The shared now-playing store is module-level state — reset it after every
  // test (post-unmount) so a snapshot from one test can't leak into the next.
  __resetNowPlayingForTests();
});
