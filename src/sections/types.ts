import type { MediaMap, Section } from '../types/content';
import type { SkillsById } from '../lib/skillsIndex';

/**
 * The props every section component receives. `ContentPage` maps the published
 * document's sections through `SECTION_REGISTRY` (spec §3.4), passing each
 * section plus the document-level media map so components can resolve their
 * `media_id` references to CDN URLs (§6.8).
 *
 * Live sections (`status`, `blog`, `now_playing`) accept the same props but
 * ignore them — their data is fetched at runtime, not read from the snapshot.
 */
export interface SectionProps {
  section: Section;
  media: MediaMap;
  /**
   * A document-wide index of every `skills` item by id (Skill Refs v1.8), built
   * from ALL `skills` sections on ALL pages of the document and threaded down from
   * `ContentPage` (both the live and preview paths). The portfolio resolves each
   * `skill_refs` id here to render the referenced skill's theme-aware icon + title
   * so portfolio marks and the skills sphere never diverge. Optional: sections
   * that don't reference skills ignore it, and a document that predates it renders
   * the legacy `tech_icons` path rather than crashing.
   */
  skillsById?: SkillsById;
  /**
   * The `language` field of the document's `duolingo` section (spec §3.5, v1.2),
   * or `undefined` when no `duolingo` section is published. Threaded from
   * `ContentPage` so the hero-strip Duolingo item and the standalone
   * `DuolingoSection` can share ONE `/api/duolingo?language=…` fetch (a page
   * with both must only hit the endpoint once). Absent → the strip item falls
   * back to the same `es` default the section uses.
   */
  duolingoLanguage?: string;
}
