# Feature — Knowledge graph admin view

## Why
Retrieval quality now depends on the entity/edge graph built at ingest time
(`lib/retrieval/indexer.ts`). That graph is produced by a Claude extraction call
and is currently invisible: if it invents an entity, splits one person across
two spellings, or asserts a wrong relation, Blake has no way to see it — let
alone fix it. Bad graph data silently degrades one-hop expansion in
`lib/retrieval/search.ts`.

## What
A **Graph** tab in the admin dashboard that shows what was extracted and lets
Blake correct it.

### See
- Index health stats: sources, chunks, entities, edges, chunks missing an
  embedding, and a breakdown of chunks per embedding model (so a mixed-model
  index — which silently disables vector scoring — is visible).
- Every entity: name, type, how many chunks mention it, which sources it came
  from, and how many edges touch it.
- Entities with **zero mentions** flagged as orphans (extraction noise that can
  never be reached by retrieval).
- Every relation as `from — relation → to`.

### Fix
- **Rename / retype an entity.** Renaming to a name that already exists
  **merges** the two: mentions and edges move to the surviving entity,
  duplicate edges collapse, self-loops are dropped. This is the main cleanup
  path — extraction routinely produces "Blake" and "Blake Mauri" as separate
  entities, which fragments the graph.
- **Delete an entity** (its mentions and edges cascade; chunks are untouched).
- **Delete a relation.**
- **Add a relation** between two existing entities, so Blake can assert a
  connection the extractor missed.

## Boundaries
- Read/fix only. No re-running extraction from this tab (the Knowledge tab's
  Rescan and `scripts/reindex.ts` already cover that).
- No new graph visualisation library — a list view, consistent with the rest of
  the admin UI.
- Mutation logic lives in `lib/retrieval/graph.ts` so it is testable without a
  request context; server actions in `app/admin/actions.ts` are thin
  auth + revalidate wrappers.

## Acceptance
- The Graph tab renders for an authed admin and shows accurate counts.
- Renaming into an existing name merges rather than erroring on the unique
  `Entity.key` constraint.
- Every mutation is reflected in what `retrieve()` subsequently returns.
- Deleting an entity never deletes chunks or sources.
