import type { ComponentType } from 'react';
import type { SectionType, BlockType } from './types/content';
import type { SectionProps } from './sections/types';
import type { BlockProps } from './blocks/types';

import HeroSection from './sections/HeroSection';
import AboutSection from './sections/AboutSection';
import TimelineSection from './sections/TimelineSection';
import SkillsSection from './sections/SkillsSection';
import PortfolioSection from './sections/PortfolioSection';
import StatusSection from './sections/StatusSection';
import BlogSection from './sections/BlogSection';
import NowPlayingSection from './sections/NowPlayingSection';
import ContactSection from './sections/ContactSection';

import HeadingBlock from './blocks/HeadingBlock';
import ParagraphBlock from './blocks/ParagraphBlock';
import CodeBlock from './blocks/CodeBlock';
import MediaBlock from './blocks/MediaBlock';
import ListBlock from './blocks/ListBlock';
import QuoteBlock from './blocks/QuoteBlock';
import LinksBlock from './blocks/LinksBlock';
import DividerBlock from './blocks/DividerBlock';

/**
 * The section registry (spec §3.4): every `sections.type` maps to the component
 * that renders it. `HomePage` maps the published document's sections through
 * this table; an unknown `type` renders nothing and logs (see `HomePage`), so
 * publishing a section type that a not-yet-deployed public site doesn't
 * recognise degrades rather than crashes.
 *
 * `satisfies Record<SectionType, …>` makes the table exhaustive at compile time:
 * adding a `SectionType` without a component here is a build error.
 *
 * `status`, `blog`, and `now_playing` are live sections (§3.5) whose components
 * are registered as placeholders for now — the next task fills them in.
 */
export const SECTION_REGISTRY = {
  hero: HeroSection,
  about: AboutSection,
  timeline: TimelineSection,
  skills: SkillsSection,
  portfolio: PortfolioSection,
  status: StatusSection,
  blog: BlogSection,
  now_playing: NowPlayingSection,
  contact: ContactSection,
} satisfies Record<SectionType, ComponentType<SectionProps>>;

/**
 * The block registry (spec §3.7): every block `type` maps to the component that
 * renders it, mirroring `SECTION_REGISTRY` one level down. `BlockRenderer` maps
 * a post body through this table; an unknown `type` renders nothing and logs
 * (see `BlockRenderer`), so a post authored against a block type a not-yet-
 * deployed public site doesn't recognise degrades rather than crashes.
 *
 * `satisfies Record<BlockType, …>` makes the table exhaustive at compile time:
 * adding a `BlockType` without a component here is a build error.
 */
export const BLOCK_REGISTRY = {
  heading: HeadingBlock,
  paragraph: ParagraphBlock,
  code: CodeBlock,
  media: MediaBlock,
  list: ListBlock,
  quote: QuoteBlock,
  links: LinksBlock,
  divider: DividerBlock,
} satisfies Record<BlockType, ComponentType<BlockProps>>;
