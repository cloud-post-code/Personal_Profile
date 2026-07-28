import React from "react";

/**
 * A tiny, dependency-free markdown renderer for chat bubbles. The bot only
 * emits a small subset — bold, italic, inline code, fenced code blocks, links,
 * and bullet/numbered lists — so we parse just those into React nodes (never
 * dangerouslySetInnerHTML, so there's no XSS surface).
 *
 * Code (inline and blocks) is deliberately styled in the BODY text font, not a
 * monospace font, so it blends into the message and respects the site theme,
 * with only a faint tint to set it apart.
 */

/** Split raw text into inline nodes: `code`, **bold**, *italic*, [links](url). */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  // Ordered so the first match wins at each position.
  const pattern =
    /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\([^)]+\))|(https?:\/\/[^\s)]+)/g;
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;

  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const token = m[0];
    const key = `${keyPrefix}-${i++}`;

    if (token.startsWith("`")) {
      nodes.push(
        <code key={key} style={codeInline}>
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("**")) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("*")) {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith("[")) {
      const mm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      if (mm) {
        nodes.push(
          <a key={key} href={mm[2]} target="_blank" rel="noreferrer">
            {mm[1]}
          </a>,
        );
      } else nodes.push(token);
    } else {
      // Bare URL.
      nodes.push(
        <a key={key} href={token} target="_blank" rel="noreferrer">
          {token}
        </a>,
      );
    }
    last = m.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

type Block =
  | { kind: "code"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "h"; level: number; text: string }
  | { kind: "p"; text: string };

/** Group lines into block-level structures (fenced code, lists, headings, paragraphs). */
function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block: ``` ... ```
    if (line.trimStart().startsWith("```")) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        body.push(lines[i]);
        i++;
      }
      i++; // consume closing fence
      blocks.push({ kind: "code", text: body.join("\n") });
      continue;
    }

    // Blank line — skip.
    if (!line.trim()) {
      i++;
      continue;
    }

    // Bullet list.
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      blocks.push({ kind: "ul", items });
      continue;
    }

    // Numbered list.
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      blocks.push({ kind: "ol", items });
      continue;
    }

    // Heading.
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      blocks.push({ kind: "h", level: h[1].length, text: h[2] });
      i++;
      continue;
    }

    // Paragraph: gather consecutive non-blank, non-special lines.
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trimStart().startsWith("```") &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^#{1,4}\s+/.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    blocks.push({ kind: "p", text: para.join("\n") });
  }

  return blocks;
}

export function Markdown({ text }: { text: string }) {
  const blocks = parseBlocks(text);
  return (
    <div style={wrap}>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case "code":
            return (
              <pre key={i} style={codeBlock}>
                <code style={{ fontFamily: "inherit" }}>{b.text}</code>
              </pre>
            );
          case "ul":
            return (
              <ul key={i} style={list}>
                {b.items.map((it, j) => (
                  <li key={j} style={listItem}>
                    {renderInline(it, `${i}-${j}`)}
                  </li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={i} style={list}>
                {b.items.map((it, j) => (
                  <li key={j} style={listItem}>
                    {renderInline(it, `${i}-${j}`)}
                  </li>
                ))}
              </ol>
            );
          case "h":
            return (
              <div key={i} style={{ ...heading, fontSize: b.level <= 2 ? 17 : 15 }}>
                {renderInline(b.text, `h-${i}`)}
              </div>
            );
          default:
            return (
              <p key={i} style={paragraph}>
                {renderInline(b.text, `p-${i}`)}
              </p>
            );
        }
      })}
    </div>
  );
}

// ── styles ──
// Everything inherits the surrounding bubble's font (the site body font); code
// keeps that same font and only adds a faint tint so it stays legible.
const wrap: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 8 };
const paragraph: React.CSSProperties = { margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.5 };
const heading: React.CSSProperties = { fontWeight: 700, lineHeight: 1.3 };
const list: React.CSSProperties = { margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 4 };
const listItem: React.CSSProperties = { lineHeight: 1.45 };
const codeInline: React.CSSProperties = {
  fontFamily: "inherit",
  background: "color-mix(in srgb, currentColor 10%, transparent)",
  borderRadius: "var(--radius-sm)",
  padding: "1px 5px",
  fontSize: "0.92em",
};
const codeBlock: React.CSSProperties = {
  fontFamily: "inherit",
  background: "color-mix(in srgb, currentColor 8%, transparent)",
  borderRadius: "var(--radius-sm)",
  padding: "10px 12px",
  margin: 0,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  fontSize: "0.92em",
  lineHeight: 1.5,
};
