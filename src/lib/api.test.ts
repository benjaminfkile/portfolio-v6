import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, getContent, getPosts, getPost, ApiError } from './api';
import type { ContentDocument } from '../types/content';

/** Build a minimal Response-like object for a mocked fetch. */
function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('apiFetch', () => {
  it('requests the given path against the (empty) base and returns parsed JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ hello: 'world' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await apiFetch<{ hello: string }>('/api/thing');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/thing');
    expect(result).toEqual({ hello: 'world' });
  });

  it('sends an Accept: application/json header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('/api/thing');

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.headers).toMatchObject({ Accept: 'application/json' });
  });

  it('throws an ApiError carrying the status on a non-ok response', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({}, { ok: false, status: 503 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiFetch('/api/thing')).rejects.toBeInstanceOf(ApiError);
    await expect(apiFetch('/api/thing')).rejects.toMatchObject({ status: 503 });
  });
});

describe('getContent', () => {
  it('fetches GET /api/content and returns the document', async () => {
    const doc: ContentDocument = {
      version: 42,
      published_at: '2026-07-24T18:00:00Z',
      sections: [],
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(doc));
    vi.stubGlobal('fetch', fetchMock);

    const result = await getContent();

    expect(fetchMock.mock.calls[0][0]).toBe('/api/content');
    expect(result).toEqual(doc);
  });
});

describe('getPosts', () => {
  it('fetches GET /api/posts with no query when no params are given', async () => {
    const page = { posts: [], next_cursor: null };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(page));
    vi.stubGlobal('fetch', fetchMock);

    const result = await getPosts();

    expect(fetchMock.mock.calls[0][0]).toBe('/api/posts');
    expect(result).toEqual(page);
  });

  it('serialises tag, cursor, and limit into the query string', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ posts: [], next_cursor: null }));
    vi.stubGlobal('fetch', fetchMock);

    await getPosts({ tag: 'react', cursor: 'abc', limit: 10 });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('tag=react');
    expect(url).toContain('cursor=abc');
    expect(url).toContain('limit=10');
  });
});

describe('getPost', () => {
  it('fetches GET /api/posts/:slug and returns the post', async () => {
    const post = { slug: 'x', title: 'X', body: [] };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(post));
    vi.stubGlobal('fetch', fetchMock);

    const result = await getPost('x');

    expect(fetchMock.mock.calls[0][0]).toBe('/api/posts/x');
    expect(result).toEqual(post);
  });

  it('throws an ApiError with status 404 for an unknown/unpublished slug', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({}, { ok: false, status: 404 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getPost('missing')).rejects.toMatchObject({ status: 404 });
  });
});
