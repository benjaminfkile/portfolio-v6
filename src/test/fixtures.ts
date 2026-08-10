import type { ContentDocument, Post, PostSummary } from '../types/content';
import type { GithubDay, GithubResponse, GithubWeek } from '../lib/api';

/**
 * The sections of the fixture document's `home` page — every static section type
 * (hero, about, timeline, skills, portfolio, contact) plus the live sections'
 * config (status, blog, now_playing, and the v1.2 duolingo + github). Referenced
 * by the media map below via `media_id` (spec §6.8).
 */
const homeSections: ContentDocument['pages'][number]['sections'] = [
    {
      id: 'sec-hero',
      type: 'hero',
      data: {
        title: 'Ben Kile',
        tagline: 'Software engineer',
        background_media_id: 'media-hero',
      },
      items: [],
    },
    {
      id: 'sec-about',
      type: 'about',
      data: {
        heading: 'About me',
        body: 'First paragraph of the bio.\n\nSecond paragraph of the bio.',
      },
      items: [],
    },
    {
      id: 'sec-timeline',
      type: 'timeline',
      data: { heading: 'Experience' },
      items: [
        {
          id: 'tl-1',
          data: {
            date_range: '2022 – Present',
            title: 'Staff Engineer, Acme Corp',
            description: 'Led the platform team.',
            media_id: 'media-timeline',
          },
        },
        {
          id: 'tl-2',
          data: {
            date_range: '2019 – 2022',
            title: 'Senior Engineer, Globex',
            description: 'Built the billing system.',
          },
        },
      ],
    },
    {
      id: 'sec-skills',
      type: 'skills',
      data: { heading: 'Skills', sphere_detail: 1 },
      items: [
        {
          id: 'sk-1',
          data: {
            title: 'TypeScript',
            description: 'Daily driver.',
            icon_source: 'https://cdn.example.com/icons/ts.svg',
          },
        },
        {
          id: 'sk-2',
          data: {
            title: 'PostgreSQL',
            description: 'Comfortable with query tuning.',
            icon_source: 'https://cdn.example.com/icons/pg.svg',
          },
        },
      ],
    },
    {
      id: 'sec-portfolio',
      type: 'portfolio',
      data: { heading: 'Projects' },
      items: [
        {
          id: 'pf-1',
          data: {
            title: 'Portfolio v6',
            intro: 'A content-managed portfolio.',
            description: 'Vite + React public site driven by a section registry.',
            media_id: 'media-project',
            // Skill Refs v1.8: reference skills items by id (here the two `skills`
            // items on this same page) instead of a bare tech-icon URL array.
            skill_refs: ['sk-1', 'sk-2'],
            links: [
              {
                type: 'repo',
                label: 'portfolio-v6',
                url: 'https://github.com/example/portfolio-v6',
              },
              {
                type: 'prod',
                label: 'Live site',
                url: 'https://benkile.com',
              },
            ],
          },
        },
      ],
    },
    // Live sections — config in the snapshot; data fetched at runtime (§3.5).
    {
      id: 'sec-status',
      type: 'status',
      data: { services: ['Gateway', 'API', 'Database'], show_response_times: true },
      items: [],
    },
    { id: 'sec-blog', type: 'blog', data: { limit: 3 }, items: [] },
    {
      id: 'sec-now',
      type: 'now_playing',
      data: { idle: 'hide', show_album_art: true },
      items: [],
    },
    {
      id: 'sec-duolingo',
      type: 'duolingo',
      data: { language: 'es', score_label: 'Duolingo Score 95' },
      items: [],
    },
    // v1.10: the github config is header copy only — the calendar (and its year
    // picker) is fetched at runtime. A stray legacy `weeks` here is ignored.
    { id: 'sec-github', type: 'github', data: {}, items: [] },
    {
      id: 'sec-contact',
      type: 'contact',
      data: {
        heading: 'Get in touch',
        body: 'Reach out any time.',
        links: [
          {
            type: 'other',
            label: 'hello@benkile.com',
            url: 'mailto:hello@benkile.com',
          },
        ],
      },
      items: [],
    },
  ];

