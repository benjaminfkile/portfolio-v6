/**
 * Client-side syntax highlighting for `code` blocks (spec §3.7).
 *
 * This module is imported **dynamically** — `CodeBlock` only pulls it in when a
 * code block with an allowlisted language actually mounts, so the highlighter
 * and its grammars land in a route-level async chunk rather than the main
 * bundle. Every `import()` below is likewise lazy, so a grammar is fetched only
 * when a block uses it (spec §3.7: "dynamically imported only on routes that
 * actually contain a code block, and only the allowlisted languages bundled").
 *
 * Shiki is used (spec §3.7 prefers it for accuracy) via its fine-grained core
 * API with the pure-JS regex engine — no WebAssembly, which keeps the chunk
 * lean and the highlighter usable in a plain DOM. Output is a **token array**,
 * not an HTML string, so `CodeBlock` renders it as React elements: there is no
 * `dangerouslySetInnerHTML` anywhere in the pipeline (spec §3.7).
 */

import type { HighlighterCore } from 'shiki/core';
import type { Theme } from '../components/ThemeToggle';
import { CODE_THEMES } from './codeThemes';
import { normalizeLanguage, type CodeLanguage } from './languages';

/** One highlighted run of characters: its text plus a resolved colour. */
export interface CodeToken {
  content: string;
  color?: string;
}

/**
 * Lazy grammar loaders, one per allowlisted language (`languages.ts`). Each is a
 * distinct dynamic import so a bundler splits every grammar into its own chunk
 * and only the ones a page uses are fetched.
 */
const LANG_LOADERS: Record<CodeLanguage, () => Promise<{ default: unknown }>> = {
  typescript: () => import('shiki/langs/typescript.mjs'),
  javascript: () => import('shiki/langs/javascript.mjs'),
  tsx: () => import('shiki/langs/tsx.mjs'),
  jsx: () => import('shiki/langs/jsx.mjs'),
  json: () => import('shiki/langs/json.mjs'),
  bash: () => import('shiki/langs/bash.mjs'),
  python: () => import('shiki/langs/python.mjs'),
  sql: () => import('shiki/langs/sql.mjs'),
  css: () => import('shiki/langs/css.mjs'),
  html: () => import('shiki/langs/html.mjs'),
  markdown: () => import('shiki/langs/markdown.mjs'),
  go: () => import('shiki/langs/go.mjs'),
  rust: () => import('shiki/langs/rust.mjs'),
  yaml: () => import('shiki/langs/yaml.mjs'),
};

/**
 * The highlighter is created once and shared; languages AND themes are loaded
 * on demand (a visitor who never toggles the site theme never downloads the
 * other code theme — see `codeThemes.ts`).
 */
let highlighterPromise: Promise<HighlighterCore> | null = null;
const loadedLanguages = new Set<CodeLanguage>();
const loadedThemes = new Set<Theme>();

async function getHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = (async () => {
      const { createHighlighterCore } = await import('shiki/core');
      const { createJavaScriptRegexEngine } = await import(
        'shiki/engine/javascript'
      );
      return createHighlighterCore({
        themes: [],
        langs: [],
        engine: createJavaScriptRegexEngine(),
      });
    })();
  }
  return highlighterPromise;
}

/**
 * Tokenise `code` under `language` for a site theme, returning a per-line array
 * of coloured tokens. The Shiki theme per site theme comes from
 * `CODE_THEMES` (`codeThemes.ts`); `siteTheme` defaults to the native dark.
 * Returns `null` when the language is not allowlisted (the caller then renders
 * plain text, spec §3.7) or when highlighting throws for any reason — a
 * degraded plain rendering is always preferable to a broken block.
 */
export async function highlightCode(
  code: string,
  language: string,
  siteTheme: Theme = 'dark',
): Promise<CodeToken[][] | null> {
  const lang = normalizeLanguage(language);
  if (!lang) return null;

  try {
    const highlighter = await getHighlighter();
    if (!loadedLanguages.has(lang)) {
      const grammar = await LANG_LOADERS[lang]();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await highlighter.loadLanguage(grammar.default as any);
      loadedLanguages.add(lang);
    }
    if (!loadedThemes.has(siteTheme)) {
      const theme = await CODE_THEMES[siteTheme].load();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await highlighter.loadTheme(theme.default as any);
      loadedThemes.add(siteTheme);
    }
    const { tokens } = highlighter.codeToTokens(code, {
      lang,
      theme: CODE_THEMES[siteTheme].name,
    });
    return tokens.map((line) =>
      line.map((token) => ({ content: token.content, color: token.color })),
    );
  } catch {
    return null;
  }
}
