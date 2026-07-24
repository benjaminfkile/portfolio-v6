# Portfolio v6 — v1 Technical Specification

**Status:** Draft
**Author:** Ben Kile
**Date:** 2026-07-24

---

## 1. Summary

Portfolio v6 replaces the v5 portfolio site with a content-managed system. The public
site renders a page assembled from data rather than hardcoded JSX, plus a blog; an
authenticated admin site is the only place that data can be created or changed.

This is the **v1** spec. Its deliverable is a fully functional system. The public site
ships a deliberately plain UI — semantic HTML, minimal CSS, no component library —
contained so a later restyle is cheap (§14). The admin is the opposite: built once,
fully, on MUI with complete theming (§14.4), because nobody should build an internal
tool twice.

The defining constraint: **the admin application must never be delivered to public
visitors** — not as a guarded route, not as a lazily-loaded chunk. This is enforced
structurally by building the two frontends as separate applications deployed to
separate origins.

Three repositories, three deployables:

| Repo | Deploys to | Public URL | Purpose |
|---|---|---|---|
| `portfolio-v6` | Vercel | `benkile.com` | Public site + blog. No auth code. |
| `portfolio-v6-admin` | Vercel | `admin.benkile.com` | Admin UI. Cognito-gated. |
| `portfolio-v6-api` | ECR → EC2 container | `api.benkile.com/portfolio-v6-api` | Express API. Serves both. |

Everything runs on existing infrastructure: the `bk-gateway-api` ALB and gateway, the
`bk-db` RDS instance, Secrets Manager, ECR, and the shared EC2 host. New resources are
limited to two Cognito pools, two databases, two S3 buckets, two secrets, and one ECR
repository.

---

## 2. Architecture

```
                    ┌──────────────────────────────┐
   benkile.com ────▶│  portfolio-v6  (Vercel)      │  public, unauthenticated
                    │  Vite + React                │
                    └───────────────┬──────────────┘
                                    │  GET /api/content
                                    │
                    ┌───────────────▼──────────────────────────────────┐
                    │  ALB bk-gateway-api-lb  (HTTPS :443)             │
                    │  api.benkile.com — ACM cert                      │
                    └───────────────┬──────────────────────────────────┘
                                    │  HTTP :80 → container :3000
                    ┌───────────────▼──────────────────────────────────┐
                    │  bk-gateway-api  (proxy, docker net "app-net")   │
                    │  /portfolio-v6-api/*      → :3002                │
                    │  /portfolio-v6-api-dev/*  → :4002                │
                    └───────────────┬──────────────────────────────────┘
                                    │
                    ┌───────────────▼──────────────────────────────────┐
                    │  portfolio-v6-api  (Express, container :3002)     │
                    │    GET  /api/content        public, snapshot      │
                    │    GET  /api/posts[/:slug]  public, blog          │
                    │    GET  /api/status         public, live ~30s     │
                    │    GET  /api/now-playing    public, live ~30s     │
                    │    ---- requireAdmin() ----                       │
                    │    CRUD /api/admin/sections, /api/admin/posts     │
                    │    POST /api/admin/media/upload-url               │
                    │    POST /api/admin/publish                        │
                    │    GET  /api/admin/preview                        │
                    └────────┬──────────────────────┬──────────────────┘
                             │                      │  presigned PUT only
                  ┌──────────▼─────────┐  ┌─────────▼──────────────┐
                  │ RDS bk-db          │  │ S3 bk-portfolio-v6-*   │
                  │ portfolio_v6_prod  │  │ private, OAC-only reads │
                  │ portfolio_v6_dev   │  └─────────▲───────────────┘
                  └────────────────────┘            │ OAC
                                                    │
   ═══ MEDIA READ PATH — never touches EC2 ═══════════════════════════
                                        ┌───────────┴───────────────┐
   browser ────────────────────────────▶│ CloudFront                │
   <img>, <video> (Range → 206 at edge) │ portfolio-v6-{prod,dev}   │
                                        │ public, no signing        │
                                        └───────────────────────────┘
                                    ▲
                                    │  Bearer <cognito id token>
                    ┌───────────────┴──────────────┐
 admin.benkile.com ▶│ portfolio-v6-admin (Vercel)  │
                    │ Vite + React + Cognito       │
                    └──────────────────────────────┘
```

### 2.1 Why the split is structural, not conventional

A single app with route guards still ships every admin component to every visitor —
the code is in the bundle, reachable via devtools, and its API shape is documented by
its own source. Two separate Vite builds means the admin's editor components, form
logic, and the Cognito SDK have no import path into the public bundle. The public site
has no login page, no auth context, and no knowledge that an admin exists.

The API is the only shared surface, and it enforces authorization server-side
regardless of what any client believes.

---

## 3. Content model

### 3.1 The core decision

The requirement is "add sections and build out the page through the admin." That draws
a line:

- **Adding a section instance** (a second project grid, another timeline entry) is
  **data**. No deploy.
- **Adding a new *kind* of section** (a testimonials block that has never existed) is
  **code** — one React component plus one registry entry. Deploy required.

This is the right place for the line. Pushing further — letting the admin define
arbitrary nested block types with dynamic form generation — means building Sanity, and
is explicitly out of scope.

### 3.2 Schema

Six tables across three concerns:

- **The page** — `sections` + `section_items` are the editable working set (always
  draft); `page_versions` holds immutable published snapshots (§3.3).
- **The blog** — `posts` holds one row per post, each independently publishable (§3.6).
- **Media** — `media_assets` tracks uploads, referenced by both (§6).

```sql
-- Editable working set -------------------------------------------------

CREATE TABLE sections (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type        text        NOT NULL,   -- 'hero' | 'about' | 'timeline' | ...
  position    integer     NOT NULL,
  is_hidden   boolean     NOT NULL DEFAULT false,
  data        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sections_position ON sections (position);

-- Repeatable children: projects, skills, timeline entries.
-- Sections without repeatable content (hero, about, contact) have zero rows here.
CREATE TABLE section_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id  uuid        NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  position    integer     NOT NULL,
  is_hidden   boolean     NOT NULL DEFAULT false,
  data        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_section_items_section ON section_items (section_id, position);

-- Published snapshots --------------------------------------------------

CREATE TABLE page_versions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version       integer     NOT NULL UNIQUE,
  document      jsonb       NOT NULL,   -- fully serialized page
  published_at  timestamptz NOT NULL DEFAULT now(),
  published_by  text        NOT NULL    -- cognito sub
);
CREATE INDEX idx_page_versions_version ON page_versions (version DESC);

-- Blog -----------------------------------------------------------------

CREATE TABLE posts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text        NOT NULL UNIQUE,   -- URL segment, immutable once published
  title           text        NOT NULL,
  excerpt         text        NOT NULL DEFAULT '',
  cover_media_id  uuid        REFERENCES media_assets(id) ON DELETE SET NULL,
  tags            text[]      NOT NULL DEFAULT '{}',
  draft_body      jsonb       NOT NULL DEFAULT '[]'::jsonb,  -- Block[] — §3.7
  published_body  jsonb,                                      -- null until first publish
  published_at    timestamptz,                                -- null = never published
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_posts_published ON posts (published_at DESC)
  WHERE published_at IS NOT NULL;
CREATE INDEX idx_posts_tags ON posts USING gin (tags);

-- Media ----------------------------------------------------------------

CREATE TABLE media_assets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  s3_key          text        NOT NULL UNIQUE,   -- 'media/{uuid}/{filename}'
  mime            text        NOT NULL,
  bytes           bigint      NOT NULL,
  width           integer,
  height          integer,
  duration_ms     integer,
  alt             text,
  confirmed_at    timestamptz,                   -- null until the upload is verified
  unreferenced_at timestamptz,                   -- set by GC; cleared if re-referenced
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_media_unreferenced ON media_assets (unreferenced_at)
  WHERE unreferenced_at IS NOT NULL;
```

### 3.3 Why snapshot publishing

A per-row `status: draft | published` column cannot express "this section is live *and*
has unpublished edits" — the row holds one copy of `data`. It also can't publish a
coordinated set of changes atomically, and it makes reordering ambiguous (which
`position` is live?).

Snapshotting sidesteps all of it:

- **Publish is atomic by construction.** One INSERT of one document.
- **The public read is one row, one query.** No joins, no N+1, no per-request assembly.
- **Caching is trivial.** `ETag: W/"v42"` where 42 is the version number. Cache
  invalidation is "the version changed."
- **Rollback is free.** Re-publish an older document as a new version.
- **The audit trail is inherent** — every publish is a retained row.

The cost is storage, which for a portfolio page is negligible. Retention: keep the last
**50 versions**, pruning beyond that.

### 3.4 Section type registry

`sections.type` is a string in the database and a discriminated union in TypeScript.
The public site holds a registry:

```ts
const SECTION_REGISTRY = {
  hero:        HeroSection,
  about:       AboutSection,
  timeline:    TimelineSection,
  skills:      SkillsSection,
  portfolio:   PortfolioSection,
  status:      StatusSection,      // live — §3.5
  blog:        BlogSection,        // live — §3.5
  now_playing: NowPlayingSection,  // live — §3.5
  contact:     ContactSection,
} satisfies Record<SectionType, ComponentType<any>>;
```

Rendering is a map over the published document's sections. An unknown `type` renders
nothing and logs — so publishing a section type that a not-yet-deployed public site
doesn't recognize degrades rather than crashes.

