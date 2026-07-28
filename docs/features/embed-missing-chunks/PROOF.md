# Proof — Embed only the chunks that have no embedding

## Definition Of Done
- `embedMissingChunks` finds every `embedding IS NULL` chunk, embeds it in
  batches with the current model, writes vector + `embedModel` back, and
  returns `{ attempted, embedded, model }`.
- Already-embedded chunks are untouched, bytes and `embedModel` alike.
- A provider that returns no vectors leaves those rows null, reports
  `embedded = 0`, and does not throw.
- The Graph tab's missing-embedding notice offers a button that runs it
  through an auth-wrapped server action.

## Primary Proof
Type: integration against the local dev Postgres (the same offline pattern
every other proof in this repo uses)

Command:
```bash
npx tsx docs/features/embed-missing-chunks/proof.ts
```

Loads `.env` itself and pins the deterministic local embedder by deleting the
provider keys AFTER imports (Prisma re-loads `.env`). Zero network calls, zero
Anthropic calls. Seeds chunks under `originKind: "embedproof"`.

Expected evidence (all assertions green):
1. **Backfill** — three seeded null-embedding chunks are all embedded;
   `attempted`/`embedded` match the real null count and `model` is the local
   embedder.
2. **Batching** — run with `batchSize: 2` over 3 chunks, so passing requires
   the loop to advance past the first batch.
3. **Vector fidelity** — each stored vector has cosine > 0.999 against a
   fresh embedding of *that chunk's own text* (proves the right text was
   embedded onto the right row, not a placeholder), and two different chunks
   have cosine < 0.999 against each other (guards against writing one vector
   to every row).
4. **Already-embedded untouched** — a sentinel chunk carrying
   `embedModel: "sentinel-model-v0"` keeps its exact bytes and its model
   name, proving the backfill is not a silent migration.
5. **Stats** — `graphStats().chunksWithoutEmbedding` is 0 afterwards.
6. **Idempotent** — a second run reports `attempted = 0, embedded = 0` and
   changes nothing.
7. **Fail-soft** — one chunk is reset to null and the backfill is run with a
   stub embedder returning all-null vectors (exactly what the real
   `embedTexts` returns on provider failure): it returns
   `attempted = 1, embedded = 0`, leaves the row null, and does not throw.
8. **Cleanup** — seeded chunks removed; total chunk count back to baseline.

Secondary guards (not proof):
- `npx tsc --noEmit` clean; `npx next lint` clean on touched files.
- `docs/features/knowledge-graph-admin/proof.ts` still green (`graphStats`
  is on this path).

## Environment And Data
- Local dev Postgres `blake-pg` via `.env` (Docker, port 5433).
- The backfill is global by design, so the run also embeds any *real*
  unembedded chunks present in the dev DB. That is the intended production
  behavior and is not destructive — no text, mention, entity or edge is
  touched — but it means the "0 unembedded" assertion is a statement about
  the whole dev index, not just the seeded rows.

## Anti-Gaming Constraints
- Only the outermost boundary (the embedder) is injectable, and it is
  injected in exactly one assertion — the provider-failure case. Every other
  assertion runs the real `embedTexts` through the real local embedder and
  the real Prisma writes.
- Vector correctness is asserted by re-embedding each chunk's own text and
  comparing, not by checking that the column is merely non-null.
- The untouched-chunk assertion compares raw bytes, not just presence.

## Repo Safety Gate
Command:
```bash
$HOME/.claude/scripts/gate
```

## Red Expectation
Before implementation the script fails at import: `embedMissingChunks` is not
exported from `lib/retrieval/indexer.ts`.

## Manual Gaps
- The button is not clicked in a browser (admin is password-gated); the
  action is a thin auth wrapper over the proven function, matching
  `rebuildOverviews`.
- Real provider behavior (Voyage/OpenAI) is unproven by design — the local
  embedder is pinned so the proof stays offline and deterministic.