/**
 * A realistic published document (v1.1 pages shape, spec §3.10). The `home` page
 * (rendered at `/`) carries every section type; a second `projects` page (with a
 * nav label and a later `nav_position`) exercises `/:slug` routing and nav order;
 * a third `secret` page has a null `nav_label` so it is reachable by slug but
 * omitted from the nav. The media map is resolved to CDN URLs (§6.8). Used to
 * render the full section pipeline and the dynamic routing in tests.
 */
export const fixtureDocument: ContentDocument = {
  version: 42,
  published_at: '2026-07-24T18:00:00Z',
  media: {
    'media-hero': {
      url: 'https://media.benkile.com/media/hero/backdrop.jpg',
      alt: 'A wide mountain skyline',
    },
    'media-timeline': {
      url: 'https://media.benkile.com/media/tl/acme.png',
      alt: 'Acme Corp logo',
    },
    'media-project': {
      url: 'https://media.benkile.com/media/proj/portfolio.png',
      alt: 'Portfolio v6 screenshot',
    },
  },
  pages: [
    {
      id: 'page-home',
      slug: 'home',
      title: 'Ben Kile',
      nav_label: 'Home',
      nav_position: 0,
      sections: homeSections,
    },
    {
      id: 'page-projects',
      slug: 'projects',
      title: 'Projects',
      nav_label: 'Projects',
      nav_position: 1,
      sections: [
        {
          id: 'sec-projects-hero',
          type: 'hero',
          data: { title: 'Projects' },
          items: [],
        },
      ],
    },
    {
      id: 'page-secret',
      slug: 'secret',
      title: 'Secret',
      nav_label: null,
      nav_position: 2,
      sections: [
        {
          id: 'sec-secret-hero',
          type: 'hero',
          data: { title: 'Secret page' },
          items: [],
        },
      ],
    },
  ],
};

/**
 * A document that exercises Skill Refs v1.8 cross-page resolution. Its `skills`
 * items are split across TWO pages — a light-only skill and a dark-override skill
 * on `home`, and a third skill on a second page — and its portfolio item (also on
 * `home`) references all three by id plus one deliberately-unresolvable id. Used
 * to drive `buildSkillsIndex` (whole-document span) and the portfolio's ref
 * resolution, theme-aware icon choice, and skip-on-unresolvable behaviour.
 */
export const fixtureSkillRefsDocument: ContentDocument = {
  version: 44,
  published_at: '2026-08-08T12:00:00Z',
  media: {},
  pages: [
    {
      id: 'page-home',
      slug: 'home',
      title: 'Ben Kile',
      nav_label: 'Home',
      nav_position: 0,
      sections: [
        {
          id: 'sec-skills-home',
          type: 'skills',
          data: { heading: 'Skills' },
          items: [
            {
              id: 'sk-ts',
              data: {
                title: 'TypeScript',
                description: '',
                icon_source: 'https://cdn.example.com/icons/ts.svg',
              },
            },
            {
              id: 'sk-vercel',
              data: {
                title: 'Vercel',
                description: '',
                icon_source: 'https://cdn.example.com/icons/vercel-light.svg',
                icon_source_dark:
                  'https://cdn.example.com/icons/vercel-dark.svg',
              },
            },
          ],
        },
        {
          id: 'sec-portfolio-home',
          type: 'portfolio',
          data: { heading: 'Projects' },
          items: [
            {
              id: 'pf-refs',
              data: {
                title: 'Cross-page project',
                intro: '',
                description: '',
                media_id: '',
                // Two same-page refs, one ref to a skill on the `tools` page, and
                // one id that resolves to nothing (must be skipped silently).
                skill_refs: ['sk-ts', 'sk-vercel', 'sk-docker', 'sk-missing'],
                links: [],
              },
            },
          ],
        },
      ],
    },
    {
      id: 'page-tools',
      slug: 'tools',
      title: 'Tools',
      nav_label: 'Tools',
      nav_position: 1,
      sections: [
        {
          id: 'sec-skills-tools',
          type: 'skills',
          data: { heading: 'Tooling' },
          items: [
            {
              id: 'sk-docker',
              data: {
                title: 'Docker',
                description: '',
                icon_source: 'https://cdn.example.com/icons/docker.svg',
              },
            },
          ],
        },
      ],
    },
  ],
};

