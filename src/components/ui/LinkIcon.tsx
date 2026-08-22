import type { SVGProps } from 'react';
import type { LinkType } from '../../types/content';
import styles from './LinkIcon.module.css';

/**
 * Per-link-type inline SVG glyph. Portfolio link chips carry a `type` (spec §3.4)
 * that says what the link points at — a repo, docs, a package, etc. The chip's
 * text label still says WHICH one; the icon is a quick shape cue for the KIND.
 *
 * Icons are hand-drawn minimal paths consistent with the site's design language
 * (DESIGN.md): stroke/fill via `currentColor` so they inherit the chip's text
 * colour and work in both themes without extra CSS; sized to the chip's
 * line-height (`1em` box); `aria-hidden` — the chip label carries the meaning,
 * the icon adds no new a11y noise. GitHub is the one recognizable brand shape
 * (the standard silhouette rendered as an inline path).
 *
 * Reusable over the full {@link LinkType} union so the same component can be
 * dropped anywhere links are rendered; only the portfolio wires it up today.
 */
export interface LinkIconProps extends Omit<SVGProps<SVGSVGElement>, 'type'> {
  type: LinkType;
}

function IconRepo(props: SVGProps<SVGSVGElement>) {
  // GitHub Octocat mark — the one recognizable brand shape allowed here
  // (DESIGN.md), rendered as a single filled path so it inherits currentColor.
  return (
    <svg viewBox="0 0 16 16" {...props}>
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
      />
    </svg>
  );
}

function IconDocs(props: SVGProps<SVGSVGElement>) {
  // A document with folded corner and text rules — the "docs / book" cue.
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 1.75h5.5L13 5.25V14a.5.5 0 0 1-.5.5h-8.5A.5.5 0 0 1 3.5 14V2.25A.5.5 0 0 1 4 1.75Z" />
      <path d="M9.5 1.75V5.25H13" />
      <path d="M5.75 8.5h5" />
      <path d="M5.75 11h4" />
    </svg>
  );
}

function IconPackage(props: SVGProps<SVGSVGElement>) {
  // An isometric-ish box with a lid seam and a strap — the "package" cue.
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M8 1.75 2.25 4.75v6.5L8 14.25l5.75-3V4.75Z" />
      <path d="M2.25 4.75 8 7.75l5.75-3" />
      <path d="M8 7.75v6.5" />
      <path d="M5.1 3.25 10.9 6.25" />
    </svg>
  );
}

function IconArticle(props: SVGProps<SVGSVGElement>) {
  // A folded newspaper sheet with column rules — the "article" cue.
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M2.25 3.5h9.5v9.25a.75.75 0 0 1-.75.75h-8A.75.75 0 0 1 2.25 12.75Z" />
      <path d="M11.75 6h1.5a.5.5 0 0 1 .5.5v6a1 1 0 0 1-1 1" />
      <path d="M4.5 6h5" />
      <path d="M4.5 8.5h5" />
      <path d="M4.5 11h3" />
    </svg>
  );
}

function IconDemo(props: SVGProps<SVGSVGElement>) {
  // A play triangle in a rounded square — the "demo / video" cue.
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="1.75" y="1.75" width="12.5" height="12.5" rx="2" />
      <path d="M6.75 5.5 11 8 6.75 10.5Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconExternal(props: SVGProps<SVGSVGElement>) {
  // Arrow leaving a box — the canonical "external / other" cue. Also used
  // as the subtle glyph on prod/dev chips (their emphasis carries the weight;
  // the arrow just confirms it opens off-site).
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M6 2.75H3a.75.75 0 0 0-.75.75v9.5a.75.75 0 0 0 .75.75h9.5a.75.75 0 0 0 .75-.75v-3" />
      <path d="M9.5 2.75h3.75V6.5" />
      <path d="m8 8 5.25-5.25" />
    </svg>
  );
}

// Contact channels (2026-08-22). Rendered by SiteFooter's contact row. The
// three social marks are the published single-path brand glyphs; phone and
// email are simple strokes. All currentColor, so they follow the theme.
function IconPhone(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M5.5 3h3l1.5 4-2 1.5a12 12 0 0 0 7.5 7.5L17 14l4 1.5v3a2 2 0 0 1-2 2A16 16 0 0 1 3.5 5a2 2 0 0 1 2-2z" />
    </svg>
  );
}

function IconEmail(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <path d="m3.5 7 8.5 6 8.5-6" />
    </svg>
  );
}

function IconLinkedIn(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

function IconInstagram(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="0.6" fill="currentColor" />
    </svg>
  );
}

function IconFacebook(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

const ICONS: Record<LinkType, (props: SVGProps<SVGSVGElement>) => JSX.Element> = {
  repo: IconRepo,
  prod: IconExternal,
  dev: IconExternal,
  docs: IconDocs,
  demo: IconDemo,
  package: IconPackage,
  article: IconArticle,
  phone: IconPhone,
  email: IconEmail,
  linkedin: IconLinkedIn,
  instagram: IconInstagram,
  facebook: IconFacebook,
  other: IconExternal,
};

/**
 * LinkIcon — a per-link-type inline SVG glyph. Sized to the chip's line-height
 * (1em box) and coloured via `currentColor`, so it inherits chip text colour in
 * both themes with no extra styling. Decorative — the chip label carries the
 * meaning, so the SVG is `aria-hidden` and never a focus stop.
 */
export default function LinkIcon({ type, className, ...rest }: LinkIconProps) {
  const Glyph = ICONS[type];
  const classes = className ? `${styles.icon} ${className}` : styles.icon;
  return (
    <Glyph
      className={classes}
      width="1em"
      height="1em"
      aria-hidden="true"
      focusable="false"
      {...rest}
    />
  );
}
