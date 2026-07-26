# Proof — Retrieval engine v1

## Primary proof command
```
npx tsx docs/features/retrieval-engine-v1/proof.ts
```
Runs against the local dev Postgres (`blake-pg`, from `.env` `DATABASE_URL`);
the script loads `.env` itself. It seeds throwaway sources (ids prefixed
`prooftest`), exercises the real pipeline, asserts, and cleans up. Entity
extraction is injected as a deterministic stub so the proof does not depend on
live Claude output; everything else (chunking, embedding, storage, retrieval,
prompt assembly) is the real code path.

## Assertions (all must pass)
1. **Indexing** — `indexSource()` on a seeded source with distinctive raw text
   creates ≥2 chunks, each with a non-null embedding and `embedModel` tag, and
   persists the stubbed entities, mentions, and edges.
2. **Idempotent re-index** — running `indexSource()` again does not duplicate
   chunks, mentions, or edges.
3. **Hybrid retrieval** — `retrieve()` for a query matching a distinctive fact
   ranks that source's chunk in the results; a query about an unrelated seeded
   source does not rank the first source's chunks on top.
4. **One-hop graph expansion** — with entity A mentioned only in source-1
   chunks, entity B only in source-2 chunks, and an edge A→B: a query that
   matches only source-1 text also surfaces a source-2 chunk (reachable purely
   via the edge), and the entity relation line (A —rel→ B) is in the context.
5. **Prompt swap** — `buildSystemPrompt(query)` contains the retrieved chunk's
   distinctive text and does NOT contain the unrelated source's summary;
   `buildSystemPrompt()` with no query still returns a usable prompt.
6. **Cascade cleanup** — deleting the seeded sources removes their chunks and
   mentions (proof deletes its rows and verifies counts return to baseline).

## Red expectation
Before implementation the script fails at import/run time (retrieval modules
and Prisma models do not exist).

## Secondary checks (not proof)
- `npx next lint` clean on touched files.
- `npx tsc --noEmit` clean.
- `$HOME/.claude/scripts/gate` PASS.
