import fs from "fs";
import path from "path";

/**
 * File-based blog: each post is a markdown file in content/blog/ with a flat
 * frontmatter block. Posts are written by the scheduled publishing agent (see
 * docs/prompts/blog-agent.md) and validated by scripts/check-blog.ts before
 * every commit, so this reader can stay strict and simple.
 */

export type BlogPost = {
  slug: string;
  title: string;
  description: string;
  date: string; // YYYY-MM-DD
  topic: string; // ai-discoverability | ai-readiness | ai-stack
  keywords: string[];
  body: string; // markdown, frontmatter stripped
};

const BLOG_DIR = path.join(process.cwd(), "content", "blog");

/** Parse a flat `key: value` frontmatter block delimited by `---` lines. */
function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { meta: {}, body: raw };
  const meta: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { meta, body: raw.slice(m[0].length) };
}

function readPost(file: string): BlogPost | null {
  const slug = file.replace(/\.md$/, "");
  const raw = fs.readFileSync(path.join(BLOG_DIR, file), "utf8");
  const { meta, body } = parseFrontmatter(raw);
  if (!meta.title || !meta.description || !meta.date) return null;
  return {
    slug,
    title: meta.title,
    description: meta.description,
    date: meta.date,
    topic: meta.topic ?? "",
    keywords: (meta.keywords ?? "").split(",").map((k) => k.trim()).filter(Boolean),
    body,
  };
}

export function getAllPosts(): BlogPost[] {
  if (!fs.existsSync(BLOG_DIR)) return [];
  return fs
    .readdirSync(BLOG_DIR)
    .filter((f) => f.endsWith(".md"))
    .map(readPost)
    .filter((p): p is BlogPost => p !== null)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function getPost(slug: string): BlogPost | null {
  // Slug comes from the URL — refuse anything that could escape the blog dir.
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  const file = path.join(BLOG_DIR, `${slug}.md`);
  if (!fs.existsSync(file)) return null;
  return readPost(`${slug}.md`);
}
