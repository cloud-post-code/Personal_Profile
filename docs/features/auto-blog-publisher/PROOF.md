# Proof — Auto Blog Publisher

## Primary proof

```
npx tsx scripts/check-blog.ts
```

Passes only when every post in `content/blog/` satisfies the content
contract (frontmatter, topic, no em/en dashes, >=3 sources, snippet-length
description) and at least one post exists.

## Secondary checks

- `npm run build` compiles the blog routes.
- GET `/blog` returns the index with the seed post listed.
- GET `/blog/how-ai-assistants-decide-which-small-businesses-to-recommend`
  renders the post with Article JSON-LD in the HTML.
- GET `/sitemap.xml` includes the post URL.
- A scheduled agent exists that runs every 2 days with
  `docs/prompts/blog-agent.md` as its instructions.
