# benkile.com — Design System: "Control Room"

**Status:** Approved direction (2026-08-02) · governs the §14 restyle of the PUBLIC site only
**Companion to:** TECH_SPEC_V1.md (content model, §14 restyle constraints). The admin stays MUI.

## 1. Identity

The site presents as a quietly humming operations console. Its differentiator — the page
is a **live, running system** (now-playing, service status, published version) — is the
aesthetic: live values read like instruments on a panel. Amber like hardware indicator
LEDs, data in monospace, prose in a humanist sans. Dark-native; the light theme is the
same console in a lit room, **not** an inversion.

Tone words: *instrumented, engineered, calm, warm-metal*.
Anti-goals: hacker-terminal clichés (green-on-black phosphor, scanlines, glitch effects),
dashboard clutter, template-portfolio look.

## 2. Tokens

All tokens are CSS custom properties in `src/styles/tokens.css`, defined on `:root`
(dark, the native theme) and overridden under `:root[data-theme="light"]`. Theme is
toggled by stamping `data-theme` on `<html>`; default follows `prefers-color-scheme`
via a tiny inline script (no flash of wrong theme). Components consume tokens only —
never raw hex.

### 2.1 Color — dark (native)

| Token | Value | Role |
|---|---|---|
| `--ground` | `#0B0E14` | page background (blue-black, never pure black) |
| `--panel` | `#12161F` | cards, instrument panels |
| `--panel-2` | `#171C28` | raised/hover panel |
| `--line` | `#1E2532` | borders, rules |
| `--grid` | `rgba(120,140,175,0.07)` | faint plotting grid on the ground |
| `--text` | `#C9D2E0` | body text |
| `--text-bright` | `#EDF1F7` | headings |
| `--text-dim` | `#7A8598` | secondary text, labels |
| `--amber` | `#E8A33D` | THE accent: live values, active nav, links, meters |
| `--amber-soft` | `rgba(232,163,61,0.14)` | accent washes/glows |
| `--ok` | `#4FCB8D` | status good (semantic, not an accent) |
| `--warn` | `#E0B341` | status degraded |
| `--err` | `#E06056` | status down |

### 2.2 Color — light ("console in a lit room")

| Token | Value |
|---|---|
| `--ground` | `#F2F4F7` (cool paper, slight blue bias) |
| `--panel` | `#FFFFFF` |
| `--panel-2` | `#F7F9FC` |
| `--line` | `#DCE1EA` |
| `--grid` | `rgba(70,90,130,0.06)` |
| `--text` | `#333B47` |
| `--text-bright` | `#151A22` |
| `--text-dim` | `#636C79` (darkened from `#69727F`, which fell to 4.42:1 on `--ground`) |
| `--amber` | `#9A5F0E` (darkened from `#B87514`, which was only 3.75:1 on `--panel`; now ≥4.5:1 on `--panel` and `--ground`) |
| `--amber-soft` | `rgba(154,95,14,0.12)` |
| `--ok` / `--warn` / `--err` | `#1F8F5F` / `#9A7B12` / `#C24A40` |

Contrast floor: WCAG AA (4.5:1 body, 3:1 large text/UI) in BOTH themes — verify,
don't eyeball. Enforced by `src/styles/tokens.contrast.test.ts`, which parses
this token set and fails the build if any pair regresses below its floor.

### 2.3 Type

Self-hosted via pinned `@fontsource` packages (no font CDN):

- **Prose/display:** IBM Plex Sans — weights 400, 500, 600.
- **Data/labels:** IBM Plex Mono — weights 400, 500. Used for: every live value,
  timestamps, tags, nav meta, section eyebrows, figure-ish labels. Mono is the
  "instrument voice" — if a value came from the API at runtime, it is mono.

Scale (rem, mobile → desktop via `clamp()`): 13 label · 15 body-s · 17 body ·
20 h4 · 24 h3 · 30 h2 · 38–52 h1. Line-height 1.55 prose, 1.15 headings.
Headings `text-wrap: balance`. Uppercase labels get `letter-spacing: 0.12em`.
Numbers that update live get `font-variant-numeric: tabular-nums`.

