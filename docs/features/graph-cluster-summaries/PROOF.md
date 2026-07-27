# Proof — Graph-cluster overviews for broad questions

## Definition Of Done
- `computeClusters` (pure) removes the hub, forms components, applies the
  size floor, cap, ordering and labelling deterministically.
- `buildClusterOverviews` writes one embedded `cluster`-origin chunk per
  cluster via the injected summarizer, contributes nothing to the entity
  graph, and sweeps overviews whose cluster is gone.
- `isBroadQuery` (pure) and `broadOverviews` serve the overview block for
  no-distinctive-token queries only; `retrieve()` never returns `cluster`
  chunks; `buildSystemPrompt` carries the overview block for a broad question.

## Primary Proof
Type: integration + pure-function contract (same offline pattern as every
other proof in this repo)

Command:
```bash
npx tsx docs/features/graph-cluster-summaries/proof.ts
```

Runs against the local dev Postgres (`blake-pg`); loads `.env` itself, pins
the local embedder (keys deleted AFTER imports — Prisma re-loads `.env`), and
injects both the extractor and the summarizer. Zero Anthropic calls. Seeds
sources prefixed `clusterproof`.

Expected evidence (all assertions green):
1. **Pure clustering** — synthetic entity/edge arrays: the hub's removal
   splits one blob into two clusters; a 1-entity fragment is dropped; the cap
   keeps the largest; labels are the top-mention member; output order is
   deterministic.
2. **Build** — after seeding a self-contained fictional component, rebuilding
   with a stub summarizer writes a chunk with `originKind: "cluster"`, label
   `Overview — <top member>`, the stub text, and an embedding.
3. **No graph pollution** — entity and edge counts are unchanged by the
   rebuild (extraction empty).
4. **Broad serve** — a query of tokens the corpus has never seen returns the
   overview block (contains the stub summary and cluster label) from
   `broadOverviews`, and `buildSystemPrompt` for that query carries it.
5. **Specific serve** — a query containing a seeded rare marker token is not
   broad (`broadOverviews` returns null).
6. **Retrieval exclusion** — `retrieve()` for a token that appears only in
   the overview text returns no `cluster`-origin chunk.
7. **Fail-soft** — rebuilding with a throwing summarizer keeps the previous
   overview (a provider hiccup must not be treated as a vanished cluster).
8. **Sweep** — after the seeded sources and entities are removed, rebuilding
   deletes the now-orphaned overview.
9. **Cleanup** — seeded sources/entities and all `cluster` chunks removed;
   chunk/mention/entity counts back to baseline.

Secondary guards (not proof):
- `npx tsc --noEmit` clean; `npx next lint` clean on touched files.
- Prior graph proofs (suggested-merges, retrieval-playground,
  knowledge-graph-admin) still green — `retrieve()` changed.

## Environment And Data
- Local dev Postgres `blake-pg` via `.env` (Docker, port 5433).
- The proof runs the builder over the WHOLE live graph, so it may also write
  stub overviews for real clusters; cleanup deletes every `cluster` chunk, so
  the overview store is left empty — rebuild real overviews from the Graph
  tab afterwards.

## Anti-Gaming Constraints
- Only the outermost model boundaries (extractor, summarizer) are injected;
  chunking, embedding, persistence, clustering, sweeping and serving are the
  real code paths.
- Broad/specific assertions go through `broadOverviews`/`buildSystemPrompt`
  output, not by calling the pure predicate with hand-fed numbers (the pure
  tests exist separately, as unit contracts).

## Repo Safety Gate
Command:
```bash
$HOME/.claude/scripts/gate
```

## Red Expectation
Before implementation the script fails at import:
`lib/retrieval/clusters.ts` does not exist.

## Manual Gaps
- The Rebuild button and overview list are not clicked/viewed in a browser
  (password-gated admin); the action is a thin wrapper over the proven
  builder.
- Live summary quality (real Claude output) is unproven by design — the
  summarizer is injected; judging prose quality needs a human read.
