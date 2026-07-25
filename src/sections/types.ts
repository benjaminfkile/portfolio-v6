import type { MediaMap, Section } from '../types/content';

/**
 * The props every section component receives. `HomePage` maps the published
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
}