| type | has items | item shape |
|---|---|---|
| `hero` | no | — (static; see below) |
| `about` | no | — |
| `timeline` | yes | `{ date_range, title, description, media_id? }` |
| `skills` | yes | `{ title, description, icon_source, proficiency }` |
| `portfolio` | yes | `{ title, intro, description, media_id, playback_rate?, transform_value?, tech_icons[], links: Link[] }` |
| `status` | no | — (live; config only) |
| `blog` | no | — (live; config only) |
| `now_playing` | no | — (live; config only) |
| `contact` | no | — |

#### The `Link` type

v5 modelled project links as two optional scalars, `url` and `repo`. That cannot
represent a project spanning several repositories, a project with both a dev and a prod
deployment, or a project with documentation. Both scalars are **replaced** by one
ordered array, defined once and reused by portfolio items and by the blog's `links`
block (§3.7):

```ts
type Link = {
  type:  'repo' | 'prod' | 'dev' | 'docs' | 'demo' | 'package' | 'article' | 'other';
  label: string;   // "portfolio-v6-api", "Live site", "Gateway"
  url:   string;
};
```

`label` is **required and not derived from `type`** — five links all typed `repo` are
otherwise indistinguishable, which is precisely the case this replaces. `type` drives
the icon and grouping; `label` says *which one*. Array order is display order.

Links live inside the item's `data` rather than in a table of their own. They are never
addressed independently of their parent — always created, edited, and deleted with it —
so a table would add a third level of ordering machinery and buy nothing.

Validation, in the Zod schema:

- **Protocol allowlist: `http` and `https` only.** `z.string().url()` alone accepts
  `javascript:` URLs, which become stored XSS the moment they are rendered into an
  `href`. The admin is the only path by which content enters the system, so this is
  where it gets blocked.
- Rendered with `target="_blank" rel="noopener noreferrer"`.

Beyond about four links a flat row stops reading well; the renderer groups by `type`
under small headings ("Repositories", "Live", "Docs"). No cap on count.

### 3.5 Live sections

`status`, `blog`, and `now_playing` are **live sections**: their *configuration* is
published into the snapshot, but their *data* is fetched at runtime by the component.

This exists because `/api/content` is an immutable document served with `ETag: W/"v42"`
(§3.3) — the entire caching model depends on it not changing between publishes. Service
health changes by the minute and blog posts publish independently of the page, so
neither can live inside the snapshot without breaking that guarantee.

| type | config in snapshot | data fetched from |
|---|---|---|
| `status` | which services to show, whether to show response times | `GET /api/status` |
| `blog` | how many posts, tag filter | `GET /api/posts` |
| `now_playing` | idle behavior (`hide` \| `message`), whether to show album art | `GET /api/now-playing` |

Live-section components must render a loading state and must **degrade rather than
error** — a failed `/api/status` fetch renders the section as unavailable, never a
broken page. `status` in particular should render a genuine "degraded" state when the
API reports one; showing a real outage honestly is more useful than hiding it.

This is the only mechanism in v6 by which the public site shows data that is not in the
published document. New section types should not use it unless their data is genuinely
time-varying.

#### `status`

`GET /api/status` is served by portfolio-v6-api, not by the gateway directly. The
gateway's own `/api/health` is public and enumerates every internal service and port;
proxying it through the portfolio API means the exposed shape is a deliberate choice,
the response can be cached server-side (~30s) so traffic spikes don't become
health-check storms, and the public site is not coupled to the gateway's internal
response format.

Note that the gateway returns **503** when any enrolled service is down. The section
renders that as degraded, not as a failure.

#### `blog`

Renders the N most recent published posts as teaser cards linking to `/blog/:slug`.
Fetching the listing at runtime rather than embedding it in the snapshot is what keeps
post publishing decoupled from page publishing — writing a post does not require
republishing the page.

#### `now_playing`

Shows what the owner is currently listening to on Spotify: track title, artists,
album, album art, and a link to the track. Data comes from `GET /api/now-playing`,
which proxies Spotify server-side — the browser never talks to Spotify and never sees
a Spotify credential (§4.6).

- **Idle state is config, not accident.** When nothing is playing the section either
  hides entirely or renders a short "not listening right now" message, per the
  `idle` setting. Both are legitimate; which reads better is a design call.
- **The component refetches on an interval** (~60s) while mounted, and pauses when
  `document.hidden` — a backgrounded tab should not poll. This is the one live section
  whose data changes *while the visitor is on the page*, which is exactly why it must
  not be in the snapshot.
- **Album art is hotlinked from Spotify's CDN** (`i.scdn.co`), not ingested into the
  media pipeline. It is ephemeral, licensed content that Spotify serves and requires
  linking back to; storing it in `bk-portfolio-v6-*` would be both a terms problem and
  pointless duplication. This is the one place the public site renders an image that
  is not on `media.benkile.com`.
- Standard live-section rules apply: loading state, and **degrade rather than error** —
  a failed fetch renders as idle, never a broken section.

A "recently played" fallback (showing the last track when idle) is a deliberate
non-goal for v1 — it needs a second Spotify scope and endpoint. The response shape
leaves room for it (§4.6) if it's ever wanted.

### 3.6 The blog

A post is not a section. Posts have their own URLs, their own publish lifecycle, and a
rich body; sections are ordered fragments of one page. Modelling posts as
`section_items` would require slugs, per-item publish state, and nested block content
inside a structure designed for none of it.

So: one `posts` row per post, with **`draft_body` and `published_body` columns** rather
than the snapshot model used for the page.

This asymmetry is deliberate, not an inconsistency. Snapshot publishing exists (§3.3) to
make a *multi-row* artifact publish atomically and read in one query. A post is a single
row — it is already atomic, already a one-query read. Adding a `post_versions` table
would buy rollback and nothing else, at the cost of a second publishing mechanism to
maintain. Publishing a post is `published_body := draft_body`, which supports editing a
live post without the edits going out until published — the same property snapshotting
gives the page.

Per-post version history is deliberately omitted. It can be added later as
`post_versions` without touching anything else.

Additional rules:

- **`slug` is immutable once published.** Changing it breaks every inbound link. The
  admin permits editing it freely before first publish and blocks it after.
- `published_at` doubles as the publish flag and the display date. Null means never
  published; unpublishing nulls it and preserves `published_body`.
- Public endpoints only ever read `published_body`, never `draft_body`.

### 3.7 Post body: the block model

`draft_body` / `published_body` hold an **ordered array of blocks** — a discriminated
union on `type`, mirroring the section registry so the same rendering and validation
approach applies one level down:

```ts
type Block =
  | { type: 'heading';   level: 2 | 3 | 4; text: string }
  | { type: 'paragraph'; text: string }              // constrained inline markdown
  | { type: 'code';      language: string; code: string; filename?: string }
  | { type: 'media';     media_id: string; caption?: string }
  | { type: 'list';      ordered: boolean; items: string[] }
  | { type: 'quote';     text: string; attribution?: string }
  | { type: 'links';     links: Link[] }             // reuses §3.4's Link
  | { type: 'divider' };
```

The public site holds a `BLOCK_REGISTRY` keyed by `type`, exactly as it does for
sections, and unknown block types render nothing rather than crashing.

**Inline formatting** inside `paragraph`, `list`, and `quote` text is a *constrained
markdown subset* — bold, italic, inline code, and links — parsed and rendered to React
elements. **Raw HTML is never stored and never rendered.** Storing HTML would move
sanitization into the render path and make every admin write a potential XSS vector;
a constrained subset with no HTML escape hatch removes the question entirely.

#### The `code` block

```ts
{ type: 'code', language: string, code: string, filename?: string }
```

- **`language`** is validated against an allowlist that matches exactly the languages
  loaded into the highlighter. An unrecognised language renders as plain text rather
  than failing.
- **`code`** is stored raw. It is never pre-rendered to HTML and never escaped at rest —
  escaping happens at render time, once.
- **`filename`** is optional and renders as a header label above the block
  (`src/app.ts`), which is worth having for multi-file examples.

**Copy button.** Every code block renders a copy control backed by
`navigator.clipboard.writeText(block.code)` — copying the raw stored string, not the
DOM's text content, so highlighting markup and line numbers can never contaminate what
lands on the clipboard. The Clipboard API requires a secure context, which is satisfied
everywhere the site is served over HTTPS. The control shows a transient "Copied"
confirmation and falls back to selecting the block's text if the API is unavailable.

**Highlighting happens client-side**, with the highlighter dynamically imported only on
routes that actually contain a code block, and only the allowlisted languages bundled.
Shiki gives the most accurate output; Prism is the lighter option if bundle size
dominates.

The alternative — pre-rendering highlighted HTML into `published_body` at publish
time — was rejected. It would mean storing HTML (see above), coupling the API to a
rendering library, and re-publishing every post whenever the theme or highlighter
changes.

### 3.8 The hero

**v5's animated header does not carry over.** `HeaderBackgroundLogic.js` and its jQuery
dependency are dropped, not ported — which removes jQuery from the project entirely.
The `hero` section type is retained as a **static** section (title, tagline, optional
background media) and no canvas or animation code is written for it. If a future
restyle (§14) ends up with no hero at all, deleting the type is one component and
one registry line.

### 3.9 Validation

Every section type, item type, and block type has a **Zod schema** in the API. These are
canonical and do triple duty:

1. Server-side validation on every admin write. JSONB accepts arbitrary garbage
   otherwise, and a malformed `data` blob would only surface as a public-site crash.
2. Form generation in the admin, so adding a section or block type doesn't require
   hand-writing a bespoke form.
