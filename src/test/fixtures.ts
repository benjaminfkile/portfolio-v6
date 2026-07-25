import type { ContentDocument } from '../types/content';

/**
 * A realistic published document exercising every static section type (hero,
 * about, timeline, skills, portfolio, contact) plus the live placeholders and
 * a media map resolved to CDN URLs (spec §6.8). Used to render the full section
 * pipeline in tests.
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
  sections: [
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
    // Live sections — registered placeholders that render nothing for now (§3.5).
    { id: 'sec-status', type: 'status', data: {}, items: [] },
    { id: 'sec-blog', type: 'blog', data: {}, items: [] },
    { id: 'sec-now', type: 'now_playing', data: {}, items: [] },
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
  ],
};
