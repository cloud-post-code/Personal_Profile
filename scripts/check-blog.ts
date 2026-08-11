/**
 * Blog content gate — run with: npx tsx scripts/check-blog.ts
 *
 * Enforces the publishing rules from docs/prompts/blog-agent.md on every post
 * in content/blog/. The scheduled publishing agent must run this before
 * committing; a human editing posts by hand gets the same guardrails.
 *
 * Rules checked per post:
 *   1. Filename is a clean slug (lowercase letters, digits, hyphens).
 *   2. Frontmatter has title, description, date (YYYY-MM-DD), topic, keywords.
 *   3. topic is one of the three authority niches.
 *   4. No em dashes or en dashes anywhere in the file.
 *   5. A "## Sources" section with at least 3 external https links.
 *   6. Description length fits a search snippet (50 to 170 chars).
 */
import fs from "fs";
import path from "path";

const BLOG_DIR = path.join(process.cwd(), "content", "blog");
const TOPICS = ["ai-discoverability", "ai-readiness", "ai-stack"];

const errors: string[] = [];
const files = fs.existsSync(BLOG_DIR)
  ? fs.readdirSync(BLOG_DIR).filter((f) => f.endsWith(".md"))
  : [];

if (files.length === 0) errors.push("content/blog contains no posts");

for (const file of files) {
  const fail = (msg: string) => errors.push(`${file}: ${msg}`);
  if (!/^[a-z0-9-]+\.md$/.test(file)) fail("filename must be a lowercase slug");

  const raw = fs.readFileSync(path.join(BLOG_DIR, file), "utf8");

  if (/[—–]/.test(raw)) fail("contains an em dash or en dash");

  const fm = raw.match(/^---\n([\s\S]*?)\n---\n/);
  if (!fm) {
    fail("missing frontmatter block");
    continue;
  }
  const meta: Record<string, string> = {};
  for (const line of fm[1].split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  for (const key of ["title", "description", "date", "topic", "keywords"]) {
    if (!meta[key]) fail(`frontmatter missing ${key}`);
  }
  if (meta.date && !/^\d{4}-\d{2}-\d{2}$/.test(meta.date)) fail("date must be YYYY-MM-DD");
  if (meta.topic && !TOPICS.includes(meta.topic)) {
    fail(`topic must be one of: ${TOPICS.join(", ")}`);
  }
  if (meta.description && (meta.description.length < 50 || meta.description.length > 170)) {
    fail(`description is ${meta.description.length} chars; needs 50 to 170 for a search snippet`);
  }

  const sourcesIdx = raw.indexOf("## Sources");
  if (sourcesIdx === -1) {
    fail("missing a '## Sources' section");
  } else {
    const sourceLinks = raw.slice(sourcesIdx).match(/\]\(https:\/\/[^)]+\)/g) ?? [];
    if (sourceLinks.length < 3) {
      fail(`Sources section has ${sourceLinks.length} links; needs at least 3`);
    }
  }
}

if (errors.length) {
  console.error("Blog check FAILED:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`Blog check PASSED for ${files.length} post(s).`);
