# Proof — Feed known entity names into the extraction prompt

## Definition Of Done
- `buildExtractionPrompt(text, title, known)` is the single prompt builder
  used by `extractEntities`. With known names it contains each name verbatim
  plus the reuse instruction; with an empty list the block is absent; the
  block caps at 200 names.
- `indexOrigin` passes the current entity names (most-mentioned first) to the
  extractor as a third argument, and indexing still succeeds when that lookup
  can only return an empty list.

## Primary Proof
Type: integration (internal contract against the real DB layer — same pattern
as every other proof in this repo)

Command:
```bash
npx tsx docs/features/known-entities-in-extraction/proof.ts
```

Runs against the local dev Postgres (`blake-pg`, from `.env` `DATABASE_URL`);
the script loads `.env` itself. It seeds throwaway sources (ids prefixed
`knownproof`), exercises the real `indexSource` → extractor path with a
capturing stub, asserts, and cleans up. Zero Anthropic calls.

Expected evidence (all assertions green):
1. **No block when empty** — `buildExtractionPrompt(text, title, [])` does not
   contain the known-entities instruction.
2. **Names verbatim + instruction** — with `["Kelpgrove Studio", "Next.js"]`
   the prompt contains both names exactly and the reuse instruction.
3. **Cap** — with 250 generated names, name #200 appears and name #201 does
   not.
4. **Indexer passes known names** — after a first source creates entities, a
   capturing stub extractor on a second source receives a list including the
   first source's entity names.
5. **Mention-weighted order** — the entity with more chunk mentions appears
   before the one with fewer in the list handed to the stub.
6. **First-ingest empty list** — with no entities in the DB (fresh baseline
   scope), the stub receives an empty (or entity-free) list and indexing still
   writes chunks.
7. **Cleanup** — deleting the seeded sources returns chunk/entity counts to
   baseline.

Secondary guards (not proof):
- `npx tsc --noEmit` clean.
- `npx next lint` clean on touched files.

## Environment And Data
- Local dev Postgres `blake-pg` reachable via `.env` `DATABASE_URL`
  (Docker, port 5433 — separate data from prod).
- No network: extraction stubbed; embeddings fall back to the local hashed
  model when no provider key is set.

## Anti-Gaming Constraints
- Assertion 4–6 must drive the real `indexSource` → `indexOrigin` path; only
  the outermost extraction call is stubbed (via the existing `IndexOpts`
  injection point).
- The prompt assertions must run against the same builder `extractEntities`
  actually calls, not a copy.
- `PROOF.md` and the assertions must not be weakened to pass.

## Repo Safety Gate
Command:
```bash
$HOME/.claude/scripts/gate
```

## Red Expectation
Before implementation the script fails at import time:
`buildExtractionPrompt` is not exported by `lib/retrieval/entities.ts`.

## Manual Gaps
- Whether Claude actually obeys the reuse instruction is a model-behavior
  question and not deterministically provable; the proof pins the contract
  (names reach the prompt, indexer supplies them) which is everything the code
  controls.
