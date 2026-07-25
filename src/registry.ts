import type { ComponentType } from 'react';
import type { SectionType } from './types/content';
import type { SectionProps } from './sections/types';

import HeroSection from './sections/HeroSection';
import AboutSection from './sections/AboutSection';
import TimelineSection from './sections/TimelineSection';
import SkillsSection from './sections/SkillsSection';
import PortfolioSection from './sections/PortfolioSection';
import StatusSection from './sections/StatusSection';
import BlogSection from './sections/BlogSection';
import NowPlayingSection from './sections/NowPlayingSection';
import ContactSection from './sections/ContactSection';

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
