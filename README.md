# portfolio-v6

The public Portfolio v6 site — a client-rendered Vite + React + TypeScript SPA
that fetches published content from the `portfolio-v6-api` and renders it as
plain, semantic HTML. Live at
[portfolio-v6-prod.vercel.app](https://portfolio-v6-prod.vercel.app); the
`benkile.com` apex still serves v5 until cutover.

The frontend follows the **"Control Room" design system** — see
[`DESIGN.md`](./DESIGN.md), which is authoritative for tokens, type, primitives,
section treatments, motion, and accessibility (it governs the §14 restyle of
this public site). The site presents as a quietly humming operations console:
amber accents, monospace for every live value, a humanist sans for prose,
dark-native with a light "console in a lit room" theme toggled by `data-theme`
on `<html>`.

Its structure: semantic markup, co-located
[CSS Modules](https://github.com/css-modules/css-modules), and a small set of
UI primitives in `src/components/ui/` (SectionShell, Panel, Instrument, Meter,
StatusDot, …). All design tokens are CSS custom properties in
`src/styles/tokens.css` (both themes); `src/styles/global.css` holds the reset,
base type, the plotting-grid ground, and the focus ring. **Components consume
tokens only — a raw hex in a component module is a review failure** — and each
works in both themes and down to 320px wide. There is **no component library, no
CSS framework, and no CSS-in-JS**. Contrast (`src/styles/tokens.contrast.test.ts`)
and 320px overflow (`src/App.overflow.test.tsx`) are enforced as tests.

The admin app (fully themed MUI) and the API live in separate repos
(`portfolio-v6-admin`, `portfolio-v6-api`).

## Requirements

- Node 18+ and npm.
- An API to talk to: `portfolio-v6-api` running locally (or `.env.local`
  pointing `VITE_API_BASE_URL` at the deployed gateway,
  `https://api.benkile.com/portfolio-v6-api`, for read-only poking).

Every dependency is pinned to an exact version in `package.json`; install with
`npm install`.

## Environment variables

Vite only exposes variables prefixed `VITE_` to the client, accessed via
`import.meta.env.VITE_*`. Note `process.env` does **not** exist in the browser
bundle — a stray `process.env.X` is a `ReferenceError`, not `undefined`
(spec §9.6).

| Variable | Required | Description |
|---|---|---|
| `VITE_API_BASE_URL` | Deployed | Origin of the API gateway. Empty for local dev against a local API (same-origin via Vite's `/api` proxy, §10). On the Vercel project `portfolio-v6-prod`: `https://api.benkile.com/portfolio-v6-api`. |
| `VITE_HUB_BASE_URL` | No | Origin serving the realtime SignalR hub. The GATEWAY owns the hub at its origin root (`https://api.benkile.com/hub`), never under a service path — when unset, the client falls back to the **origin** of `VITE_API_BASE_URL` (service path stripped), which is correct for every gateway-fronted environment. Set it only if the hub ever moves off the API origin. |
| `VITE_HUB_CHANNEL_PREFIX` | No | Realtime channel namespace = the API's manifest service name. Defaults to `portfolio-v6-api`; only override if the API is deployed under a different manifest service name, otherwise the client subscribes to channels the API never publishes on. |
| `SCHEMA_URL` | Never (build tool) | Optional override for `npm run sync:types`; defaults to `${VITE_API_BASE_URL}/api/schema`. |

`VITE_API_BASE_URL` is also read **server-side** by the routing middleware
(`middleware.ts`, see below), where `process.env` *does* exist — so the client
and the middleware share one source of truth for the API origin. Set it in
the Vercel project (primarily its Production environment); if
it's missing, the middleware's same-origin fallback fetches the SPA rewrite and
every post silently unfurls with generic metadata.

## Local development

Run the API against a local Postgres database (`portfolio_v6_local`, see the
API repo's `.env.example`), then the site (spec §10: do not iterate by
deploying the API):

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
    ├── pages/                  ContentPage, BlogIndexPage, BlogPostPage, NotFound
    ├── sections/               one component per section type (§3.4)
    ├── blocks/                 one component per block type (§3.7)
    ├── components/             shared chrome (SiteNav, ThemeToggle, …)
    │   └── ui/                 Control Room primitives — DESIGN.md §4
    ├── lib/                    api fetch layer, preview helpers, OG middleware core
    ├── registry.ts             SECTION_REGISTRY + BLOCK_REGISTRY
    ├── styles/tokens.css       all design tokens, both themes — DESIGN.md §2
    ├── styles/global.css       reset, base type, ground grid, focus ring
    └── types/content.ts        generated from the API schema — do not edit (§8.4)
```

## Blog metadata middleware

`middleware.ts` at the repo root is a
[Vercel Routing Middleware](https://vercel.com/docs) (not a Next.js feature; it
works with a static Vite build) matched on `/blog/:slug*` (nested paths invoke
it but fail open — only exact `/blog/:slug` gets injection). Because the site
is a client-rendered SPA, a blog URL serves an `index.html` with no title or
description until JS runs — and social unfurlers (Open Graph, X cards, Slack,
iMessage) don't run JS. The middleware fetches `GET /api/posts/:slug`, fetches
the origin's `index.html`, and injects per-post `<title>` and `og:`/`twitter:`
tags into the served HTML (spec §9.7). Only `og:*`/`twitter:*` tags are
emitted (no `meta description`); posts without a cover image downgrade to a
`summary` card with no image tags.

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

One Vercel project builds on push: **portfolio-v6-prod** (production branch
`main`, portfolio-v6-prod.vercel.app, API base `…/portfolio-v6-api`). Other
branches get per-branch preview URLs. The apex `benkile.com` stays on v5 until
cutover (§12).