/**
 * A document whose single `ops` page carries one `ops` section (spec §3.5,
 * v1.7), for driving the ops section through `SECTION_REGISTRY`. Its *data* is
 * the daily report fetched at runtime from `GET /api/ops` — this fixture is only
 * the published config (header copy), mirroring how the snapshot stores a live
 * section (§3.5). As of v1.7 the config is header copy only (no `window_hours`).
 */
export const fixtureOpsDocument: ContentDocument = {
  version: 43,
  published_at: '2026-08-01T12:00:00Z',
  media: {},
  pages: [
    {
      id: 'page-ops',
      slug: 'ops',
      title: 'Ops',
      nav_label: 'Ops',
      nav_position: 0,
      sections: [
        {
          id: 'sec-ops',
          type: 'ops',
          data: { heading: 'Ops', intro: 'Yesterday, on the record.' },
          items: [],
        },
      ],
    },
  ],
};

/**
 * A daily ops report (spec §3.5, v1.7) covering the UTC day 2026-08-06 at the
 * fixed 5-minute grain. The two series here are sparse (a handful of the day's
 * 288 slots) so tests can assert exact playhead → readout values by slot; a real
 * report carries the full grid. `t` is ISO-8601 (the report builder's spelling).
 */
export const fixtureOpsReport = {
  report_date: '2026-08-06',
  generated_at: '2026-08-07T00:17:00Z',
  grain_minutes: 5,
  available_dates: ['2026-08-06', '2026-08-05'],
  widgets: [
    {
      title: 'CPU Utilization',
      kind: 'gauge' as const,
      unit: '%',
      latest: 42,
      series: [
        {
          label: null,
          points: [
            // slot 0 (00:00Z), slot 6 (00:30Z), slot 287 (23:55Z)
            { t: '2026-08-06T00:00:00Z', v: 40 },
            { t: '2026-08-06T00:30:00Z', v: 55 },
            { t: '2026-08-06T23:55:00Z', v: 42 },
          ],
        },
      ],
    },
    {
      title: 'ALB Request Count',
      kind: 'chart' as const,
      unit: 'req/s',
      latest: 128,
      series: [
        {
          label: '2xx',
          points: [
            { t: '2026-08-06T00:00:00Z', v: 100 },
            { t: '2026-08-06T00:30:00Z', v: 210 },
            { t: '2026-08-06T23:55:00Z', v: 128 },
          ],
        },
        {
          label: '5xx',
          points: [
            { t: '2026-08-06T00:00:00Z', v: 1 },
            { t: '2026-08-06T00:30:00Z', v: 7 },
            { t: '2026-08-06T23:55:00Z', v: 2 },
          ],
        },
      ],
    },
  ],
};

/**
 * Build one contribution week (Sun→Sat) starting at `startISO` (`YYYY-MM-DD`)
 * from seven daily counts; `level` is a stand-in server quantization (the count
 * clamped to the ramp's 0–4). A real payload's `level` is quantized against the
 * whole window, but a per-count clamp is enough to drive the renderer in tests.
 */
function ghWeek(startISO: string, counts: number[]): GithubWeek {
  const start = new Date(`${startISO}T00:00:00Z`);
  const days: GithubDay[] = counts.map((count, i) => {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    return {
      date: d.toISOString().slice(0, 10),
      count,
      level: Math.min(4, Math.max(0, count)),
    };
  });
  return { days };
}

/**
 * A `GET /api/github` payload in the v1.10 browsable-calendar shape (spec §3.5):
 * the trailing-12-months window trimmed to a handful of weeks that straddle a
 * month boundary (July → August 2026) so tests can assert month-label derivation
 * and the amber ramp. `years` is newest-first (it drives the window picker), and
 * `from`/`to` are the window's inclusive `YYYY-MM-DD` bounds.
 */
