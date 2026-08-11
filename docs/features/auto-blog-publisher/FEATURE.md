# Auto Blog Publisher

Add a public, SEO-optimized blog to the site and an automated publishing
pipeline that builds topical authority in three niches: AI Discoverability
for SMBs, SMB AI Readiness, and AI Stack Management for SMBs.

## Behavior

- Posts are markdown files in `content/blog/` with flat frontmatter
  (title, description, date, topic, keywords).
- `/blog` lists all posts newest first; `/blog/<slug>` renders a post with
  per-post metadata, canonical URL, Open Graph tags, and Article JSON-LD.
- `app/sitemap.ts` and `app/robots.ts` expose the blog to crawlers.
- `scripts/check-blog.ts` enforces the content contract: valid frontmatter,
  no em or en dashes, a Sources section with at least 3 external links, and
  a snippet-length description.
- A scheduled cloud agent runs every 2 days following
  `docs/prompts/blog-agent.md`: it rotates topics, researches with web
  search, writes one post, runs the check script, commits, and pushes to
  main, which triggers the Railway deployment.

## Out of scope

- No CMS or database storage for posts; the repo is the source of truth.
- No comments, tags pages, or RSS (can be added later).
