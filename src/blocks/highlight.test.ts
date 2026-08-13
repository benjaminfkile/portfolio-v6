import { describe, expect, it } from 'vitest';
import { highlightCode } from './highlight';

/**
 * Exercises the real Shiki-backed highlighter (unmocked) to prove the pipeline
 * works fully offline: the grammar and theme are bundled, no network is touched,
 * and the output is a token array (never an HTML string). Other suites mock this
 * module; this one is the ground truth for acceptance criterion 1455.
 */
describe('highlightCode — real highlighter (spec §3.7)', () => {
  it('tokenises an allowlisted language into coloured tokens', async () => {
    const lines = await highlightCode('const x = 1;', 'typescript');
    expect(lines).not.toBeNull();
    const flat = lines!.flat();
    // The keyword token is present and carries a resolved colour.
    const keyword = flat.find((t) => t.content === 'const');
    expect(keyword).toBeDefined();
    expect(keyword!.color).toMatch(/^#/);
    // Round-tripping the token contents reproduces the source exactly.
    expect(flat.map((t) => t.content).join('')).toBe('const x = 1;');
  });

  it('resolves an alias (ts → typescript)', async () => {
    const lines = await highlightCode('let y = 2;', 'ts');
    expect(lines).not.toBeNull();
    expect(lines!.flat().map((t) => t.content).join('')).toBe('let y = 2;');
  });

  it('colours tokens per site theme (codeThemes.ts mapping)', async () => {
    const darkLines = await highlightCode('const x = 1;', 'typescript', 'dark');
    const lightLines = await highlightCode(
      'const x = 1;',
      'typescript',
      'light',
    );
    const keywordColor = (lines: typeof darkLines) =>
      lines!.flat().find((t) => t.content === 'const')!.color;
    // Both themes resolve a colour, and they are different palettes — the dark
    // site theme must not serve light-theme token colours (the old bug).
    expect(keywordColor(darkLines)).toMatch(/^#/);
    expect(keywordColor(lightLines)).toMatch(/^#/);
    expect(keywordColor(darkLines)).not.toBe(keywordColor(lightLines));
  });

  it('returns null for a language outside the allowlist', async () => {
    expect(await highlightCode('+[.]', 'brainfuck')).toBeNull();
  });
});