export const fixtureGithub: GithubResponse = {
  available: true,
  total: 2143,
  from: '2025-08-11',
  to: '2026-08-09',
  years: [2026, 2025, 2024],
  // A real payload carries ~53 weeks; this trimmed run is enough for the tests.
  weeks: [
    ghWeek('2026-07-12', [0, 1, 2, 0, 3, 4, 2]),
    ghWeek('2026-07-19', [1, 0, 2, 5, 3, 0, 1]),
    ghWeek('2026-07-26', [0, 2, 1, 3, 0, 4, 2]),
    ghWeek('2026-08-02', [2, 0, 4, 2, 1, 3, 0]),
    ghWeek('2026-08-09', [3, 0, 0, 0, 0, 0, 0]),
  ],
};

/**
 * A `GET /api/github?year=2025` payload — a whole-calendar-year window (spec
 * §3.5), for driving the year-picker re-fetch: choosing a year re-fetches and
 * re-renders with these bounds and this total.
 */
export const fixtureGithubYear: GithubResponse = {
  available: true,
  total: 1876,
  from: '2025-01-01',
  to: '2025-12-31',
  years: [2026, 2025, 2024],
  weeks: [
    ghWeek('2025-01-05', [1, 2, 0, 3, 1, 0, 2]),
    ghWeek('2025-01-12', [0, 1, 4, 2, 3, 1, 0]),
  ],
};

/**
 * A post whose body exercises every one of the eight block types (spec §3.7),
 * plus a trailing unknown block that must degrade to nothing. Its media map
 * resolves the one `media` block's id. Used to drive the block-pipeline tests.
 */
export const fixturePost: Post = {
  slug: 'hello-blocks',
  title: 'Every block, once',
  excerpt: 'A post that renders one of each block type.',
  cover: {
    url: 'https://media.benkile.com/media/posts/cover.jpg',
    alt: 'Post cover',
  },
  tags: ['engineering', 'react'],
  published_at: '2026-07-20T09:00:00Z',
  blog: { slug: 'field-notes', name: 'Field Notes' },
  media: {
    'media-inline': {
      url: 'https://media.benkile.com/media/posts/diagram.png',
      alt: 'An architecture diagram',
    },
  },
  body: [
    { type: 'heading', level: 2, text: 'A heading' },
    {
      type: 'paragraph',
      text: 'Some **bold**, some *italic*, some `code`, and a [link](https://example.com).',
    },
    {
      type: 'code',
      language: 'typescript',
      code: 'const answer: number = 42;\nconsole.log(answer);',
      filename: 'src/answer.ts',
    },
    { type: 'media', media_id: 'media-inline', caption: 'The diagram' },
    { type: 'list', ordered: false, items: ['First item', 'Second **item**'] },
    { type: 'quote', text: 'A quotable line.', attribution: 'Someone' },
    {
      type: 'links',
      links: [
        {
          type: 'repo',
          label: 'Source',
          url: 'https://github.com/example/repo',
        },
      ],
    },
    { type: 'divider' },
    // Unknown block — must render nothing rather than crash (§3.7).
    { type: 'mystery' } as unknown as Post['body'][number],
  ],
};

/** A page of post summaries with a following cursor, for pagination tests. */
export const fixturePostSummaries: PostSummary[] = [
  {
    slug: 'first-post',
    title: 'First post',
    excerpt: 'The very first one.',
    cover: {
      url: 'https://media.benkile.com/media/posts/first.jpg',
      alt: 'First cover',
    },
    tags: ['engineering'],
    published_at: '2026-07-24T10:00:00Z',
    blog: null,
  },
  {
    slug: 'second-post',
    title: 'Second post',
    excerpt: 'Another one.',
    cover: null,
    tags: ['react'],
    published_at: '2026-07-18T10:00:00Z',
    blog: null,
  },
];
