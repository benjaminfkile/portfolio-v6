import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  injectBlogMetadata,
  resolveBlogHtml,
  slugFromPathname,
  escapeAttribute,
  BLOG_MATCHER,
  type PostMetadata,
} from './ogMiddleware';

/** A representative static index.html, matching the repo's own shell. */
const INDEX_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Ben Kile</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`;

const POST: PostMetadata = {
  title: 'On Building Small Things',
  excerpt: 'A short note about keeping software deliberately plain.',
  cover: { url: 'https://media.benkile.com/covers/small-things.jpg', alt: 'A workbench' },
};

function textResponse(body: string, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    text: () => Promise.resolve(body),
    json: () => Promise.resolve(JSON.parse(body)),
  } as unknown as Response;
}

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('slugFromPathname', () => {
  it('extracts the slug from a /blog/:slug path', () => {
    expect(slugFromPathname('/blog/hello-world')).toBe('hello-world');
    expect(slugFromPathname('/blog/hello-world/')).toBe('hello-world');
  });

  it('decodes percent-encoded slugs', () => {
    expect(slugFromPathname('/blog/a%20b')).toBe('a b');
  });

  it('returns null for non-post paths', () => {
    expect(slugFromPathname('/')).toBeNull();
    expect(slugFromPathname('/blog')).toBeNull();
    expect(slugFromPathname('/blog/')).toBeNull();
    expect(slugFromPathname('/blog/a/b')).toBeNull();
    expect(slugFromPathname('/about')).toBeNull();
  });
});

describe('escapeAttribute', () => {
  it('escapes the characters that could break out of an attribute', () => {
    expect(escapeAttribute(`a & b < c > "d" 'e'`)).toBe(
      'a &amp; b &lt; c &gt; &quot;d&quot; &#39;e&#39;',
    );
  });
});

describe('injectBlogMetadata', () => {
  const pageUrl = new URL('https://v6.benkile.com/blog/on-building-small-things?ref=x');

  it('replaces the <title> with the post title', () => {
    const out = injectBlogMetadata(INDEX_HTML, POST, pageUrl);
    expect(out).toContain('<title>On Building Small Things</title>');
    expect(out).not.toContain('<title>Ben Kile</title>');
  });

  it('injects og: and twitter: tags into <head>', () => {
    const out = injectBlogMetadata(INDEX_HTML, POST, pageUrl);
    expect(out).toContain('<meta property="og:type" content="article" />');
    expect(out).toContain('<meta property="og:title" content="On Building Small Things" />');
    expect(out).toContain(
      '<meta property="og:description" content="A short note about keeping software deliberately plain." />',
    );
    expect(out).toContain(`<meta property="og:image" content="${POST.cover!.url}" />`);
    expect(out).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(out).toContain('<meta name="twitter:title" content="On Building Small Things" />');
    expect(out).toContain(`<meta name="twitter:image" content="${POST.cover!.url}" />`);
    // All injected before the closing head tag.
    const headEnd = out.indexOf('</head>');
    expect(out.indexOf('og:title')).toBeLessThan(headEnd);
  });

  it('drops the query string from the canonical og:url', () => {
    const out = injectBlogMetadata(INDEX_HTML, POST, pageUrl);
    expect(out).toContain(
      '<meta property="og:url" content="https://v6.benkile.com/blog/on-building-small-things" />',
    );
    expect(out).not.toContain('ref=x');
  });

  it('omits image tags and uses the summary card when there is no cover', () => {
    const out = injectBlogMetadata(INDEX_HTML, { ...POST, cover: null }, pageUrl);
    expect(out).not.toContain('og:image');
    expect(out).not.toContain('twitter:image');
    expect(out).toContain('<meta name="twitter:card" content="summary" />');
  });

  it('escapes metadata so it cannot break out of the markup', () => {
    const nasty: PostMetadata = {
      title: 'Tom & Jerry "quotes" <script>',
      excerpt: 'a < b & c > d',
      cover: null,
    };
    const out = injectBlogMetadata(INDEX_HTML, nasty, pageUrl);
    expect(out).toContain('<title>Tom &amp; Jerry "quotes" &lt;script&gt;</title>');
    expect(out).toContain(
      '<meta property="og:title" content="Tom &amp; Jerry &quot;quotes&quot; &lt;script&gt;" />',
    );
    expect(out).not.toContain('<script>');
  });

  it('inserts a <title> when the document has none', () => {
    const noTitle = '<html><head><meta charset="UTF-8" /></head><body></body></html>';
    const out = injectBlogMetadata(noTitle, POST, pageUrl);
    expect(out).toContain('<title>On Building Small Things</title>');
  });
});

describe('resolveBlogHtml', () => {
  const request = (url = 'https://v6.benkile.com/blog/on-building-small-things') =>
    ({ url }) as unknown as Request;

  it('fetches the post then the index and returns injected HTML', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(POST))
      .mockResolvedValueOnce(textResponse(INDEX_HTML));

    const html = await resolveBlogHtml(request(), {
      apiBaseUrl: 'https://api.benkile.com/portfolio-v6-api',
      fetch: fetchMock,
    });

    expect(html).not.toBeNull();
    expect(html).toContain('<title>On Building Small Things</title>');
    expect(html).toContain('og:title');
    // Post fetched from the configured API base with the slug.
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.benkile.com/portfolio-v6-api/api/posts/on-building-small-things',
    );
    // index.html fetched same-origin.
    expect(fetchMock.mock.calls[1][0]).toBe('https://v6.benkile.com/index.html');
  });

  it('fails open (null) for a non-blog path', async () => {
    const fetchMock = vi.fn();
    const html = await resolveBlogHtml(request('https://v6.benkile.com/'), {
      apiBaseUrl: 'https://api',
      fetch: fetchMock,
    });
    expect(html).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails open when the post request is non-ok (e.g. 404 draft)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 404 }));
    const html = await resolveBlogHtml(request(), { apiBaseUrl: 'https://api', fetch: fetchMock });
    expect(html).toBeNull();
    // Never went on to fetch or mutate the index.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails open when the index fetch is non-ok', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(POST))
      .mockResolvedValueOnce(textResponse('', { ok: false, status: 500 }));
    const html = await resolveBlogHtml(request(), { apiBaseUrl: 'https://api', fetch: fetchMock });
    expect(html).toBeNull();
  });

  it('fails open when fetch throws (network error)', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    const html = await resolveBlogHtml(request(), { apiBaseUrl: 'https://api', fetch: fetchMock });
    expect(html).toBeNull();
  });

  it('fails open when the post JSON is malformed', async () => {
    const badJson = {
      ok: true,
      status: 200,
      json: () => Promise.reject(new SyntaxError('bad json')),
    } as unknown as Response;
    const fetchMock = vi.fn().mockResolvedValueOnce(badJson);
    const html = await resolveBlogHtml(request(), { apiBaseUrl: 'https://api', fetch: fetchMock });
    expect(html).toBeNull();
  });

  it('injects the same HTML regardless of user agent (no cloaking)', async () => {
    // The request carries no User-Agent and resolveBlogHtml never reads one;
    // this asserts the output is driven only by the path + post, so a crawler
    // and a browser receive identical HTML.
    const run = () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(POST))
        .mockResolvedValueOnce(textResponse(INDEX_HTML));
      return resolveBlogHtml(request(), { apiBaseUrl: 'https://api', fetch: fetchMock });
    };
    expect(await run()).toEqual(await run());
  });
});

describe('config', () => {
  it('matcher is scoped to blog post routes only', () => {
    expect(BLOG_MATCHER).toBe('/blog/:slug*');
  });
});
