# Proof Plan — Deleting content removes its claims from the graph

## Definition Of Done
- Deleting an origin removes the entities and relations that only it asserted.
- An entity or relation still asserted by another origin survives that delete.
- A relation added by hand on the Graph tab survives deletes of any origin.
- `retrieve()` stops emitting a deleted origin's relations into
  `KNOWN RELATIONSHIPS`.
- Re-indexing one origin does not drop another origin's ownership of a shared
  relation.
- Chunk / entity / edge / mention counts return to their pre-run baseline.

## Primary Proof
Type: integration (internal contract — the indexer/graph/retrieval path)

Command:
```bash
npx tsx docs/features/graph-delete-provenance/proof.ts
```

Runs against the local dev Postgres (`blake-pg`, from `.env` `DATABASE_URL`);
the script loads `.env` itself. It seeds a throwaway source and project (ids
prefixed `gdpproof`), drives the real `indexSource` / `indexProject` /
`dropOrigin` / `addEdge` / `retrieve` path, asserts, then deletes everything it
made. Entity extraction is stubbed — branching on the origin label so the two
origins assert an overlapping graph — so the proof never depends on live Claude
output.

Expected evidence:
- `All proof assertions passed`, exit 0.
- Each assertion printed `PASS <name>`.

### Assertions
1. **Both origins index** — source and project chunks exist; the shared entity
   resolves to one row mentioned by both.
2. **Sole-origin entity exists while its origin does** — `Halcyon Index` is
   present after indexing.
3. **Hand-added relation is accepted** — `addEdge` between two live entities.
3b. **The leak is characterized** — the sole-origin entity's key appears in the
   query (so `retrieve()` will seed it) and an extracted relation references it.
   Asserted as two conditions rather than by inspecting rendered output, because
   `search.ts` caps `relations` at 12 and a populated graph crowds the line out.
4. **Re-index preserves other ownership** — re-running `indexProject` leaves the
   shared relation intact.
5. **Dropping one owner keeps a co-owned relation** — after
   `dropOrigin("project", …)`, `Blake — works with → Riverbend Collective`
   survives because the source still asserts it.
6. **Co-owned entity survives** — `Riverbend Collective` survives that drop; it
   is still mentioned by source chunks.
7. **Dropping the last owner removes the relation** — after
   `dropOrigin("source", …)`, the co-owned relation is gone.
8. **Sole-origin entity and its relation are removed** — `Halcyon Index` and
   `Riverbend Collective — built → Halcyon Index` are both gone.
9. **Hand-added relation survives** — the manual edge is still present after
   both origins are deleted.
10. **Endpoints of a surviving relation are kept** — `Riverbend Collective` and
    `Blake` survive with zero mentions because the manual edge still needs them.
11. **Retrieval stops citing deleted claims** — `retrieve()` for a query naming
    the deleted entity returns no relation mentioning it (it did before the
    delete).
12. **Baseline restored** — chunk, entity, edge and mention counts match the
    pre-run values.
13. **Merging carries ownership** — renaming an entity onto an existing name
    merges the two and rewires its edges onto new rows; deleting the origin that
    asserted the relation must still retract the *rewired* edge. Without the
    ownership copy in `mergeInto` the relation outlives its source, which is the
    bug this feature exists to fix.

Secondary guards:
- `npx tsc --noEmit` clean.
- `npx tsx docs/features/universal-knowledge-index/proof.ts` still green
  (indexing and drop semantics unchanged for everything else).
- `npx tsx docs/features/knowledge-graph-admin/proof.ts` still green (rename /
  merge / delete-entity paths still behave).

## Red Expectation
Before implementation the script fails on assertions 7 and 8 — three checks:
`dropOrigin` deletes chunks only, so the sole-origin entity and both extracted
relations survive the delete.

Assertion 13 is red independently: with `lib/retrieval/graph.ts` reverted (the
rest of the feature in place) it is the single failing check, so it guards the
merge path on its own rather than riding on the others.

Assertion 11 is a **guard, not a red**: it passes even before the fix. Once the
developer's own graph is populated, `search.ts` caps `relations` at 12
([search.ts:154](../../../lib/retrieval/search.ts)), so real relations can crowd
the leaked one out of the returned list. It still earns its place — after the
fix the entity is gone, so the claim provably cannot be cited — but it must not
be read as evidence that the leak existed. Assertions 3b and 8 prove that.

That same cap is why assertion 3b asserts the two conditions that make the leak
reachable rather than asserting on `relations` directly: an earlier draft did
the latter and flipped between pass and fail purely with the size of the
developer's own graph.

## Environment And Data
- Local Docker Postgres `blake-pg` on `localhost:5433`, schema pushed.
- `.env` with `DATABASE_URL`; loaded by the script itself.
- `VOYAGE_API_KEY` optional — `retrieve()` embeds the query, and falls back to
  the local hash embedder when no provider key is set. Either path satisfies the
  assertions, which are about relations, not ranking.
- No Anthropic call: entity extraction is injected via the `extract` option.
- Seeded rows use the `gdpproof` id prefix and are deleted in `finally`.

## Anti-Gaming Constraints
- Cleanup must be scoped by the `gdpproof` id prefix. It must not delete chunks
  by `originKind` alone — that would wipe the developer's real indexed content
  and make the baseline assertion pass vacuously.
- Deletion must be proven through `dropOrigin` (the path the admin actions
  call), not by deleting entity/edge rows directly in the proof.
- Assertion 11 must query through `retrieve()`, not by reading tables — the
  leak being fixed is what reaches the prompt.
- The stub extractor replaces only the Claude call. Chunking, embedding,
  persistence and pruning all run for real.
- Assertions 5 and 9 must not be weakened to "count decreased"; they name the
  specific relation that has to survive.

## Repo Safety Gate
Command:
```bash
$HOME/.claude/scripts/gate
```

## Manual Gaps
- Production (Railway) migration is applied by Blake, not by this proof; the
  proof covers the local schema only.
- The Graph tab's rendering of the cleaned-up graph is not clicked through
  (admin login required).