3. Publish-time validation — `POST /api/admin/publish` re-validates the entire working
   set, and `POST /api/admin/posts/:id/publish` re-validates the post body. Both refuse
   to publish if anything fails. Invalid content can reach a draft; it can never reach
   production.

---

## 4. API

Base path through the gateway: `https://api.benkile.com/portfolio-v6-api`
(the gateway strips the `/portfolio-v6-api` prefix before forwarding).

### 4.1 Public endpoints — no authentication

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/health` | Returns 200 immediately. No DB call. |
| `GET` | `/api/content` | Latest `page_versions.document`, media refs resolved to CDN URLs. `ETag` + `Cache-Control`. |
| `GET` | `/api/status` | Curated service health for the `status` section (§3.5). Cached ~30s. |
| `GET` | `/api/now-playing` | Current Spotify track for the `now_playing` section (§3.5, §4.6). Cached ~30s. |
| `GET` | `/api/posts` | Published post summaries. `?limit=`, `?tag=`, `?cursor=`. |
| `GET` | `/api/posts/:slug` | One published post, `published_body` only. `ETag`. |

There is **no** `/api/media` endpoint. Media is served directly from CloudFront and
never transits the API — see §6.

`GET /api/posts` returns summaries only — `slug`, `title`, `excerpt`, `cover`, `tags`,
`published_at` — never bodies. `GET /api/posts/:slug` returns `404` for a slug that
exists but has never been published; drafts are invisible to the public API.

`GET /api/content` returns:

```jsonc
{
  "version": 42,
  "published_at": "2026-07-24T18:00:00Z",
  "sections": [
    { "id": "…", "type": "hero", "data": { … }, "items": [] },
    { "id": "…", "type": "portfolio", "data": { … }, "items": [ … ] }
  ]
}
```

Responds `304` on a matching `If-None-Match`. If no version has ever been published,
returns `200` with an empty `sections` array rather than a 404 — the public site should
render an empty page, not an error.

### 4.2 Admin endpoints — `requireAdmin()` on every route (two exceptions, marked †)

Every route below sits behind `requireAdmin()` (§5.3), with one deliberate exception:
the two preview-serialization routes marked **†** are guarded by a
`requireAdminOrPreviewToken()` middleware that accepts *either* a bearer admin token
*or* a valid preview token (§7). They must, because they are called by the public site
inside the preview iframe — and the public bundle has no Cognito SDK by design (§2.1),
so `requireAdmin()` alone would be unsatisfiable there. The preview token grants
read-only access to exactly those two routes and nothing else.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/admin/sections` | Full working set, drafts included |
| `POST` | `/api/admin/sections` | Create a section |
| `PATCH` | `/api/admin/sections/:id` | Update `data` / `is_hidden` |
| `DELETE` | `/api/admin/sections/:id` | Delete (cascades to items) |
| `PUT` | `/api/admin/sections/order` | Reorder — accepts a full ordered id array |
| `POST` | `/api/admin/sections/:id/items` | Create an item |
| `PATCH` | `/api/admin/items/:id` | Update an item |
| `DELETE` | `/api/admin/items/:id` | Delete an item |
| `PUT` | `/api/admin/sections/:id/items/order` | Reorder items |
| `POST` | `/api/admin/media/upload-url` | Presigned S3 PUT + `media_assets` row |
| `POST` | `/api/admin/media/:id/confirm` | Verify the object landed, mark confirmed |
| `GET` | `/api/admin/media` | List assets, including orphan status and deletion date |
| `DELETE` | `/api/admin/media/:id` | Delete asset + S3 object |
| `POST` | `/api/admin/media/sweep` | Run garbage collection on demand (§6.9) |
| `GET` | `/api/admin/posts` | All posts, drafts included |
| `POST` | `/api/admin/posts` | Create a post |
| `GET` | `/api/admin/posts/:id` | One post with `draft_body` |
| `PATCH` | `/api/admin/posts/:id` | Update metadata or `draft_body` |
| `DELETE` | `/api/admin/posts/:id` | Delete a post |
| `POST` | `/api/admin/posts/:id/publish` | Validate + `published_body := draft_body` |
| `POST` | `/api/admin/posts/:id/unpublish` | Null `published_at`, retain `published_body` |
| `POST` | `/api/admin/preview-token` | Mint an opaque 15-min read-only preview token (§7) |
| `GET` | `/api/admin/preview` † | Serialize the **draft** page in `/api/content` shape |
| `GET` | `/api/admin/preview/posts/:id` † | Serialize a post's **draft** body |
| `POST` | `/api/admin/publish` | Validate + snapshot → new version |
| `GET` | `/api/admin/versions` | Version history |
| `POST` | `/api/admin/versions/:v/restore` | Restore an old version — new snapshot **and** working-set reset (see below) |

Reorder takes a full ordered array rather than per-item position patches. It's one
transaction, it's idempotent, and it makes drag-and-drop trivial to implement correctly.

Post block bodies are written wholesale via `PATCH .../posts/:id` with a complete
`draft_body` array — blocks are not individually addressable endpoints. The editor holds
the array in memory and saves it as a unit, which keeps ordering, insertion, and
deletion as plain array operations rather than nine more routes.

**Restore rewrites the working set.** `POST /api/admin/versions/:v/restore` does two
things in one transaction: it re-publishes version *v*'s document as a new version (the
live site changes immediately), and it **replaces the entire working set** — `sections`
and `section_items` are deleted and rebuilt from the restored document. The second half
is not optional: without it, the admin would still hold the newer draft after a
restore, and the next publish would silently undo it. The consequence is that
**unpublished edits are lost on restore**, so the admin UI must state this and confirm
before invoking it. Media referenced only by the discarded draft is not deleted by the
restore itself — it simply becomes unreferenced, and the normal GC pass (§6.9) gives it
the standard 30-day grace period, during which re-referencing rescues it.

### 4.3 Response envelope

Match the `file-manager-api` convention already in use:

```jsonc
{ "status": "ok",    "error": false, "data": { … } }
{ "status": "error", "error": true,  "errorMsg": "…" }
```

### 4.4 Error handling

Do **not** carry over v5's `res.render("error", …)` handler — no view engine is
configured, so it throws instead of returning a clean 500. Use file-manager-api's JSON
error handler.

### 4.5 Concurrency

Wholesale writes — a complete `draft_body` array, a full `data` blob — mean two open
admin tabs (or one stale tab left open overnight) can silently overwrite each other's
work. Every `PATCH` on sections, items, and posts therefore carries an optimistic
concurrency precondition: the client sends `expected_updated_at`, the row's
`updated_at` as it last read it, and the API compares before writing.

- **Match** → the write proceeds and the response returns the new `updated_at`.
- **Mismatch** → **409**, no write. The client refetches, and the admin UI surfaces
  "this changed since you loaded it" rather than silently losing either copy.
- `expected_updated_at` is **required** on these routes, not optional — an
  unconditional overwrite should be impossible to express, not merely discouraged.

The reorder routes (`PUT .../order`) are exempt: they are idempotent full-array
replacements, and losing a race there costs a re-drag, not data. `POST
/api/admin/publish` needs no precondition either — it snapshots whatever the working
set is at that moment, and preview exists precisely to check that state first.

This is deliberately lighter than per-field merging or real-time collaboration, which
a single-admin system does not need. It is a seatbelt for the two-tab case, priced
accordingly: one timestamp comparison per write.

### 4.6 Spotify integration — `/api/now-playing`

The `now_playing` section (§3.5) needs Spotify's *Get Currently Playing Track*
endpoint, which requires a user-authorized token with the
`user-read-currently-playing` scope — client-credentials auth cannot read a user's
playback. The API proxies it for the same reasons `/api/status` proxies the gateway:
the credential stays server-side, the exposed shape is a deliberate choice, and a
server-side cache means visitor traffic never multiplies upstream calls.

**One-time bootstrap.** Create a Spotify app in the developer dashboard (redirect URI
`http://127.0.0.1:8888/callback`), then run `scripts/spotify-auth.ts` locally: it
walks the authorization-code flow in a browser, exchanges the code, and prints the
**refresh token**. Store client id, client secret, and refresh token in Secrets
Manager (§9.3). Spotify refresh tokens do not expire; if one is ever revoked, the
symptom is a 400 `invalid_grant` on refresh, and the fix is re-running the bootstrap.
One Spotify app and one refresh token serve both environments — prod and dev are
reading the same person's playback.

**Runtime flow.** The API holds the current access token in memory, exchanging the
refresh token for a new one on startup and whenever a request 401s or the ~1-hour
expiry passes. `GET /api/now-playing` then:

1. Serves from a ~30-second in-memory cache when fresh. Whatever the visitor count,
   Spotify sees at most ~2 requests/minute — this is what protects the app's rate
   limit, and it makes the endpoint safe to poll from the client (§3.5).
2. On a cache miss, calls `GET /v1/me/player/currently-playing`. Spotify returns
   **204 when nothing is playing** — that is a normal response, not an error.
3. Returns a curated shape, never Spotify's raw payload:

```jsonc
{ "playing": true,
  "track": {
    "title":       "…",
    "artists":     ["…"],
    "album":       "…",
    "art_url":     "https://i.scdn.co/image/…",
    "url":         "https://open.spotify.com/track/…",
    "progress_ms": 83000,
    "duration_ms": 214000
  } }
// or
{ "playing": false }
```

On any Spotify failure — timeout, 5xx, auth breakage — the endpoint returns
`{ "playing": false }` and logs. It never surfaces an upstream error to the public
site; a broken Spotify integration renders as "not listening," which is the §3.5
degrade rule applied.

