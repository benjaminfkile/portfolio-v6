/**
 * Code-block language allowlist (spec §3.7).
 *
 * This is the public-site half of a contract shared with the API. The API's Zod
 * schema validates `code.language` against exactly this set (§3.9), and the
 * highlighter here loads exactly these grammars — the two must stay in step, the
 * API being canonical (§8.4). The shape the repos agree on is: a readonly array
 * of canonical ids plus an alias map that folds common spellings onto them.
 *
 * A `language` outside the allowlist is **not** an error — the block renders as
 * plain text rather than failing (§3.7). Keeping the list small also keeps the
 * dynamically-imported highlighter chunk small: only these grammars are bundled.
 */

/** Canonical language ids. Each has a grammar loader in `highlight.ts`. */
export const CODE_LANGUAGES = [
  'typescript',
  'javascript',
  'tsx',
  'jsx',
  'json',
  'bash',
  'python',
  'sql',
  'css',
  'html',
  'markdown',
  'go',
  'rust',
  'yaml',
] as const;

export type CodeLanguage = (typeof CODE_LANGUAGES)[number];

const CANONICAL = new Set<string>(CODE_LANGUAGES);

/** Common spellings folded onto a canonical id. Kept deliberately small. */
const ALIASES: Record<string, CodeLanguage> = {
  ts: 'typescript',
  js: 'javascript',
  py: 'python',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  yml: 'yaml',
  md: 'markdown',
  rs: 'rust',
  golang: 'go',
  htm: 'html',
};

/**
 * Resolve a stored `language` string to a canonical allowlisted id, or `null`
 * when it is not recognised (the caller then renders plain text, spec §3.7).
 * Matching is case-insensitive and trims surrounding whitespace.
 */
export function normalizeLanguage(language: string): CodeLanguage | null {
  const key = language.trim().toLowerCase();
  if (CANONICAL.has(key)) return key as CodeLanguage;
  return ALIASES[key] ?? null;
}
