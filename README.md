# portfolio-v6

The public site for [benkile.com](https://benkile.com) — a client-rendered
Vite + React + TypeScript SPA that fetches published content from the
`portfolio-v6-api` and renders it as plain, semantic HTML.

It is deliberately plain by design (see `TECH_SPEC_V1.md` §14): semantic markup,
co-located [CSS Modules](https://github.com/css-modules/css-modules), and a
single global stylesheet (`src/styles/global.css`) holding a reset plus the
design tokens (`--color-*`, `--space-*`, `--font-*`) that every component
references. There is **no component library, no CSS framework, and no
CSS-in-JS** — that containment is what keeps the eventual restyle wide but
shallow (§14.3).

The admin app (fully themed MUI) and the API live in separate repos
(`portfolio-v6-admin`, `portfolio-v6-api`).

## Requirements

- Node 18+ and npm.
- The `portfolio-v6-api` running locally (for content, posts, and type sync).

Every dependency is pinned to an exact version in `package.json`; install with
`npm install`.

## Environment variables

Vite only exposes variables prefixed `VITE_` to the client, accessed via
`import.meta.env.VITE_*`. Note `process.env` does **not** exist in the browser
bundle — a stray `process.env.X` is a `ReferenceError`, not `undefined`
(spec §9.6).

| Variable | Required | Description |
|---|---|---|
| `VITE_API_BASE_URL` | Production only | Origin of the API gateway. **Leave empty for local dev** so requests are same-origin and go through Vite's `/api` proxy (§10). In production it is the gateway URL, e.g. `https://api.benkile.com/portfolio-v6-api` (preview: `…/portfolio-v6-api-dev`). |

`VITE_API_BASE_URL` is also read **server-side** by the routing middleware
(`middleware.ts`, see below), where `process.env` *does* exist — so the client
and the middleware share one source of truth for the API origin. Set it in the
Vercel project settings, scoped per environment (Production vs Preview).

## Local development

Run the API against the **dev** database and Cognito pool, then the site
(spec §10 — do not iterate by deploying the API):

```bash
# in portfolio-v6-api
npm run dev            # → localhost:3002, IS_LOCAL=true

# in portfolio-v6 (this repo)
npm run dev            # → localhost:5173
```

`VITE_API_BASE_URL` is empty locally, so the browser makes same-origin `/api`
requests and Vite's dev proxy (configured in `vite.config.ts`) forwards them to
`localhost:3002`, mimicking what the production gateway does. CORS never enters
the local path.

Direct hits and refreshes on deep links like `/blog/some-post` are handled by
the SPA rewrite in `vercel.json` in production; the dev server serves
`index.html` for unknown paths automatically.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Start the Vite dev server on `localhost:5173`. |
| `npm run build` | Type-check (`tsc -b`) then produce the production build in `dist/`. |
| `npm run preview` | Serve the built `dist/` locally to sanity-check a production build. |
| `npm test` | Run the full Vitest suite once. |
| `npm run test:watch` | Run Vitest in watch mode. |
| `npm run sync:types` | Regenerate `src/types/content.ts` from the API's `GET /api/schema` (§8.4). Requires the API reachable; the generated file is committed and marked do-not-edit. |

## Project layout

```
├── middleware.ts               per-post OG tags on /blog/:slug — §9.7
├── vercel.json                 SPA rewrite — §9.6
└── src/
    ├── main.tsx
    ├── App.tsx                 routes
    ├── pages/                  HomePage, BlogIndexPage, BlogPostPage
    ├── sections/               one component per section type (§3.4)
    ├── blocks/                 one component per block type (§3.7)
    ├── components/             shared leaf components (LinkList, …)
    ├── lib/                    api fetch layer, preview helpers, OG middleware core
    ├── registry.ts             SECTION_REGISTRY + BLOCK_REGISTRY
    ├── styles/global.css       reset + design tokens
    └── types/content.ts        generated from the API schema — do not edit (§8.4)
```

## Blog metadata middleware

`middleware.ts` at the repo root is a
[Vercel Routing Middleware](https://vercel.com/docs) (not a Next.js feature; it
works with a static Vite build) scoped to `/blog/:slug` only. Because the site
is a client-rendered SPA, a blog URL serves an `index.html` with no title or
description until JS runs — and social unfurlers (Open Graph, X cards, Slack,
iMessage) don't run JS. The middleware fetches `GET /api/posts/:slug` and injects
per-post `<title>` and `og:`/`twitter:` tags into the served HTML (spec §9.7).

Its rules: it injects for **all** visitors (never branching on user agent —
serving crawlers different HTML is cloaking), and it **fails open** — on any
error it serves `index.html` untouched, because metadata is an enhancement that
must never break the page. The testable core (the pure injection transform and
the fail-open orchestration) lives in `src/lib/ogMiddleware.ts`.

## Extending the section / block registries

Rendering is fenced into leaf components by two registries in `src/registry.ts`
(§3.4, §3.7). Adding a new section or block type the API can emit is **one new
component plus one registry line** — nothing else in the app encodes appearance,
which is what makes the later restyle shallow (§14.3).

The type must first exist in the API's Zod schemas and be pulled in via
`npm run sync:types`, so `SectionType` / `BlockType` in `src/types/content.ts`
includes it. Then:

1. **Add the component.** Create `src/sections/GallerySection.tsx` (or
   `src/blocks/…` for a block) with a co-located `GallerySection.module.css`.
   Accept the shared props, narrow the payload to your variant, and render plain
   semantic HTML styled only through token-referencing CSS Modules:

   ```tsx
   import type { SectionProps } from './types';
   import styles from './GallerySection.module.css';

   export default function GallerySection({ section }: SectionProps) {
     const data = section.data as { title?: string /* … */ };
     return <section className={styles.gallery}>{/* … */}</section>;
   }
   ```

2. **Add the registry line.** Import it and add the one entry:

   ```ts
   import GallerySection from './sections/GallerySection';

   export const SECTION_REGISTRY = {
     // …existing entries…
     gallery: GallerySection,
   } satisfies Record<SectionType, ComponentType<SectionProps>>;
   ```

   The `satisfies Record<SectionType, …>` makes the table exhaustive: a new
   `SectionType` without a matching component is a compile error. Blocks work
   identically via `BLOCK_REGISTRY` and `BlockProps`. An unknown `type` at
   runtime (e.g. content published against a newer schema than the deployed
   site) renders nothing and logs, so it degrades rather than crashing.

## Deployment

Vercel builds on push: `main` → production, other branches → per-branch preview
URLs (§11.2). The apex `benkile.com` stays on v5 until cutover; v6 answers on an
interim hostname until then (§12).
