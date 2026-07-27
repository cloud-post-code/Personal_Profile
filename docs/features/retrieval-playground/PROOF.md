# Proof — Retrieval playground on the Graph tab

## Definition Of Done
- `retrievalPreview(query)` returns the real `retrieve()` result shaped for
  display — chunks with origin ref, score, and `rank`/`graph` provenance,
  relation lines, and the entity names recognized in the query — with honest
  empties for blank input, an unindexed corpus, and a no-match query.
- The Graph tab renders a Test retrieval box wired to a thin auth-wrapped
  server action calling it.

## Primary Proof
Type: integration (internal contract against the real retrieval path — same
pattern as every other proof in this repo)

Command:
```bash
npx tsx docs/features/retrieval-playground/proof.ts
```

Runs against the local dev Postgres (`blake-pg`, from `.env` `DATABASE_URL`);
the script loads `.env` itself. Seeds throwaway sources (ids prefixed
`playproof`), drives `retrievalPreview` over the real chunk/entity/edge
tables, asserts, and cleans up. Extraction is stubbed; zero Anthropic calls.

Expected evidence (all assertions green):
1. **Ranked hit** — a query matching seeded text returns that chunk with
   `via: "rank"`, a positive score, and the source's origin label as `ref`.
2. **Graph hit** — a chunk reachable only through an entity edge (its text
   shares nothing with the query) is returned with `via: "graph"`.
3. **Recognized entities** — a query containing a seeded entity's name
   reports that entity in `queryEntities`.
4. **Relations** — the seeded edge appears among the relation lines.
5. **Assembly order** — every `rank` chunk precedes every `graph` chunk,
   mirroring what the prompt receives.
6. **Blank query** — returns empty chunks/relations without throwing.
7. **No second retrieval path** — the preview's chunks and relations are
   byte-identical to a direct `retrieve()` call for the same query.
8. **Nonsense query** — never throws. (Corrected during red: the draft
   asserted zero chunks, but `retrieve()` max-normalizes the vector signal,
   so a non-empty index always scores something — the playground must mirror
   that honestly, not hide it. What a nonsense query returns is `retrieve()`'s
   contract, not the playground's.)
9. **Cleanup** — chunk/mention counts return to baseline.

Secondary guards (not proof):
- `npx tsc --noEmit` clean on touched scope.
- `npx next lint` clean on touched files.

## Environment And Data
- Local dev Postgres `blake-pg` via `.env` `DATABASE_URL` (Docker, port 5433).
- No network: extraction stubbed, and the proof deletes `VOYAGE_API_KEY` /
  `OPENAI_API_KEY` from its environment so embedding is the deterministic
  local model — hosted cosine scores would make the rank/graph split
  provider-dependent. The query uses only distinctive tokens so the
  graph-only source cannot earn a lexical seed slot from shared filler words.

## Anti-Gaming Constraints
- `retrievalPreview` must call the real `retrieve()` — no parallel scoring
  path, and the proof asserts provenance labels only `retrieve()` can supply.
- Assertions read `retrievalPreview` output and live DB state, never the
  fixture text directly.

## Repo Safety Gate
Command:
```bash
$HOME/.claude/scripts/gate
```

## Red Expectation
Before implementation the script fails: `retrievalPreview` is not exported by
`lib/retrieval/graph.ts`.

## Manual Gaps
- Typing in the box in a real browser needs the password-gated admin; the
  action is a thin wrapper over the proven function, same as every other
  Graph tab action.