No Spotify token, in any form, is ever included in a response. The browser's only
contact with Spotify is the hotlinked album art and the outbound track link (§3.5).

---

## 5. Authentication & authorization

### 5.1 Cognito pools

Two new pools, mirroring the `file-manager-up` / `file-manager-dev-up` naming already
in the account:

| Pool | Environment |
|---|---|
| `portfolio-v6-admin-up` | production |
| `portfolio-v6-admin-dev-up` | development |

Configuration for both:

- `AllowAdminCreateUserOnly: true` — **no self-signup.** Accounts exist only because
  they were created by hand in the console.
- Username attribute: `email`
- Required attributes: `email`, `given_name`, `family_name`
- Password policy: 12+ chars, upper/lower/number/symbol (stricter than the
  file-manager pool's 8, since this account can rewrite the public site)
- **MFA: TOTP required on the production pool**, optional on dev
- One group per pool: `admins`
- One app client per pool, no client secret (public SPA client), SRP auth flow

Deliberately **not** reusing `file-manager-up`: `aws-jwt-verify` validates both pool ID
and client ID, so separate pools mean a file-manager token is cryptographically invalid
against the portfolio API. That isolation is worth the five minutes of setup.

### 5.2 Token flow

Identical to `FileManager`, which is already proven:

1. Admin site authenticates with `amazon-cognito-identity-js` via SRP directly against
   the pool. No hosted UI, no OAuth redirect.
2. The SDK persists the session in `localStorage`; `getIdToken()` refreshes as needed.
3. An axios request interceptor attaches `Authorization: Bearer <idToken>`.
4. A response interceptor catches `401`, attempts exactly one silent refresh-and-retry,
   and only then forces logout. (Carry this over — it's what prevents a transient
   refresh failure from dropping you mid-edit.)

### 5.3 API verification

Simpler than file-manager-api, which needs a local `users` table for sharing between
users. Portfolio v6 has exactly one class of user, so there is **no `users` table, no
`cognito_sub` join, and no `/register` endpoint.**

A single middleware:

```ts
// requireAdmin(): verify signature, expiry, pool, client, and group membership.
const verifier = CognitoJwtVerifier.create({
  userPoolId: secrets.cognito_user_pool_id,
  clientId:   secrets.cognito_client_id,
  tokenUse:   "id",
});

const payload = await verifier.verify(token);
const groups = (payload["cognito:groups"] as string[]) ?? [];
if (!groups.includes("admins")) return res.status(403).json({ … });
req.adminSub = payload.sub;
```

Group membership rather than a hardcoded `sub` in secrets: adding or revoking an admin
becomes a console action instead of a secret rotation plus redeploy.

**The gateway does not authenticate proxied traffic.** Its `protectedRoute()` guards
only `/api/about-me`, `/api/ec2-launch`, and `/api/deploy`; everything in `serviceMap`
is proxied unauthenticated. `portfolio-v6-api` is solely responsible for its own
authorization.

### 5.4 CORS

The public site (`benkile.com`) and admin (`admin.benkile.com`) are both cross-origin to
`api.benkile.com`. The gateway runs `cors()` and `helmet({ crossOriginResourcePolicy:
false })` ahead of its proxy middleware, so it answers preflight itself and permits the
`Authorization` header on admin requests. Auth is a bearer header, not a cookie, so
wildcard-origin CORS is correct and no credentials mode is needed.

`portfolio-v6-api` keeps v5's pattern: enable `cors()` only when `IS_LOCAL=true`, for
direct local access. In production the gateway owns it.

---

## 6. Media & CDN

**All media is served from CloudFront. Nothing streams through the API.** v5's
`/api/media` S3 proxy is not carried forward — it is deleted, not deferred.

This removes the single worst throughput characteristic of v5, where every image and
video byte for every visitor flowed S3 → container → gateway → ALB on a `t4g.medium`
shared with nine other containers. In v6 the EC2 host is entirely out of the media
path; it issues presigned upload URLs and nothing else.

### 6.1 Which CloudFront pattern

The account already runs both patterns, and they are not interchangeable:

| Pattern | Used by | Behavior |
|---|---|---|
| OAC + **trusted key group** | `file-manager-prod/dev` | Signed URLs, 15-min TTL, 403 at edge if unsigned |
| OAC + **no key group** | `wmsfo-api-prod/dev`, `world-data-prod` | Public read, private bucket |

**Portfolio v6 uses the second pattern** — the wmsfo/world-data model, not the
file-manager model.

Signed URLs are correct for file-manager because its content is private per-user and
access must be re-validated as permissions change. Portfolio media is the opposite: it
is *published content on a public website*. Applying signing there would be actively
harmful:

- Every image would require an API round-trip to mint a URL before it could render.
  A page with 20 media items either makes 20 calls or a batch-mint call on the critical
  path of first paint.
- A 15-minute TTL cannot live inside a published snapshot. §3.3's whole design is an
  immutable document served with `ETag: W/"v42"` — embedding URLs that expire in 15
  minutes contradicts that directly.
- Expiring URLs defeat browser caching across sessions and would block any future move
  to static generation.
- The content is intended to be public. Signing would add cost and latency to protect
  something that is deliberately not secret.

The signed pattern remains available if genuinely gated content is ever needed — see
§6.6.

### 6.2 Buckets

| Bucket | Environment |
|---|---|
| `bk-portfolio-v6-prod` | production |
| `bk-portfolio-v6-dev` | development |

Both **fully private**: all four public access blocks on. The only read access is a
bucket policy granting `s3:GetObject` to the CloudFront service principal, scoped to
the specific distribution ARN — identical in shape to `file-manager-prod-bucket`'s
existing policy:

```jsonc
{
  "Version": "2008-10-17",
  "Statement": [{
    "Sid": "AllowCloudFrontServicePrincipal",
    "Effect": "Allow",
    "Principal": { "Service": "cloudfront.amazonaws.com" },
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::bk-portfolio-v6-prod/*",
    "Condition": {
      "ArnLike": { "AWS:SourceArn": "arn:aws:cloudfront::719766734490:distribution/<DIST_ID>" }
    }
  }]
}
```

Direct S3 URLs stay unreachable from the internet. CloudFront is the only reader.

Both buckets carry the lifecycle rules defined in §6.9 (`expire-pending-uploads`,
`expire-orphaned-media`, and abort-incomplete-multipart).

### 6.3 Distributions

| Distribution | Origin | Alias | Environment |
|---|---|---|---|
| `portfolio-v6-prod` | `bk-portfolio-v6-prod` | `media.benkile.com` | production |
| `portfolio-v6-dev` | `bk-portfolio-v6-dev` | `media-dev.benkile.com` | development |

Configuration for both:

| Setting | Value | Why |
|---|---|---|
| Origin access | **OAC**, signing `always` | Matches every existing distribution in the account |
| Trusted key groups | **Disabled** | §6.1 |
| Alternate domain name | `media.benkile.com` / `media-dev.benkile.com` | §6.10 |
| Viewer certificate | ACM cert in **us-east-1** | CloudFront requires us-east-1 |
| Allowed methods | `GET, HEAD` | Uploads go direct to S3, not through the CDN |
| Viewer protocol | `redirect-to-https` | Consistent with existing distributions |
| Compress | `true` | |
| Cache policy | `658327ea-f89d-4fab-a63d-7e88639e58f6` (managed **CachingOptimized**) | Already used by every distribution in the account |
| Response headers policy | managed **SimpleCORS** | §6.5 |
| Price class | `PriceClass_All` | Matches existing; drop to `PriceClass_100` if cost matters |

Range requests are handled **natively by CloudFront** against an S3 origin, so video
scrubbing works with no application code. v5's hand-rolled 206/`Content-Range` logic in
`mediaRouter.ts` has no equivalent in v6 and should not be ported.

### 6.4 Keys, immutability, and cache strategy

Objects are written once and never modified. Keys embed a UUID:

```
media/{uuid}/{original-filename}
```

Every object is uploaded with:

```
Cache-Control: public, max-age=31536000, immutable
```

Consequences worth being explicit about:

- **Invalidations are never needed.** Replacing an image means uploading a new object
  under a new UUID and repointing the section — the old URL stays valid and cached,
  the new URL is cold. No `CreateInvalidation` calls, no invalidation costs, no
  edge-propagation delay between publishing and visitors seeing the change.
- **The edge cache is shared across all viewers** because CachingOptimized keys on the
  path and ignores query strings.
- **Draft media is unlisted, not gated.** An object uploaded but not yet referenced by
  a published version sits at an unguessable UUID path. The bucket is private, the
  distribution serves no directory listing, and there is no enumeration path. This is
  the "unlisted video" model. It is a **deliberate, accepted trade** — draft media is
  not protected by access control; it is bounded by *lifecycle* instead (§6.9), so
  anything never published is deleted rather than guarded. If genuine gating is ever
  required, see §6.6.

### 6.5 CORS

`<img src>` and `<video src>` do **not** require CORS headers for normal rendering.
v5 set `crossOrigin="anonymous"` on its `<img>` tags, which *does* force a CORS check —
**drop that attribute in v6** unless a renderer genuinely needs pixel access via canvas.

The managed **SimpleCORS** response headers policy is attached anyway so that
`crossOrigin` usage, `fetch()` of media, and canvas-based effects work without a
distribution change later.

### 6.6 If gated media is ever needed

Add a second cache behavior on the same distribution for a `private/*` path prefix with
a trusted key group attached, and issue signed URLs for that prefix only using
`generateSignedCloudFrontUrl()` — which already exists, working, in
`file-manager-api/src/aws/s3Service.ts` and handles the PEM-normalization quirks of
keys stored in Secrets Manager. The default `media/*` behavior stays public.

This is a deliberate non-goal for v1.

### 6.7 Upload path

Bytes go **browser → S3 directly**. They never touch the gateway or the API.

1. Admin calls `POST /api/admin/media/upload-url` with filename, mime, and size.
2. API validates mime against an allowlist and size against a cap, generates
   `media/{uuid}/{filename}`, and returns a presigned PUT URL (15-min TTL) with
   `Cache-Control`, `Content-Type`, **and `Tagging: state=pending`** pinned into the
   signature. A `media_assets` row is inserted with `confirmed_at = null`.
3. Admin `PUT`s the file straight to S3, sending a matching
   `x-amz-tagging: state=pending` header.
4. Admin calls `POST /api/admin/media/:id/confirm`; the API `HEAD`s the object to verify
   it landed, records the true byte size, **removes the `state=pending` tag**, and sets
   `confirmed_at`.

> **Gotcha:** when `Tagging` is part of a presigned PUT signature, the client's
> `x-amz-tagging` header must match it byte-for-byte or S3 rejects the upload with 403.
> This is the most likely source of a confusing upload failure.

The pending tag makes abandoned uploads clean themselves up with **zero application
code** — see §6.9.

Presigned S3 PUT is used rather than multipart. `file-manager-api` needs multipart
because it accepts arbitrary large files; portfolio media is a handful of images and
short videos, and a single PUT handles up to 5 GB. If that ever becomes limiting, the
multipart helpers in `file-manager-api/src/aws/s3Service.ts` port over directly.

### 6.8 URL resolution

`media_assets` stores **`s3_key` only** — never an absolute URL. The published document
in `page_versions` likewise references media by `media_id` and carries a `media` lookup
map of ids to keys, as does every post response for the media referenced by its body.

The content, post, and preview endpoints all resolve keys to absolute URLs at read time
through one function:

```ts
const toCdnUrl = (key: string) => `https://${secrets.cdn_domain}/${key}`;
```

Resolving at read time rather than baking URLs into the snapshot keeps published
documents domain-agnostic. Introducing signing for a prefix, or moving the CDN behind a
different hostname, becomes a config change plus one function — with no document
rewrite and no republish of history.

### 6.9 Lifecycle & garbage collection

Media must not accumulate indefinitely. Two distinct kinds of garbage exist and they
are handled by two different mechanisms, because only one of them is knowable to S3.

#### Abandoned uploads — pure S3, no application code

An upload URL is issued, the browser PUTs (or doesn't), and the user closes the tab
before confirming. S3 can resolve this on its own via a **lifecycle rule filtered on the
object tag** applied at upload time (§6.7):

| Rule | Filter | Action |
|---|---|---|
| `expire-pending-uploads` | tag `state=pending` | Expiration after **1 day** |

Confirming an upload removes the tag, which removes the object from the rule's scope.
Anything never confirmed expires by itself. No sweeper, no scheduler, no code.

A companion rule aborts incomplete multipart uploads after 1 day. v6 uses single PUT
(§6.7), so this should never fire — it costs nothing and prevents silent storage leaks
if multipart is ever introduced.

#### Unreferenced media — application-level, because only the DB knows

An asset that was uploaded, used, and later removed cannot be identified by S3 —
reference state lives in Postgres. An asset is **referenced** if its `media_id` appears
in **any** of:

- the current page working set (`sections.data` / `section_items.data`),
- any retained `page_versions.document` (the last 50 — §3.3),
- any post's `draft_body` **or** `published_body`, or its `cover_media_id` (§3.6).

All four matter, and **the post sources are easy to forget** — omitting them would mean
publishing a post and then deleting its own images on the next GC pass. Blog media is
referenced from a different table than page media and must be scanned explicitly.

Working-set and draft-body references protect work in progress; version and
published-body references protect rollback, since restoring version 37 must not 404 on
media deleted since.

The GC pass:

1. Collect every `media_id` from all four sources into one set. At this scale — dozens
   of sections, 50 versions, a modest post count — this is a full scan in application
   code. Obviously correct, and fast enough that a `media_refs` join table would be
   premature.
2. For confirmed assets **not** in that set and older than the **30-day grace period**:
   set `unreferenced_at` and tag the S3 object `state=orphaned`.
3. For assets that *are* in the set but have `unreferenced_at` set: clear the column and
   remove the tag. Re-referencing an asset rescues it.

| Rule | Filter | Action |
|---|---|---|
| `expire-orphaned-media` | tag `state=orphaned` | Expiration after **7 days** |

The 7-day window between tagging and deletion is deliberate: it is an undo window. A
mistaken removal can be reversed by re-referencing the asset within a week, and the GC
pass untags it on its next run.

Rows whose S3 object has expired are deleted from `media_assets` on the following pass.

#### When GC runs

**After every successful page publish and every post publish**, in the same request.
Publishing is what prunes retained versions, and version pruning is what creates most
orphans — so it is the natural trigger. No cron, no Lambda, no EventBridge, and nothing
new in the infrastructure.

`POST /api/admin/media/sweep` runs the same pass on demand, and the admin media library
surfaces which assets are tagged orphaned along with their scheduled deletion date.

Draft media that is actively being worked on is never at risk: the 30-day grace period
is measured from upload, so an asset added and removed from a draft in the same session
is far too young to be considered.

#### Timing caveat

S3 lifecycle evaluation is **asynchronous and runs roughly once daily**. "1 day" means
*at least* one day — commonly 24–48 hours — and expiration is not immediate on the
boundary. This is fine for garbage collection and should not be mistaken for a
guarantee about when an object becomes unreachable. Nothing in v6 depends on prompt
deletion for correctness or for access control.

### 6.10 Custom domain

Media is served from **`media.benkile.com`** (prod) and **`media-dev.benkile.com`**
(dev). Raw `*.cloudfront.net` domains are not used.

Setup, per environment:

1. **ACM certificate in us-east-1.** CloudFront only accepts certificates from
   us-east-1 regardless of where the distribution serves — which is the region
   everything else already lives in. The existing `api.benkile.com` certificate is
   single-SAN and cannot be reused; request a new one. Either one cert per hostname or
   a single cert with both `media.benkile.com` and `media-dev.benkile.com` as SANs —
   the latter is one fewer thing to renew.
2. **DNS validation.** ACM issues a `_<hash>.media.benkile.com` CNAME challenge; add it
   at Vercel DNS, which is authoritative for `benkile.com` (`ns1`/`ns2.vercel-dns.com`).
   Validation typically completes within minutes.
3. **Attach the alias** to the distribution as an alternate domain name and select the
   validated certificate.
4. **CNAME `media.benkile.com` → `<dist-id>.cloudfront.net`** at Vercel DNS.

This is not cosmetic. Because §6.8 resolves URLs at read time and §6.4 makes keys
immutable, a stable custom hostname means published documents never carry a
CloudFront-generated domain — so a distribution can be replaced or rebuilt without
touching a single stored media reference.

Do the certificate request early: DNS validation is the one step with latency that
isn't under your control, and §12 step 1 blocks on it.

---

## 7. Preview

The admin needs to see unpublished changes exactly as visitors will. With three
separate repos there is no shared component package, so the admin cannot import the
public site's renderers.

**Solution: the admin embeds the real public site in an iframe.**

```
admin.benkile.com/preview            → <iframe src="…/?preview=<token>">
admin.benkile.com/posts/:id/preview  → <iframe src="…/blog/:slug?preview=<token>">
```

The public site, seeing `?preview=`, fetches `/api/admin/preview` (or
`/api/admin/preview/posts/:id` on a blog route) with that token instead of the public
endpoint, and renders the draft through its normal component tree.

Posts get preview for the same reason the page does — a post body is blocks, media, and
code that must be seen rendered before publishing, and the iframe gives that with no
second renderer.

This is strictly better than a reimplementation:

- Preview is the production renderer **by construction**. It cannot drift, because
  there is no second copy.
- No shared package, no publishing to a registry, no submodules — the three-repo
  boundary stays clean.
- The public site gains ~20 lines and no new dependency.

The preview token is minted by `POST /api/admin/preview-token` (behind `requireAdmin`),
is opaque and single-purpose, and expires in 15 minutes. It grants read-only access to
draft content and nothing else, so it is safe to place in a URL.

The token is what makes the flow possible at all: the public site has no Cognito SDK
and no bearer token by design (§2.1), so the two preview-serialization endpoints are
the only admin routes **not** guarded by `requireAdmin()` alone — they accept either an
admin bearer token or a valid preview token, via `requireAdminOrPreviewToken()` (§4.2).
The token authorizes exactly those two `GET`s; every mutating route still requires a
real admin token.

The public site must send `X-Robots-Tag: noindex` (or a `<meta>` equivalent) when in
preview mode.

---

## 8. Repositories

Three repos, already created:

```
portfolio-v6/          git@github.com:benjaminfkile/portfolio-v6.git
portfolio-v6-api/      git@github.com:benjaminfkile/portfolio-v6-api.git
portfolio-v6-admin/    git@github.com:benjaminfkile/portfolio-v6-admin.git
                       (currently checked out as "untitled folder" — rename on disk)
```

### 8.1 `portfolio-v6-api`

```
├── index.ts                    secrets → initDb → listen (v5 pattern)
├── knexfile.ts                 migrations config (file-manager-api pattern)
├── Dockerfile                  multi-stage, node:20
├── .github/workflows/deploy.yaml
└── src/
    ├── app.ts
    ├── schemas/                Zod per section, item, and block type — canonical
    ├── routers/                health, content, status, posts, admin/*
    ├── middleware/requireAdmin.ts
    ├── services/               sectionService, postService, publishService,
    │                           mediaService, statusService
    ├── db/                     db.ts, migrations/
    └── aws/                    getAppSecrets, getDBSecrets, s3Service, cognitoAuth
```

### 8.2 `portfolio-v6` (public)

Vite + React + TypeScript + React Router. No auth dependency. No Cognito SDK.

```
├── middleware.ts               per-post OG tags on /blog/:slug — §9.7
├── vercel.json                 SPA rewrite — §9.6
└── src/
    ├── main.tsx
    ├── App.tsx                 routes
    ├── pages/
    │   ├── HomePage.tsx        fetch /api/content → map sections → registry
    │   ├── BlogIndexPage.tsx   /blog
    │   └── BlogPostPage.tsx    /blog/:slug
    ├── sections/               one component per section type
    ├── blocks/                 one component per block type (§3.7)
    ├── registry.ts             SECTION_REGISTRY + BLOCK_REGISTRY
    └── types/content.ts        generated — see §8.4
```

**The blog introduces routing to the public site**, which v5 did not have — it was one
page with anchor links. This brings React Router in as a dependency and requires an SPA
rewrite on Vercel (§9.6) so `/blog/some-post` serves `index.html` rather than 404ing.
It also means the preview iframe targets a path, not just a query string (§7).

### 8.3 `portfolio-v6-admin`

Vite + React + TypeScript + **MUI** (consistent with `FileManager`). The admin is
exempt from §14's plain-HTML constraint, which applies to the public site only: it is
fully themed — light and dark palettes, system theme detection, persisted manual
override — and **fully built out in phase 1**. See §14.4.

```
└── src/
    ├── lib/cognitoClient.ts    ported from FileManager
    ├── api/                    apiClient + interceptors, ported
    ├── contexts/AuthContext.tsx
    ├── pages/                  Login, Sections, SectionEdit, Posts, PostEdit,
    │                           Media, Preview, Versions
    ├── components/BlockEditor/ block list, add/reorder/delete, per-type editors
    └── types/content.ts        generated — see §8.4
```

The block editor is the single largest piece of admin UI. It edits a `Block[]` array in
memory and saves it whole (§4.2), so insertion, reordering, and deletion are array
operations rather than server round-trips. Per-block editors are generated from the Zod
schemas where possible; `code` and `media` blocks get bespoke ones — a code textarea
with language selection, and a media picker over the asset library.

### 8.4 Type sharing across three repos

The Zod schemas in `portfolio-v6-api/src/schemas/` are canonical. Rather than
hand-maintaining three copies of the content types — the exact failure that produced
v5's `playbackRate` vs `playback_rate` and `img_title` vs `file_name` drift — the API
exposes its schema:

```
GET /api/schema   →  JSON Schema derived from the Zod definitions
```

Each frontend has `npm run sync:types`, which fetches that and writes
`src/types/content.ts` (generated, committed, marked do-not-edit). CI on both frontends
re-runs it and fails if the working tree changes, so drift is caught at build time
rather than at runtime.

This is deliberately lighter than publishing a package to GitHub Packages — no registry
auth, no version bumps, no lockstep releases. If it proves insufficient, a published
`@benkile/portfolio-v6-types` package is the upgrade path.

---

## 9. Infrastructure

### 9.1 Databases

Two new databases on the **existing** `bk-db` instance
(`bk-db.cz04ki0uau1m.us-east-1.rds.amazonaws.com:5432`, Postgres 17.9). Not new RDS
instances — a second `db.t3.micro` would double RDS spend for a portfolio site, and the
existing instance already hosts multiple applications' databases this way.

| Database | Owner role | Environment |
|---|---|---|
| `portfolio_v6_prod` | `portfolio_v6_user` | production |
| `portfolio_v6_dev` | `portfolio_v6_dev_user` | development |

One role per database, each with privileges on its own database only — matching the
existing `portfolio_user_secret` / `wmsfo_user_secret` pattern.

Migrations use Knex, exactly as `file-manager-api` does, run manually:

```bash
DB_HOST=bk-db.cz04ki0uau1m.us-east-1.rds.amazonaws.com \
DB_NAME=portfolio_v6_dev DB_USER=portfolio_v6_dev_user \
DB_PASSWORD=… DB_SSL=true npm run migrate:latest
```

The `bk-db-sg` security group allows 5432 from the EC2 instance SG plus a single
hardcoded `/32` (`172.2.68.43`) for local access. **Verify that `/32` still matches your
current IP** before the first migration run — it was set some time ago and residential
addresses rotate.

### 9.2 Container ports

Ports in use on the shared host: `3001` (portfolio-api/v5), `3003` (wmsfo), `3004`
(3gixhub), `3005` (lease-tracker), `3007` (file-manager), with dev containers on
`4003/4004/4005/4007`. Following the established `port + 1000` dev convention:

| Container | Port | Image tag |
|---|---|---|
| `portfolio-v6-api` | 3002 | `:latest` |
| `portfolio-v6-api-dev` | 4002 | `:dev` |

Both containers are **permanent**, not transitional. v5's `portfolio-api` on 3001 runs
alongside them indefinitely — v5 and v6 coexist on the shared host until the owner
chooses to retire v5 (§12).

### 9.3 Secrets Manager

| Secret | Consumer |
|---|---|
| `portfolio-v6-api-secrets` | prod container |
| `portfolio-v6-api-secrets-dev` | dev container |

Shape (following the v5 `IAPISecrets` convention):

```jsonc
{
  "db_name": "portfolio_v6_prod",
  "node_env": "production",
  "port": "3002",
  "s3_bucket_name": "bk-portfolio-v6-prod",
  "cdn_domain": "media.benkile.com",          // media-dev.benkile.com in the dev secret
  "cognito_user_pool_id": "us-east-1_…",
  "cognito_client_id": "…",
  "aws_region": "us-east-1",
  "spotify_client_id": "…",          // §4.6 — same values in prod and dev secrets
  "spotify_client_secret": "…",
  "spotify_refresh_token": "…"
}
```

No CloudFront key pair or private key is stored, because v6 does not sign URLs (§6.1).
If §6.6's gated-media option is ever adopted, `cloudfront_key_pair_id` and
`cloudfront_private_key` join this secret, matching `file-manager-api`.

DB credentials come from a separate secret via `getDBSecrets()`, matching v5. The
instance role already has Secrets Manager read access.

**Do not** follow the 3gixhub pattern of injecting credentials as `-e` env vars in the
launch template — those land in `docker inspect` and in `/var/log/startup.log` on the
host.

### 9.4 Gateway registration

Add to `bk-gateway-api/src/config/serviceMap.ts`:

```ts
"portfolio-v6-api": {
  port: 3002,
  includeInHealthCheck: false,   // see below
  includeDevApi: true,
},
```

**`includeInHealthCheck: false` during development, deliberately.** The gateway's
`/api/health` returns **503 if any enrolled service is down**, and that endpoint is the
ALB's target health check against a single-instance ASG. Enrolling an unstable service
means a crash in portfolio-v6 takes down wmsfo, 3gixhub, lease-tracker, and
file-manager simultaneously. Flip it to `true` only after the service has been stable
in production for a while.

The gateway must be rebuilt and redeployed for this to take effect.

### 9.5 Launch template

Add two container blocks to the `bk-gateway-api-lt` user data, **before** the gateway
block (the gateway starts last by design). Add both names to the `docker rm -f` line.

```bash
docker pull $ECR/benkile/portfolio-v6-api:latest
docker run -d --restart=always --name portfolio-v6-api \
  --network app-net -p 3002:3002 \
  $ECR/benkile/portfolio-v6-api:latest

docker pull $ECR/benkile/portfolio-v6-api:dev
docker run -d --restart=always --name portfolio-v6-api-dev \
  --network app-net -p 4002:4002 \
  $ECR/benkile/portfolio-v6-api:dev
```

This creates a new launch template version and requires an instance refresh.

### 9.6 Vercel

Two projects, both on the existing `benkile.com` zone (Vercel is already the
nameserver, so `admin.benkile.com` is a single record).

| Project | Repo | Production domain | Preview |
|---|---|---|---|
| `portfolio-v6` | `portfolio-v6` | `v6.benkile.com` → `benkile.com` at cutover | per-branch |
| `portfolio-v6-admin` | `portfolio-v6-admin` | `admin.benkile.com` | per-branch |

**`benkile.com` stays pointed at the v5 site.** v6 is built and published on an interim
hostname (`v6.benkile.com`, or the Vercel-generated domain) and the apex is swapped over
in Vercel when the owner decides to retire v5 (§12). Nothing else in this spec depends
on which hostname the public site answers on.

Environment variables, scoped per Vercel environment (Production vs Preview):

**Public site**
```
VITE_API_BASE_URL = https://api.benkile.com/portfolio-v6-api        (prod)
                    https://api.benkile.com/portfolio-v6-api-dev    (preview)
```

**Admin**
```
VITE_API_BASE_URL          = …same as above per environment
VITE_COGNITO_USER_POOL_ID  = us-east-1_…                (prod vs dev pool)
VITE_COGNITO_CLIENT_ID     = …
VITE_COGNITO_REGION        = us-east-1
VITE_PUBLIC_SITE_URL       = https://v6.benkile.com     (preview iframe target — §7)
```

`VITE_PUBLIC_SITE_URL` points at whatever hostname the public site currently answers
on, and becomes `https://benkile.com` at cutover. It is the **only** value that has to
change when the apex is swapped.

Note the Vite conventions differ from CRA: the prefix is `VITE_`, access is
`import.meta.env.VITE_*`, and `process` does not exist at runtime — a stray
`process.env.X` is a `ReferenceError`, not `undefined`.

**SPA rewrite (both projects).** Client-side routing means a direct hit or refresh on
`/blog/some-post` must serve `index.html` rather than 404. In `vercel.json`:

```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

Without this, every deep link into the blog breaks — and deep links are the entire
point of having one.

The admin project should also have Vercel's deployment protection enabled as
defense in depth, and `robots.txt` set to `Disallow: /`.

### 9.7 Routing Middleware — blog metadata

The public site is a client-rendered SPA, so `/blog/some-post` returns an `index.html`
containing no title, description, or body until JavaScript runs. Search crawlers largely
execute JS; **social unfurlers (Open Graph, X cards, Slack, iMessage) do not**. Without
intervention, every shared post link previews with the site's generic metadata.

**Vercel Routing Middleware** injects per-post metadata into the HTML before it is
served. Note this is *not* a Next.js feature and does not require adopting a framework —
Vercel's docs state Routing Middleware works with any framework, including a static Vite
build. (The separate, now-deprecated "Edge Functions" product is unrelated; middleware is
current and runs on fluid compute.)

`middleware.ts` at the repo root of `portfolio-v6`:

1. Matcher scoped to `/blog/:slug` only — it must not execute on the home page, assets,
   or anything else.
2. Fetch `GET /api/posts/:slug` for `title`, `excerpt`, and `cover`.
3. Fetch the static `index.html`, inject `<title>` and the `og:` / `twitter:` tags into
   `<head>`, return the modified response.
4. On any API failure, return `index.html` untouched. Metadata is an enhancement; it must
   never be able to break the page.

```ts
export const config = {
  matcher: '/blog/:slug*',
  // runtime: 'nodejs',   // default is 'edge'
};
```

**Inject for all visitors, never conditionally on user agent.** Serving different content
to crawlers than to humans is cloaking, and search engines penalise it. The tags are
harmless in a normal browser.

Middleware runs *before* the cache, so it executes on every matched request. At portfolio
traffic this is irrelevant, and `/api/posts/:slug` is ETag-cached and cheap. If it ever
matters, cache the metadata response at the edge rather than adding infrastructure.

#### Cost

Not a meaningful expense. Vercel Hobby includes 1M edge requests, 1M function
invocations, 4 CPU-hours of active CPU, and 360 GB-hours of provisioned memory per month;
Pro includes 10M edge requests. Billing is on **active CPU**, and this middleware is
almost entirely I/O wait on a single fetch — which is not billed as active CPU. Scoped to
blog routes, a portfolio generates a few thousand invocations a month against a
million-invocation allowance.

The only cost consideration is which plan the project sits on, which this does not
change. Note that Hobby is nominally non-commercial use.

#### Rejected alternative

Build-time prerendering with a Vercel deploy hook fired on publish would produce static
per-post HTML and zero runtime invocations. It was rejected because it makes publishing a
post trigger a full site rebuild — turning an instant operation into a multi-minute one —
and couples the API outward to Vercel. Middleware keeps publishing instant and the
coupling one-directional.

---

## 10. Local development

Run the API locally against the **dev** database and **dev** Cognito pool. Do not
iterate by deploying — an API deploy triggers an ASG instance refresh that recycles all
containers on the shared host (~7 minutes, and it bounces every other application).
Deploy the dev container only when it needs to be reachable from a Vercel preview.

```
portfolio-v6-api      npm run dev       → localhost:3002, IS_LOCAL=true
portfolio-v6          npm run dev       → localhost:5173
portfolio-v6-admin    npm run dev       → localhost:5174
```

Both frontends use Vite's dev proxy rather than pointing at `localhost:3002` directly:

```ts
// vite.config.ts
server: {
  proxy: { "/api": { target: "http://localhost:3002", changeOrigin: true } },
}
```

`VITE_API_BASE_URL` is empty locally, requests are same-origin, and the dev server
mimics what the gateway does in production. This keeps local and deployed behavior
identical and means CORS is never in the local path. The API's `IS_LOCAL` CORS branch
remains as a fallback for direct access.

---

## 11. Deployment

### 11.1 API

`.github/workflows/deploy.yaml`, adapted from `portfolio-v5-api`:

- `main` → build → push `:latest` + `:<sha>` → cancel in-flight refresh → start
  instance refresh (Rolling, `MinHealthyPercentage: 100`, `InstanceWarmup: 400`)
- `dev` branch → build → push `:dev` only, **no instance refresh** (the dev container
  is picked up on the next boot; restart it manually over SSM if needed sooner)

Builds must be `linux/amd64,linux/arm64` via buildx — the host is `t4g.medium`
(arm64), and a default CI build produces amd64 only, which will not start.

### 11.2 Frontends

Vercel builds on push. `main` → production, other branches → preview URLs.

### 11.3 Migrations

Manual, before the API deploy that depends on them. Migrations must be additive and
backward-compatible with the currently-running container, since the old container keeps
serving during the ~7 minute refresh.

---

## 12. Build order

1. **Infrastructure** — request the ACM certificate for `media.benkile.com` /
   `media-dev.benkile.com` **first**: DNS validation has latency outside your control,
   and the distribution aliases later in this same step cannot be attached until it is
   issued. Then two databases + roles, two Cognito pools + clients + `admins` group +
   one user each, two S3 buckets with lifecycle rules, two CloudFront distributions +
   OACs + aliases + bucket policies, Vercel DNS records, two secrets, ECR repo.
2. **API skeleton** — port v5's `index.ts`/`getAppSecrets`/`getDBSecrets`/`db.ts`, add
   the JSON error handler, add `/api/health`. Deploy once to prove the pipeline.
3. **Gateway + launch template** — `serviceMap` entry, gateway redeploy, LT version,
   instance refresh. Confirm `api.benkile.com/portfolio-v6-api/api/health` answers.
4. **Migrations + schema** — six tables, Zod schemas for sections, items, and blocks,
   `/api/schema`.
5. **Admin auth + shell** — port `cognitoClient.ts` and the interceptors,
   `requireAdmin()`, login page, and the MUI app shell with the theme module (system
   detection, mode toggle — §14.4). Prove end-to-end auth before building any CRUD.
6. **Admin CRUD** — sections, items, reordering, and the `Link[]` editor.
7. **Media** — presigned upload + confirm, tagging, CDN URL resolution, bucket lifecycle
   rules, admin media library. Verify a CloudFront URL renders and that video Range/seek
   works at the edge before building the library UI on top of it.
8. **Publish** — validation, snapshot, `/api/content`, version history, and the
   post-publish GC pass (§6.9).
9. **Public site** — router, section components, registry, fetch and render. Styled
   per §14: plain semantic HTML, CSS Modules, tokens file.
10. **Preview** — preview token, `?preview=` handling in the public site, admin iframe.
11. **Blog** — `posts` CRUD, the block editor, `/api/posts`, the public `/blog` and
    `/blog/:slug` routes, code-block rendering with highlighting and copy, post preview,
    and the metadata middleware (§9.7).
    Deliberately after step 10: the block editor is the largest piece of admin UI in the
    project and it reuses the media picker (7), the publish validation pattern (8), the
    renderer registry (9), and preview (10). Building it earlier means building those
    four things twice.
12. **Live sections** — `/api/status` and `/api/now-playing` (Spotify app + one-time
    auth bootstrap — §4.6), the live-section fetch pattern, degraded-state rendering,
    and the `now_playing` poll-while-visible behavior.
13. **Content migration** — move v5's about/portfolio/skills/timeline rows and S3
    objects into the new model. Project links migrate mechanically:
    `url` → `{ type: 'prod', label: 'Live site' }`, `repo` → `{ type: 'repo', label: <repo name> }`.

Steps 2–3 first is deliberate: the deploy path and gateway routing are the parts most
likely to surprise, and they are cheapest to debug against a trivial service.

**Cutover is out of scope for this spec and owner-managed.** v6 ships to
`v6.benkile.com` and runs there indefinitely. When the owner decides to retire v5, the
apex domain is swapped in Vercel — a single change, plus updating
`VITE_PUBLIC_SITE_URL` (§9.6). v5's container, ECR repo, S3 bucket, database, and repos
are left untouched until then and retired separately. There is no coordinated cutover
event and nothing in v6 blocks on one.

---

## 13. Decisions recorded

| Decision | Rationale |
|---|---|
| Three repos, not a monorepo | Explicit requirement. The iframe preview (§7) removes the only strong argument for shared runtime code. |
| Section registry + JSONB, not fixed tables | "Add sections through the admin" requires instances to be data. |
| Snapshot publishing, not per-row status | Atomic publish, one-query public read, free rollback, trivial caching. |
| No `users` table | One class of user. Group claim on the ID token is sufficient. |
| New Cognito pools, not `file-manager-up` | `aws-jwt-verify` binds pool + client, so separate pools give cryptographic isolation. |
| Databases on existing `bk-db` | A second RDS instance doubles spend; the instance already multi-hosts. |
| Ports 3002 / 4002 | Only free ports following the `+1000` dev convention. |
| `includeInHealthCheck: false` initially | Gateway 503s on any enrolled failure, taking every service down with it. |
| CloudFront from day one; no `/api/media` | Media must never transit the shared `t4g.medium`. Removes v5's throughput ceiling entirely. |
| Public distribution, not signed URLs | Portfolio media is published public content. Signing adds a round-trip before first paint and cannot coexist with immutable ETag-cached snapshots (§6.1). |
| Immutable UUID keys + 1-year `max-age` | No invalidations, ever. Replacing media is a new key, not a cache purge. |
| Draft media bounded by lifecycle, not access control | Owner decision. Unpublished media is deleted rather than gated (§6.4, §6.9). |
| Abandoned uploads expire via S3 tag lifecycle | Self-cleaning with zero application code; the confirm step removes the tag. |
| Orphan GC runs after each publish | Publishing is what prunes versions and creates orphans. No cron, Lambda, or EventBridge added. |
| 30-day grace + 7-day tagged undo window | Protects work in progress; makes media deletion reversible for a week. |
| `s3_key` in the document, URL resolved at read time | Keeps snapshots domain-agnostic; a distribution can be rebuilt without touching stored media references. |
| `media.benkile.com` custom alias | Stable hostname decoupled from any specific distribution. Requires an ACM cert in us-east-1. |
| v5 animated header dropped, not ported | Owner decision. Removes jQuery from the project entirely; `hero` survives as a static section type. |
| Dev container retained (`:dev` on 4002) | Owner decision. Needed so Vercel preview deployments can reach a non-production API. |
| 50 published versions retained | Owner decision. Ample for rollback at this scale. |
| Cutover owner-managed, not spec'd | v6 ships to `v6.benkile.com`; the apex is swapped in Vercel whenever v5 is retired. No coordinated cutover event. |
| `Link[]` replaces `url`/`repo` scalars | A project can span five repos plus dev and prod deployments. Required `label` is what makes five `repo` links distinguishable. |
| Posts use draft/published columns, not snapshots | A post is a single row — already atomic, already a one-query read. Snapshotting would add a table and a second publishing mechanism for rollback alone. |
| Post bodies are typed block arrays, not markdown or HTML | Code blocks are first-class objects with a `language` field. Storing HTML would put sanitization in the render path. |
| Live sections (`status`, `blog`, `now_playing`) fetch at runtime | Their data is time-varying and cannot sit in an immutable ETag-cached snapshot. |
| `now_playing` proxies Spotify server-side, never from the browser | The refresh token stays in Secrets Manager; the ~30s cache caps Spotify at ~2 req/min regardless of traffic; the exposed shape is a deliberate choice (§4.6). |
| Album art hotlinked from Spotify's CDN | Ephemeral licensed content stays out of the media pipeline; Spotify serves it and its terms require linking back. The only non-`media.benkile.com` image on the site. |
| Post block bodies saved wholesale | Ordering, insertion, and deletion stay array operations instead of nine more endpoints. |
| Client-side syntax highlighting | Keeps the API free of rendering concerns and `code` raw; avoids republishing every post on a theme change. |
| Routing Middleware for post metadata, not prerendering | Keeps publishing instant and the API→Vercel coupling absent. Works on a static Vite build; no framework adoption. |
| Restore resets the working set, discarding unpublished edits | Live site and draft must agree after a restore; otherwise the next publish silently reverts it. The admin UI warns before invoking (§4.2). |
| Preview-serialization routes accept the preview token | The public site renders previews and has no Cognito SDK by design; `requireAdmin()` alone would be unsatisfiable there (§4.2, §7). |
| Optimistic concurrency via required `expected_updated_at` | Wholesale writes from two tabs would silently clobber each other; 409 + refetch is the cheapest correct answer for a single-admin system (§4.5). |
| Public-site v1 UI is plain semantic HTML + minimal CSS, no component library | Owner decision. The v1 deliverable there is a functional UI, not polish; the future restyle lands on the public site (§14). |
| Public-site styling contained to CSS Modules + one tokens file | Makes the future restyle a mechanical leaf-file swap — markup replaced, `*.module.css` deleted, tokens mapped (§14.3). |
| Admin is MUI, fully themed, fully built in v1 | Owner decision. Audience of one and no restyle planned — an interim plain admin would mean building it twice (§8.3, §14.4). |
| Admin reorder is drag-and-drop | The full-array `PUT` (§4.2) was designed for it; the admin is built once, so no up/down-button interim (§14.4). |

---

## 14. Design & styling — v1

**The two frontends get opposite treatments, deliberately.**

- **The public site ships plain semantic HTML with minimal CSS.** No component
  library, no CSS framework, no CSS-in-JS. Its v1 deliverable is a *functional* UI —
  every feature works and is usable, none of it is polished. The "operations-console
  aesthetic" previously floated is a future restyle, not part of v1, and nothing in v1
  should anticipate it. What matters is not how it looks but how cheaply its styling
  can be replaced; §14.1–14.3 exist so the restyle is a mechanical swap, not an
  excavation.
- **The admin is built once, fully, on MUI** — themed, complete, and *not* part of any
  future restyle (§14.4). It has an audience of one and no design direction pending,
  so shipping an interim plain version would mean building it twice.

The containment rules below apply to the **public site only**.

### 14.1 Containment rules (public site)

1. **Markup is semantic HTML.** `<button>`, `<nav>`, `<form>`, `<label>` — native
   elements throughout. A future library replaces these element-for-component;
   nothing needs untangling first.
2. **All appearance lives in co-located CSS Modules** — `HeroSection.tsx` sits next to
   `HeroSection.module.css`. CSS Modules are built into Vite (zero new dependencies),
   and the scoping is the point: deleting any component's stylesheet can never break
   another component. Removing v1's look *is* deleting the `*.module.css` files.
3. **One global stylesheet**, `src/styles/global.css`: a reset plus design tokens as
   CSS custom properties (`--color-*`, `--space-*`, `--font-*`). Component styles
   reference tokens, never literal values, so what little theming v1 has lives in one
   file.
4. **No inline styles** except genuinely dynamic values (a computed transform, a
   progress width). No styling logic in TSX — components emit class names only.
5. **Do not grow a bespoke design system.** No `ui/` directory of styled wrappers —
   that is building the thing the future library replaces. If a pattern genuinely
   repeats (a confirm dialog, a form row), a trivial shared component is fine and
   becomes a natural swap point later; its job is markup reuse, not visual ambition.

### 14.2 What "functional" means (public site)

- A readable centered column: `max-width`, system font stack, sensible whitespace from
  the tokens file. Essentially the no-stylesheet look, tidied.
- Fluid media (`max-width: 100%`) and single-column flow are the entire responsive
  strategy. No breakpoint system.
- No animations, no transitions, no dark mode, no custom fonts. (All of this applies
  to the public site only — the admin *is* themed, including dark mode; §14.4.)
- The accessibility floor comes free with the rules above: native controls, real
  labels, `alt` text (already modelled — `media_assets.alt`), browser-default focus
  states left intact.
- Two things that look like polish but are **not** cut, because they are content
  rendering and correctness rather than chrome: code-block highlighting with the copy
  control (§3.7), and live-section loading/degraded states (§3.5).

### 14.3 The later swap (public site)

Restyling the public site touches exactly three kinds of file: leaf component markup
(`sections/`, `blocks/`, `pages/`), the `*.module.css` files (deleted), and the tokens
file (mapped onto whatever replaces it — a component library's theme or a real design
system). The registries (§3.4, §3.7) already fence rendering into leaf components, and
nothing outside those leaves encodes appearance — documents store content (§3.2),
media URLs resolve at read time (§6.8), and the API has no rendering concerns at all.
The swap is wide but shallow, which is the tolerable kind. The admin is untouched by
it.

### 14.4 The admin: MUI, themed, final

The admin uses **MUI** (consistent with `FileManager`) and is **fully built out in
phase 1** — the section editors, block editor, media library, and version history ship
as complete MUI implementations, not placeholders awaiting a restyle. There is no
sense building that part twice.

- **One theme module.** Light and dark palettes defined together. Mode follows the
  system by default (`prefers-color-scheme` detection), with a manual
  light / dark / system toggle persisted in `localStorage`; `CssBaseline` applies it
  globally.
- **Styling goes through the theme.** Palette, spacing, and typography come from the
  theme object; per-component tweaks use `sx`. No parallel CSS files in the admin —
  MUI is the styling system there, which is its own form of containment.
- **Reorder is drag-and-drop.** The full-array `PUT` (§4.2) was designed for exactly
  this, and with the admin built once there is no reason to ship an up/down-button
  interim.

---

## 15. Open questions

None. Design was the last one; resolved in §14.

### Resolved

| # | Question | Resolution |
|---|---|---|
| — | Blog SEO | **Vercel Routing Middleware** injects per-post OG/Twitter tags on `/blog/:slug` (§9.7). No framework change; effectively zero cost. |
| — | Draft media privacy | **Not a requirement.** Unlisted-UUID stands; the concern is lifecycle instead — unpublished media expires and is cleaned out of S3 (§6.9). |
| — | Hero animation | **Dropped.** `HeaderBackgroundLogic.js` and jQuery are not ported. `hero` remains a static section type (§3.4). |
| — | Version retention | **50.** As specified in §3.3. |
| — | Cutover strategy | **Owner-managed.** v6 ships to `v6.benkile.com`; apex swapped in Vercel when v5 is retired (§12). |
| — | Dev container needed? | **Yes.** `portfolio-v6-api-dev` on 4002 is permanent, along with the dev pool, database, bucket, distribution, and secret. |
| — | Design/theming | **Split by frontend (§14).** Public site: plain HTML + minimal CSS under containment rules; restyle later. Admin: fully themed MUI (system theme detection, dark mode), built out completely in v1 (§14.4). |