### 2.4 Space, radius, elevation

- Spacing scale: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 72 px as `--space-1..8`.
- Radius: `--r-s: 6px` (chips, tags), `--r-m: 10px` (panels). Nothing rounder.
- No drop shadows in dark (elevation = `--panel-2` + border). Light theme may use
  one soft shadow token `--shadow: 0 1px 3px rgba(21,26,34,0.08)`.
- The ground carries the faint 28px plotting grid (two linear-gradients) on
  desktop; reduce to invisible or 40px at <640px so small screens stay calm.

## 3. Layout & responsiveness

**Mobile-first is a hard requirement.** Base styles are the single-column phone
layout; wider layouts are added at `min-width` breakpoints: 640 / 900 / 1200.
Content column max 1100px, centered, 20px side padding (32px ≥900).

- Nav: top bar. ≥900px: brand left, page links center-left, live status dot +
  theme toggle right. <900px: brand + status dot + hamburger opening a full-screen
  overlay menu (focus-trapped, `Esc`/backdrop closes).
- Touch targets ≥44px. No hover-only affordances — anything hover reveals must
  also be visible or reachable on touch.
- The page body NEVER scrolls horizontally; wide content scrolls inside its own
  `overflow-x: auto` container.

## 4. Primitives — `src/components/ui/`

Each = one component + one CSS Module, tokens only, zero dependencies:

| Primitive | Notes |
|---|---|
| `SectionShell` | eyebrow (mono, amber, uppercase) + heading + intro + consistent vertical rhythm; every section renders inside one |
| `Panel` | bordered `--panel` surface, `--r-m`; `raised` variant |
| `Instrument` | small labeled readout (mono label + value line) — the signature element; used by status, now-playing, hero strip |
| `StatusDot` | 7px dot + soft glow; `ok/warn/err` variants; pulse animation (2s) honoring reduced-motion |
| `Meter` | 4px track + amber fill; used by the now-playing progress bar; animates width on first reveal |
| `TagChip` | mono, bordered, `--r-s`; tech tags and links |
| `LinkButton` | text link and button-shaped variants; amber; visible `:focus-visible` ring (`2px` amber outline, offset 2) |
| `MediaFrame` | image/video wrapper: border, radius, `aspect-ratio` box, lazy loading, `object-fit: cover` |
| `Ticker` (optional) | marquee row for dense live data; paused when `prefers-reduced-motion` |
| `Gauge` | SVG arc gauge: `--line` track, amber sweep, big tabular-nums value + unit, mono label; sweep animates on first reveal, renders static under reduced-motion |
| `AreaChart` | hand-rolled SVG time series (NO chart library): amber 1.5px line + `--amber-soft` fill, faint horizontal grid (3–4 rules, `--line`), emphasized latest point (amber dot), min/max mono labels only — no axis clutter; multi-series uses amber + `--text-dim` strokes |
| `StatBlock` | big tabular-nums value + unit + mono label, optional small delta line |

Chart rules (all three): values in mono `tabular-nums`; charts are decorative to a
screen reader — `aria-hidden` on the SVG with a visually-hidden one-sentence text
summary alongside; container queries/width-aware `viewBox` so they scale, never
overflow; no tooltips in v1 (latest + min/max labels carry the information).

## 5. Section treatments (public sections, §3.4)

- **hero** — tag line in mono amber (`// software developer`), display headline,
  short intro; below it an **instrument strip**: NOW PLAYING · API · SITE vN —
  three `Instrument`s fed by the live endpoints + document version.
- **about** — prose panel, 62ch measure; optional inline mono annotations.
- **timeline** — vertical rail with amber node dots; date ranges in mono; media
  thumbnails in `MediaFrame` (hidden <640px if cramped).
