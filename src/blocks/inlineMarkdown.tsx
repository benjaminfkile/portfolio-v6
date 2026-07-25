import { Fragment, type ReactNode } from 'react';

/**
 * The constrained inline-markdown renderer used by `paragraph`, `list`, and
 * `quote` block text (spec §3.7).
 *
 * The subset is deliberately tiny: **bold**, *italic* / _italic_, `inline code`,
 * and [links](https://…). Everything is parsed to **React elements** — there is
 * no HTML parsing and no `dangerouslySetInnerHTML` anywhere, which is the whole
 * point (§3.7): raw HTML is never stored and never rendered, so a stored
 * `<script>` or an `onerror=` attribute is impossible to activate. React escapes
 * every text node, so any stray markup in the input surfaces as inert visible
 * text rather than live DOM.
 *
 * Two further guards on links: only `http`/`https` URLs become anchors, so a
 * `javascript:` (or `data:`) URL renders as its inert label text instead of a
 * clickable link; and every anchor opens off-site with `rel="noopener
 * noreferrer"` (§3.4), matching the shared `LinkList`.
 */

/** A link target is safe iff it is an absolute `http`/`https` URL (spec §3.4). */
function isSafeUrl(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}

/**
 * Parse a run of constrained-markdown `text` into React nodes. Recurses into the
 * inner text of bold/italic/link constructs so nesting works; the contents of
 * inline code are taken verbatim (no nested parsing), matching markdown.
 */
function parse(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  let buffer = '';
  let index = 0;
  let key = 0;

  const flush = () => {
    if (buffer) {
      out.push(buffer);
      buffer = '';
    }
  };

  while (index < text.length) {
    const char = text[index];

    // `inline code` — contents are literal, never re-parsed.
    if (char === '`') {
      const end = text.indexOf('`', index + 1);
      if (end > index) {
        flush();
        out.push(<code key={`${keyPrefix}-${key++}`}>{text.slice(index + 1, end)}</code>);
        index = end + 1;
        continue;
      }
    }

    // **bold**
    if (char === '*' && text.startsWith('**', index)) {
      const end = text.indexOf('**', index + 2);
      if (end > index + 1) {
        flush();
        out.push(
          <strong key={`${keyPrefix}-${key++}`}>
            {parse(text.slice(index + 2, end), `${keyPrefix}-${key}`)}
          </strong>,
        );
        index = end + 2;
        continue;
      }
    }

    // *italic* or _italic_
    if (char === '*' || char === '_') {
      const end = text.indexOf(char, index + 1);
      if (end > index + 1) {
        flush();
        out.push(
          <em key={`${keyPrefix}-${key++}`}>
            {parse(text.slice(index + 1, end), `${keyPrefix}-${key}`)}
          </em>,
        );
        index = end + 1;
        continue;
      }
    }

    // [label](url)
    if (char === '[') {
      const close = text.indexOf(']', index + 1);
      if (close > index && text[close + 1] === '(') {
        const paren = text.indexOf(')', close + 2);
        if (paren > close + 1) {
          const label = text.slice(index + 1, close);
          const url = text.slice(close + 2, paren);
          flush();
          const inner = parse(label, `${keyPrefix}-${key}`);
          if (isSafeUrl(url)) {
            out.push(
              <a
                key={`${keyPrefix}-${key++}`}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {inner}
              </a>,
            );
          } else {
            // Unsafe protocol: drop the link, keep the label as inert text.
            out.push(<Fragment key={`${keyPrefix}-${key++}`}>{inner}</Fragment>);
          }
          index = paren + 1;
          continue;
        }
      }
    }

    buffer += char;
    index += 1;
  }

  flush();
  return out;
}

/**
 * Render constrained inline markdown to React nodes. Safe to drop straight into
 * JSX: `<p>{renderInline(text)}</p>`.
 */
export function renderInline(text: string): ReactNode {
  return parse(text, 'md');
}
