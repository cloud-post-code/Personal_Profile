# Proof — Knowledge graph admin view

## Primary proof command
```
npx tsx docs/features/knowledge-graph-admin/proof.ts
```
Runs against the local dev Postgres (`blake-pg`, from `.env` `DATABASE_URL`);
the script loads `.env` itself. It seeds throwaway sources (ids prefixed
`graphproof`), exercises the real `lib/retrieval/graph.ts` code path, asserts,
and cleans up. Entity extraction is injected as a deterministic stub so the
proof does not depend on live Claude output.

## Assertions (all must pass)
1. **Stats** — `graphStats()` reports the seeded sources, chunks, entities and
   edges, and its `embedModels` breakdown accounts for every chunk.
2. **Entity listing** — `listEntities()` returns each entity with its mention
   count, originating source titles, and edge count. An edge endpoint the
   extractor never listed as an entity (upserted by `persistGraph` so the edge
   resolves, but never mentioned in any chunk) is reported with
   `mentions === 0` — the orphan case retrieval can never reach.
3. **Edge listing** — `listEdges()` renders endpoints by name, not id.
4. **Rename (no collision)** — `renameEntity()` updates name, type and the
   normalized `key`, and reports `merged: false`.
5. **Rename into an existing name merges** — mentions move to the survivor
   (deduped), edges are rewired, and the renamed entity row is gone.
   Reports `merged: true`.
6. **Merge collapses duplicates and drops self-loops** — an edge that would
   duplicate an existing one after rewiring does not create a second row, and
   an edge whose endpoints become identical is dropped.
7. **Add edge** — `addEdge()` creates a relation between two entities, is
   idempotent for the same triple, and refuses a self-loop.
8. **Delete edge** — `deleteEdge()` removes only that relation.
9. **Delete entity** — `deleteEntity()` removes the entity and its mentions
   while leaving its chunks and sources intact.
10. **Retrieval reflects fixes** — after merging two entities, a query seeded
    to match only one source still reaches the other source's chunk via the
    merged entity's edge (one-hop expansion still works post-edit).
11. **Cleanup** — deleting the seeded sources returns chunk and mention counts
    to their pre-run baseline.

## Red expectation
Before implementation the script fails at import time: `lib/retrieval/graph.ts`
does not exist.

## Secondary checks (not proof)
- `npx next lint` clean on touched files.
- `npx tsc --noEmit` clean.
- `$HOME/.claude/scripts/gate` PASS.
- Graph tab renders in the running app and reflects a live edit.
