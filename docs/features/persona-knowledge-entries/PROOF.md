# Proof — Persona knowledge entries

## Primary proof command
```
npx tsx docs/features/persona-knowledge-entries/proof.ts
```
Runs against the local dev Postgres (`blake-pg`, from `.env` `DATABASE_URL`);
the script loads `.env` itself.

**Fully offline.** Both model calls are injected — the splitter goes in through
`PersonaIndexOpts.split`, wrapping the real `splitPersonaFacts` around a fake
`FactClient` so the parsing and sanitizing code is genuinely exercised; entity
extraction goes in through `IndexOpts.extract` — and
`VOYAGE_API_KEY`/`OPENAI_API_KEY` are set to `""` so the deterministic local
embedder runs. They are set to `""` rather than deleted because Prisma Client
loads `.env` itself when imported, which would re-populate a deleted key and
send the proof at the real embeddings API. One assertion checks the stored
`embedModel` is `local-hash-256-v1`, so the proof fails loudly if it ever starts
making network calls again.

It snapshots the real Profile row, and on the way out drops every persona
origin, deletes the two entities it invented, and restores the snapshot.

## Assertions (all must pass)
1. **`slugify`** — produces a filename-safe id, strips punctuation and repeated
   separators, and returns `""` for a topic with no usable characters.
2. **`sanitizeFacts` trusts nothing** — caps at `MAX_FACTS`, accepts a bare
   array as well as `{facts:[…]}`, drops entries whose topic yields no slug or
   whose text is too short to be a claim, dedupes colliding slugs, coerces
   non-string fields, and returns `[]` for `null`/`undefined`/numbers/strings/
   wrong-typed `facts`.
3. **Guards and downgrades** — prose under `MIN_SPLIT_CHARS` is not split *and
   costs no model call*; JSON wrapped in prose and fences parses; malformed
   JSON, an empty completion, a provider failure, and a missing
   `ANTHROPIC_API_KEY` each downgrade to `[]` rather than throwing.
4. **One origin per claim** — a 3-claim split writes 3 persona origins, all ids
   prefixed `fact:`, no whole-paragraph origin present, entity extraction run
   once per claim, each origin labeled `Persona — <topic>`, and the indexed
   chunk text is the claim's text.
5. **Per-claim graph ownership** — the three claims own edges under three
   distinct `EntityEdgeOrigin.originId` values.
6. **A shrinking claim set is swept** — re-indexing with 2 of the 3 claims
   leaves 2 origins, the dropped one is the one removed, and its edge ownership
   is retracted.
7. **A rewritten persona keeps only the new claims** — replacing the paragraph
   entirely leaves exactly the new origin ids, no chunk anywhere retains text
   from the replaced persona, the new claims are what is indexed, and the
   replaced claims own no edges.
8. **Failed split falls back** — with the splitter throwing, exactly one
   `persona` origin exists and carries the whole paragraph; the previous fact
   origins are swept.
9. **The always-on prompt is unaffected** — `buildSystemPrompt()` still
   contains the full paragraph verbatim.
10. **Emptying the persona leaves nothing** — zero persona chunks and zero
    persona edge ownership rows.
11. **Restore** — the Profile row is returned to its pre-proof state.

## Red expectation
Before implementation the script fails at import time (`lib/personaFacts` does
not exist, and `origins.ts` exports neither `PERSONA_WHOLE_ID` nor
`PERSONA_FACT_PREFIX`).

## Secondary checks (not proof)
- `npx tsc --noEmit` clean.
- `npx next lint` clean on `lib/personaFacts.ts` and `lib/retrieval/origins.ts`.
- `$HOME/.claude/scripts/gate` PASS.
- `docs/features/persona-sections/proof.ts` and
  `docs/features/universal-knowledge-index/proof.ts` still green — the latter
  asserts persona text stays retrievable, which the split must not break.
