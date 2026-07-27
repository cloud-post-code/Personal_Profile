# Feature — Graph-cluster overviews for broad questions (GraphRAG-lite)

## Why
Chunk retrieval answers "where did Blake work?" well and "tell me about
Blake" badly: no single chunk answers a global question, so the model gets a
grab-bag of weakly-scored fragments. The graph already knows the shape of the
knowledge — neighborhoods of connected entities (career, each project,
interests). Summarizing each neighborhood once, at ingest time, gives broad
questions a purpose-built answer instead of retrieval's worst case.

## What

### Clustering (deterministic, free)
- `computeClusters` partitions the entity graph: remove the hub (the
  top-degree entity, when its degree ≥ 4 — in this graph that is Blake, who
  connects to everything and would otherwise glue all neighborhoods into one),
  then take connected components of what remains.
- Components with ≥ 2 entities become clusters, largest total mentions first,
  capped at 6. A cluster is labelled by its highest-mention member.
- Pure function over entity/edge arrays, so it is testable without a DB.

### Overviews (one Claude call per cluster, admin-triggered)
- For each cluster, the chunks mentioning its members (capped ~8000 chars)
  are summarized into one grounded paragraph.
- Each overview is stored through the existing `indexOrigin` machinery as a
  chunk with `originKind: "cluster"` (label `Overview — <cluster>`): no new
  table, embeddings for free, and stale overviews are swept exactly like any
  retracted origin. Entity extraction is passed as empty so synthetic prose
  never writes into the graph it summarizes.
- Regeneration is explicit — a **Rebuild overviews** button on the Graph tab,
  and the end of `scripts/reindex.ts --all`. NOT on every admin save: each
  rebuild costs up to 6 Claude calls + 6 embeds, and this repo's pattern
  (MAX_FACTS, EMBED_PACE_MS) is that spend is bounded and deliberate.

### Serving (broad questions get overviews, specific ones keep chunks)
- A query is **broad** when it contains no *distinctive* token: one that
  appears in at least one chunk and fewer than max(2, 20% of chunks) — the
  absolute floor keeps a one-chunk token selective even in a tiny corpus. The site owner's name is never
  distinctive — "tell me about Blake" is the flagship broad question, and
  "Blake" appears everywhere anyway. Unknown-token queries are broad too:
  wording the corpus has never seen deserves the overview, not a grab-bag.
- Broad + overviews exist → the prompt's KNOWLEDGE section carries the
  overview paragraphs (labelled per cluster) instead of retrieved chunks.
  Otherwise everything falls through to normal retrieval, unchanged.
- `retrieve()` now skips `cluster` chunks: overviews are synthesized from the
  corpus, so letting them compete with the chunks they summarize would serve
  the same facts twice and crowd out primary sources.

### Admin
- Graph tab shows current overviews (label + paragraph) with the Rebuild
  button; the per-origin breakdown pill labels them "Overviews".

## Boundaries
- Logic in `lib/retrieval/clusters.ts`; thin auth-wrapped server action; UI in
  the existing Graph tab panel. `search.ts` changes by one where-clause;
  `knowledge.ts` by one early-return.
- No schema change (`Chunk.originKind` is already free-form). Postgres
  provider untouched.
- No community-detection dependency — hub-removal + components is enough for
  a personal-site graph and stays explainable on the Graph tab.
- Overview quality depends on the summarizer model; a failed summary call
  skips that cluster and keeps the previous overview rather than deleting it.

## Acceptance
- A connected component of seeded entities becomes a cluster labelled by its
  top-mention member; hub removal splits components; size floor and cap hold.
- Rebuilding writes overview chunks and sweeps overviews whose cluster no
  longer exists.
- A no-distinctive-token query is served the overview block; a query with a
  rare (distinctive) token is not, and normal retrieval never returns
  `cluster` chunks.
- Overview text is embedded but contributes zero entities/edges to the graph.
