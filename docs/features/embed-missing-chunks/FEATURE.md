# Feature — Embed only the chunks that have no embedding

## Why
When the embedding provider hiccups mid-index, `embedTexts` deliberately
returns null vectors rather than silently falling back to a different model
(see `lib/retrieval/embed.ts`). The chunks are written anyway: their text is
intact, their mentions are intact, the entities and edges they fed are
intact — only the vector is missing, so cosine can never reach them and the
Graph tab reports "N chunk(s) have no embedding".

Today the only repair the tab offers is "re-run the reindex script": a full
rebuild of every origin, which re-chunks text that never changed, spends one
Claude extraction call per origin, rewrites graph edges that were never
wrong, and paces itself at ~21s per origin. That is a disproportionate
remedy for a missing vector, and it is not available from the browser at all.

## What

### Backfill (embedding calls only, no Claude, no graph writes)
- `embedMissingChunks()` in `lib/retrieval/indexer.ts` selects the chunks
  where `embedding IS NULL`, embeds their text in batches of
  `EMBED_BACKFILL_BATCH` (32), and writes the vector plus `embedModel` back
  onto those rows. Nothing else in the row is touched.
- Chunks that already have an embedding are never re-embedded, whatever
  model produced them. Repairing a gap must not become a silent migration.
- Vectors are written with the **current** model — the same one `retrieve()`
  embeds the visitor's question with — so a repaired chunk is comparable to
  queries even when the rest of the index sits on an older provider. When
  that introduces a second model, the tab's existing mixed-index notice says
  so; this feature does not try to hide it.
- Fails soft per batch, exactly as indexing does: a provider failure returns
  null vectors, those rows stay null, and the result reports
  `embedded < attempted` instead of throwing away the batches that worked.
- The embedder is injectable (`opts.embed`), matching the repo's existing
  `IndexOpts.extract` seam, so the proof runs with zero network calls.

### Admin
- The Graph tab's missing-embedding notice gains an **Embed N missing
  chunk(s)** button wired to a thin auth-wrapped `backfillEmbeddings` action,
  the same shape as `rebuildOverviews`. The notice copy stops pointing at the
  reindex script and says what the button actually costs.
- The notice element becomes a `div` so it can legally contain the form.

## Boundaries
- Logic in `lib/retrieval/indexer.ts` (it already owns chunk writes and is
  the only module that calls `embedTexts` for persistence); thin server
  action in `app/admin/actions.ts`; UI change confined to the notice in
  `app/admin/GraphPanel.tsx`.
- No schema change. Postgres provider untouched.
- Out of scope: re-embedding chunks that sit on an older model (the
  mixed-index case). That is a migration, not a repair, and it costs a
  vector for every chunk in the index — it keeps pointing at the reindex
  script.
- Out of scope: re-running entity extraction. A missing vector is not
  evidence that the graph is wrong.

## Acceptance
- Running the backfill embeds every null-embedding chunk and reports
  `attempted` / `embedded` / `model`.
- Chunks that already carry an embedding are byte-for-byte unchanged,
  including their `embedModel`.
- The stored vector is genuinely the embedding of that chunk's own text, and
  distinct chunks get distinct vectors.
- Batching covers all chunks, not just the first batch.
- A provider that returns nothing leaves the rows null, reports
  `embedded = 0`, and does not throw.
- Running it twice is a no-op the second time (`attempted = 0`).
- `graphStats().chunksWithoutEmbedding` reaches 0 afterwards.