- **skills** (v1.9, the **Skills Console**) — a three-panel Control Room
  instrument: a skill **list** (left), the geodesic **sphere** (centre), and a
  **detail** readout (right), joined by a connective **bus**. At ≥900px it is a
  CSS grid — list (~240px) | sphere (flexible) | detail (~320px) — stretched to
  EQUAL HEIGHT (the sphere drives the row, `min-height` ~480px; the list and
  detail take `overflow-y: auto` inside so equal height always holds). Below
  900px the panels stack sphere → list → detail (the list wraps chip-style;
  tap = lock toggle) and the bus is not drawn.
  - **List** — one instrument-styled button per skill (`SkillIcon` + title, mono,
    section item order) in a `<ul>`. Hover/focus PREVIEWS the skill; click /
    Enter / Space LOCKS it (a latched, checkable selection — `aria-pressed`, amber
    `StatusDot`). Exactly one skill locks at a time (locking another moves the
    lock; clicking the locked one unlocks); the lock survives mouse-out so the
    detail text can be scrolled. Visible focus rings; the list scrolls inside the
    shared height.
  - **Sphere** — the v1.5 geodesic sphere unchanged in look: a solid faceted
    `IcosahedronGeometry` with a `--panel-2` albedo, flat-shaded matte under one
    fixed key light + low ambient (a fully-lit facet renders at its own
    `--panel-2` colour), opaque (the far hemisphere is occluded), wireframe edges
    in the plotting-grid colour (`--grid`, alpha as material opacity), one skill
    icon lying flat on a triangular face (incircle-sized tile on an
    albedo-matched, same-material lit disc; oriented to the face normal;
    far-side tiles back-face culled; each rolls around its normal per-frame so the
    glyph stays screen-upright), on a bordered `--panel` card (`--r-m`). Slow
    auto-rotate and free quaternion-trackball drag as before, PLUS
    rotate-to-target: a `focusSkillId` (the previewed skill, else the locked one)
    slerps the group (~600ms, eased) so that tile faces the camera (+Z) and HOLDS
    it there (auto-spin + drag paused) until the focus clears, then auto-spin
    resumes from the current orientation. Tile hover previews / tile click locks
    (synced with the list + detail); a hovered tile still shows its title tooltip
    in the mono voice. Sphere density comes from `sphere_detail` (0–4); absent =
    auto-fit. The canvas is decorative (`aria-hidden`) with a visually-hidden
    title list alongside. Where WebGL is unavailable (older browsers, jsdom) it
    degrades to the interactive chip grid — no rotation, but hover previews, click
    locks, and the previewed/locked chip gets a highlighted state.
  - **Detail** — the previewed skill, else the locked skill, else an
    instrument-voice empty state (`STANDBY — hover or lock a skill`, the NO SIGNAL
    family). A mono `SkillIcon` + title header over the skill `description` as
    body prose; `aria-live="polite"` so screen readers hear preview changes
    without spam; `overflow-y: auto` inside the shared height with the scroll
    region keyboard-focusable (visible ring) so a locked skill's long description
    is reachable by keyboard.
  - **Bus** — a thin connective line with connection nodes linking the three
    panels, drawn with tokens (`--line` base, amber pulse); ≥900px only. On every
    preview-target change and lock toggle one short packet travels left → centre →
    right once (~700ms, eased, amber) and stops — never looping; rapid
    re-triggers restart it cleanly (the packet remounts, no queue). Decorative
    (`aria-hidden`, never a focus stop).
  - **Motion / a11y** — `prefers-reduced-motion`: the sphere snaps to the focus
    target with no tween (the `demand` frameloop honored), the bus fires no packet
    (the line stays static decoration), and the auto-spin stays off. Icons are
    theme-aware (Icons v1.6): an optional `icon_source_dark` override is used in
    the dark theme (falling back to `icon_source`), the light theme always uses
    `icon_source`; the sphere re-rasterizes the tile texture on theme toggle via
    the token observer, the CSS icons swap variants with CSS only. Group labels in
    mono.
- **portfolio** — project panels: `MediaFrame` (video autoplays muted/loop ONLY
  if reduced-motion off; tap-to-play on touch), title, intro, `TagChip` tech
  icons row, links. ≥900px: media left / text right alternating; <900px stacked.
