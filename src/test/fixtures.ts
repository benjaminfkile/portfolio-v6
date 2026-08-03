import type { ContentDocument, Post, PostSummary } from '../types/content';

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
        title: 'About me',
        body: 'First paragraph of the bio.\n\nSecond paragraph of the bio.',
      },
      items: [],
    },
    {
      id: 'sec-timeline',
      type: 'timeline',
      data: { title: 'Experience' },
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
      data: { title: 'Skills' },
      items: [
        {
          id: 'sk-1',
          data: {
            title: 'TypeScript',
            description: 'Daily driver.',
            icon_source: 'https://cdn.example.com/icons/ts.svg',
            proficiency: 95,
          },
        },
        {
          id: 'sk-2',
          data: {
            title: 'PostgreSQL',
            description: 'Comfortable with query tuning.',
            icon_source: 'https://cdn.example.com/icons/pg.svg',
            proficiency: 80,
          },
        },
      ],
    },
    {
      id: 'sec-portfolio',
      type: 'portfolio',
      data: { title: 'Projects' },
      items: [
        {
          id: 'pf-1',
          data: {
            title: 'Portfolio v6',
            intro: 'A content-managed portfolio.',
            description: 'Vite + React public site driven by a section registry.',
            media_id: 'media-project',
            tech_icons: [
              'https://cdn.example.com/icons/react.svg',
              'https://cdn.example.com/icons/vite.svg',
            ],
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
    { id: 'sec-github', type: 'github', data: { weeks: 52 }, items: [] },
    {
      id: 'sec-contact',
      type: 'contact',
      data: {
        title: 'Get in touch',
        body: 'Reach out any time.',
        email: 'hello@benkile.com',
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
  },
  {
    slug: 'second-post',
    title: 'Second post',
    excerpt: 'Another one.',
    cover: null,
    tags: ['react'],
    published_at: '2026-07-18T10:00:00Z',
  },
];
