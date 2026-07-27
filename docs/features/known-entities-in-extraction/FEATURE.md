# Feature — Feed known entity names into the extraction prompt

## Why
The entity extractor (`lib/retrieval/entities.ts`) sees each origin in
isolation, so it freely invents name variants for things the graph already
knows — "Blake" / "Blake Mauri", "Next.js" / "NextJS" — and every variant lands
as a separate entity row. The exact-key upsert in `lib/retrieval/indexer.ts`
only converges identical spellings, so these variants fragment mentions and
edges until the admin merges them by hand on the Graph tab. The graph is small
(dozens of entities), so the fix is cheap: tell the extractor what names
already exist and ask it to reuse them.

## What
When indexing an origin, pass the names of entities already in the graph into
the extraction prompt with an instruction to reuse those exact names whenever
the text refers to the same thing. Duplicates mostly stop being created
instead of needing cleanup after the fact.

### Behavior
- `extractEntities` accepts an optional list of known entity names. When the
  list is non-empty, the prompt gains a block listing those names with the
  instruction to reuse them verbatim (no variants or abbreviations) when the
  text refers to the same thing. When empty (first-ever ingest), the prompt is
  unchanged.
- The prompt block is capped at 200 names so a grown graph can never bloat the
  prompt unboundedly.
- `indexOrigin` fetches the current entity names (most-mentioned first, so the
  best-established names survive the cap) and passes them to the extractor.
  The fetch is best-effort: if it fails, extraction proceeds with an empty
  list — worse dedup, never a lost index.
- Injected extractors (`IndexOpts.extract` — used by tests and proofs) receive
  the same list as a third argument.

### Out of scope
- Retroactive cleanup of existing duplicates (that stays the Graph tab's
  suggested-merges + manual merge path).
- Fuzzy/semantic matching at ingest time; this only steers the LLM's naming.

## Constraints
- No new dependencies. No schema changes.
- Extraction must remain best-effort exactly as today: a failed name fetch or
  extraction call never loses the chunks already written.
