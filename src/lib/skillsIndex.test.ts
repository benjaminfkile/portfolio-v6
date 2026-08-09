import { describe, expect, it } from 'vitest';
import { buildSkillsIndex } from './skillsIndex';
import type { ContentDocument } from '../types/content';
import { fixtureSkillRefsDocument } from '../test/fixtures';

describe('buildSkillsIndex (Skill Refs v1.8)', () => {
  it('indexes skills items across ALL pages of the document', () => {
    const index = buildSkillsIndex(fixtureSkillRefsDocument);

    // Two skills on `home` and one on the `tools` page — the index spans both.
    expect(Object.keys(index).sort()).toEqual(['sk-docker', 'sk-ts', 'sk-vercel']);
    expect(index['sk-ts'].title).toBe('TypeScript');
    expect(index['sk-docker'].title).toBe('Docker');
    // The dark override rides along for the theme-aware icon choice.
    expect(index['sk-vercel'].icon_source_dark).toBe(
      'https://cdn.example.com/icons/vercel-dark.svg',
    );
  });

  it('ignores non-skills sections and their items', () => {
    const index = buildSkillsIndex(fixtureSkillRefsDocument);
    // The portfolio item id is not a skills item and must not leak into the map.
    expect(index['pf-refs']).toBeUndefined();
  });

  it('degrades to an empty index for a partial / empty document', () => {
    expect(buildSkillsIndex({ version: 0, published_at: null, pages: [] })).toEqual(
      {},
    );
    // A document missing `pages` entirely (older payload) does not throw.
    expect(
      buildSkillsIndex({ version: 0, published_at: null } as ContentDocument),
    ).toEqual({});
  });
});