- **status** — a panel of `Instrument`s with `StatusDot`s per service + response
  times in mono tabular-nums.
- **now_playing** — `Instrument` with album art in a small `MediaFrame`, track/
  artist, live progress bar (thin amber `Meter` that creeps); idle state per
  section config. Poll ~30s, matching the API cache.
- **blog** (teaser) — list of post panels: mono date, title, excerpt.
- **duolingo** — an `Instrument` pair: STREAK (mono amber count + day label) and the
  course readout (title, XP in tabular-nums; crowns small in --text-dim). The manual
  `score_label`, when configured, renders as a `TagChip` — visually distinct from
  live values, which are always mono. Degrades to nothing.
- **github** — contribution calendar as an amber heat grid: 5-step ramp from
  `--panel-2` through `--amber-soft` to `--amber`; cell 10–12px, 3px gap, `--r-s`
  minus; total contributions as a mono `Instrument` above. The grid lives in its own
  `overflow-x: auto` container — on phones it scrolls horizontally (or the section
  config narrows the weeks), the page never does. One accessible summary sentence
  (visually hidden) instead of 365 labeled cells.
- **contact** — closing panel: heading, `LinkButton`s row.
- **ops** — the flagship Control Room page, a **daily flight-recorder replay**
  (v1.7): `GET /api/ops` returns one immutable report per UTC day (built once,
  server-side, from the *curated* public dashboard — day-delayed by design, no
  live feedback loop), replayed entirely client-side; no polling. A responsive
  grid of `Panel`s (1-col base → 2-col ≥900 → 3-col ≥1200), each a mono widget
  title over a `Gauge` (utilization-kind) or `AreaChart` (everything else); every
  series spans the FULL UTC day at a fixed 5-minute grain (288 points). A
  draggable **playhead** `Scrubber` (mouse + touch + keyboard arrows/Page/Home/End,
  ≥44px target, focus-visible ring, §7) selects a moment: the `Gauge`/`StatBlock`
  readouts show the value there and the `AreaChart`s draw a cursor line at it.
  Times along the scrubber and readouts are the VIEWER's local zone; a mono strip
  labels the window honestly ("24h ending <local datetime of 00:00 UTC>" — it
  spans two local calendar days for most viewers) alongside `report_date` +
  `generated_at` and a `StatusDot`. No auto-play in v1 (any easing honors
  `prefers-reduced-motion`). No report yet (API 404) → a calm placeholder panel;
  missing datapoints within the day render as gaps, never zeros.
- **404 / empty states** — instrument voice: mono `NO SIGNAL` label + plain link home.

## 6. Motion

Instrument behaviors only; one orchestrated moment, everything else micro:

- Page-load: hero elements fade/rise 12px, staggered 60ms; instrument values
  "tick in" once. No scroll-triggered theatrics elsewhere.
- StatusDot pulse; now-playing progress creep; Meter fill on first view
  (IntersectionObserver, once).
- Hovers: border brightens to amber-soft wash, 120ms ease-out. Nothing moves >2px.
- `prefers-reduced-motion: reduce` disables ALL of the above (dot static, meters
  render filled, autoplay videos become poster + play button).

## 7. Accessibility

Semantic landmarks (`header/nav/main/footer`), one `h1` per page, skip-to-content
link, `:focus-visible` rings everywhere interactive, alt text from the media map,
`aria-live="polite"` on the now-playing instrument, color never the only carrier
of status (dot + text label). Keyboard-complete nav overlay.

## 8. File structure & rules

```
src/styles/tokens.css      # all custom properties, both themes
src/styles/global.css      # reset, base type, ground grid, theme script hook
src/components/ui/*        # primitives above (Component.tsx + Component.module.css)
src/components/ThemeToggle.tsx
```

Rules: CSS Modules only; no styling libraries; no inline style objects except
dynamic values (meter %, progress); tokens only — a raw hex in a module is a
review failure; every component works in both themes and at 320px width.
