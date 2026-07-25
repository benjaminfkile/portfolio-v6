import { useEffect, useRef, useState } from 'react';
import type { BlockProps, BlockOf } from './types';
import type { CodeToken } from './highlight';
import { normalizeLanguage } from './languages';
import styles from './CodeBlock.module.css';

/**
 * A `code` block (spec §3.7).
 *
 * The raw stored `code` is rendered immediately as plain text (React-escaped),
 * then progressively enhanced: if the `language` is allowlisted, the highlighter
 * module is **dynamically imported** — so Shiki and its grammars only load on a
 * route that actually contains a code block — and the returned tokens replace
 * the plain text. An unknown language, or any highlighting failure, simply keeps
 * the plain rendering (§3.7). Tokens render as coloured `<span>`s; the per-token
 * colour is the one inline style §14.1 rule 4 permits (a genuinely dynamic
 * value), and no HTML string is ever injected — there is no
 * `dangerouslySetInnerHTML` here.
 *
 * The copy control writes `block.code` — the raw stored string, never the DOM's
 * text content — so highlighting markup can never contaminate the clipboard
 * (§3.7). It shows a transient "Copied" confirmation and, where the Clipboard
 * API is unavailable, falls back to selecting the block's text.
 */

const COPY_RESET_MS = 2000;

export default function CodeBlock({ block }: BlockProps) {
  const { language, code, filename } = block as BlockOf<'code'>;
  const canonical = normalizeLanguage(language);
  const [tokens, setTokens] = useState<CodeToken[][] | null>(null);
  const [copied, setCopied] = useState(false);
  const preRef = useRef<HTMLPreElement>(null);
  const resetTimer = useRef<number | undefined>(undefined);

  // Progressive enhancement: pull in the highlighter only for allowlisted
  // languages, and only once this block has mounted (spec §3.7).
  useEffect(() => {
    if (!canonical) {
      setTokens(null);
      return;
    }
    let cancelled = false;
    import('./highlight')
      .then(({ highlightCode }) => highlightCode(code, language))
      .then((result) => {
        if (!cancelled) setTokens(result);
      })
      .catch(() => {
        if (!cancelled) setTokens(null);
      });
    return () => {
      cancelled = true;
    };
  }, [canonical, code, language]);

  // Clear any pending "Copied" reset on unmount.
  useEffect(
    () => () => {
      if (resetTimer.current) window.clearTimeout(resetTimer.current);
    },
    [],
  );

  const selectBlockText = () => {
    const pre = preRef.current;
    const selection = window.getSelection?.();
    if (!pre || !selection) return;
    const range = document.createRange();
    range.selectNodeContents(pre);
    selection.removeAllRanges();
    selection.addRange(range);
  };

  const handleCopy = async () => {
    // Always copy the raw stored string, never DOM text (spec §3.7).
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
        setCopied(true);
        if (resetTimer.current) window.clearTimeout(resetTimer.current);
        resetTimer.current = window.setTimeout(
          () => setCopied(false),
          COPY_RESET_MS,
        );
        return;
      }
    } catch {
      // Clipboard write rejected (permission, insecure context) — fall through.
    }
    selectBlockText();
  };

  return (
    <figure className={styles.block}>
      <div className={styles.header}>
        {filename && <span className={styles.filename}>{filename}</span>}
        <button
          type="button"
          className={styles.copy}
          onClick={handleCopy}
          aria-live="polite"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre
        ref={preRef}
        className={styles.pre}
        data-language={canonical ?? 'plaintext'}
      >
        <code>
          {tokens
            ? tokens.map((line, lineIndex) => (
                <span key={lineIndex} className={styles.line}>
                  {line.map((token, tokenIndex) => (
                    <span
                      key={tokenIndex}
                      style={token.color ? { color: token.color } : undefined}
                    >
                      {token.content}
                    </span>
                  ))}
                  {lineIndex < tokens.length - 1 ? '\n' : ''}
                </span>
              ))
            : code}
        </code>
      </pre>
    </figure>
  );
}
