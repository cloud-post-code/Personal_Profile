import React from "react";

/**
 * Server-side markdown renderer for blog posts. Dependency-free and rendered
 * to React nodes (never dangerouslySetInnerHTML), matching the approach of
 * app/Markdown.tsx but extended with headings and blockquotes, which long-form
 * posts need and chat bubbles never emit.
 */

function inline(text: string, keyPrefix: string): React.ReactNode[] {
  const pattern =
    /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\([^)]+\))/g;
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const token = m[0];
    const key = `${keyPrefix}-${i++}`;
    if (token.startsWith("`")) {
      nodes.push(<code key={key} className="blog-code">{token.slice(1, -1)}</code>);
    } else if (token.startsWith("**")) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("*")) {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    } else {
      const lm = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (lm && /^https?:\/\//.test(lm[2])) {
        nodes.push(
          <a key={key} href={lm[2]} target="_blank" rel="noopener noreferrer" className="blog-link">
            {lm[1]}
          </a>
        );
      } else {
        nodes.push(token);
      }
    }
    last = m.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function BlogMarkdown({ markdown }: { markdown: string }) {
  const lines = markdown.split("\n");
  const blocks: React.ReactNode[] = [];
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let key = 0;

  const flushPara = () => {
    if (para.length) {
      blocks.push(<p key={key++}>{inline(para.join(" "), `p${key}`)}</p>);
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      const items = list.items.map((it, i) => <li key={i}>{inline(it, `li${key}-${i}`)}</li>);
      blocks.push(list.ordered ? <ol key={key++}>{items}</ol> : <ul key={key++}>{items}</ul>);
      list = null;
    }
  };

  for (const line of lines) {
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    const ul = line.match(/^[-*]\s+(.*)$/);
    const ol = line.match(/^\d+\.\s+(.*)$/);
    if (h) {
      flushPara();
      flushList();
      const level = h[1].length;
      const text = inline(h[2], `h${key}`);
      // Post title renders separately from frontmatter, so demote everything
      // one step: markdown ## becomes the page's h2, ### becomes h3.
      if (level <= 2) blocks.push(<h2 key={key++}>{text}</h2>);
      else if (level === 3) blocks.push(<h3 key={key++}>{text}</h3>);
      else blocks.push(<h4 key={key++}>{text}</h4>);
    } else if (line.startsWith("> ")) {
      flushPara();
      flushList();
      blocks.push(<blockquote key={key++}>{inline(line.slice(2), `q${key}`)}</blockquote>);
    } else if (ul) {
      flushPara();
      if (!list || list.ordered) {
        flushList();
        list = { ordered: false, items: [] };
      }
      list.items.push(ul[1]);
    } else if (ol) {
      flushPara();
      if (!list || !list.ordered) {
        flushList();
        list = { ordered: true, items: [] };
      }
      list.items.push(ol[1]);
    } else if (line.trim() === "") {
      flushPara();
      flushList();
    } else {
      para.push(line.trim());
    }
  }
  flushPara();
  flushList();
  return <div className="blog-body">{blocks}</div>;
}
