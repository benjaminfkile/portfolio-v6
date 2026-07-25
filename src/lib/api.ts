/*
 * Small fetch helper for the public API.
 *
 * `VITE_API_BASE_URL` is the API origin. Locally it is empty, so requests are
 * same-origin and go through Vite's `/api` dev proxy (spec §10); in production
 * it is set to the gateway URL (spec §9.6). An empty base therefore means
 * "same-origin" — exactly what the dev proxy expects.
 *
 * Note the Vite convention: env access is `import.meta.env.VITE_*`, and
 * `process` does not exist at runtime (spec §9.6).
 */

import type { ContentDocument } from '../types/content';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

/** Thrown for any non-2xx response so callers can distinguish HTTP failures. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * Fetch `path` (an absolute path beginning with `/`) against the configured
 * API base and parse the JSON body. Throws {@link ApiError} on a non-ok status.
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { Accept: 'application/json' },
    ...init,
  });

  if (!response.ok) {
    throw new ApiError(
      response.status,
      `Request to ${path} failed with ${response.status}`,
    );
  }

  return (await response.json()) as T;
}

/**
 * `GET /api/content` — the latest published document (spec §4.1). Returns an
 * empty `sections` array (not a 404) when nothing has ever been published.
 */
export function getContent(init?: RequestInit): Promise<ContentDocument> {
  return apiFetch<ContentDocument>('/api/content', init);
}
