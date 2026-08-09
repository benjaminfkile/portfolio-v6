import type { ContentDocument, SkillsItem } from '../types/content';

/**
 * A document-wide index of every `skills` item by its id (Skill Refs v1.8).
 * Portfolio items reference skills by id (`skill_refs`); this map is how a
 * portfolio section — possibly on a different page from the skills it references
 * — resolves each id to the skill's title + theme-aware icon so the two never
 * show mismatched glyphs.
 */
export type SkillsById = Record<string, SkillsItem>;

/**
 * Build the {@link SkillsById} index across ALL `skills` sections on ALL pages of
 * a published document (Skill Refs v1.8). A `skill_refs` id may point at a skill
 * on any page, so the index spans the whole document, not one page.
 *
 * Ids are globally unique per document; on the vanishingly unlikely collision the
 * last occurrence wins (document order). Tolerant of a partial payload — missing
 * `pages`, `sections`, or `items` degrade to an empty index rather than throwing.
 */
export function buildSkillsIndex(document: ContentDocument): SkillsById {
  const index: SkillsById = {};
  for (const page of document.pages ?? []) {
    for (const section of page.sections ?? []) {
      if (section.type !== 'skills') continue;
      for (const item of section.items ?? []) {
        index[item.id] = item.data as SkillsItem;
      }
    }
  }
  return index;
}
