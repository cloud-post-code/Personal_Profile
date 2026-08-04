# Proof — Agentic card builder: knowledge-graph search

## Primary proof command
```
npx tsx docs/features/agentic-card-builder-search/proof.ts
```

Runs against the local dev Postgres (`DATABASE_URL` from `.env`; the script
loads `.env` itself). It seeds a throwaway source (ids prefixed `cardproof`)
whose text carries a distinctive fact that exists nowhere else in the corpus,
indexes it through the real indexer, then drives `draftUiCard()` with a
**scripted fake `BuilderClient`** — the same injection seam `answerDrafts` uses.

The fake client is scripted, not random: it asserts on what it receives and
replies with fixed content, so the proof tests the builder's real control flow
(tool loop, budget, error handling, validation, retry) without depending on
live model output. Retrieval, embedding, storage, and prompt assembly are the
real code path. Seeded rows are removed in a `finally`.

## Assertions (all must pass)

1. **Tool is offered** — the first request to the client includes a tool named
   `search_knowledge` with a `query` string parameter.
2. **Search reaches the real index** — when the fake client emits a
   `tool_use` for `search_knowledge` with a query matching the seeded
   distinctive fact, the `tool_result` fed back on the next request contains
   that fact's text. Proves the tool is wired to `retrieve()`, not a stub.
3. **Graph expansion is present** — the seeded fixture includes entity A (only
   in chunk 1), entity B (only in chunk 2), and edge A→B. A search matching
   only chunk 1 returns a result containing chunk 2's text and the relation
   line `A — rel → B`.
4. **Miss is explicit** — a search whose query matches nothing returns a
   result stating nothing matched, and drafting still completes.
5. **Draft completes after research** — after the tool turn, a valid JSON
   draft is returned by `draftUiCard()`, with `label`, a `tool` in
   `CARD_TOOLS`, and a `sampleBlock` that survives `parseSampleBlock()`.
6. **Search budget is enforced** — a client that requests `search_knowledge`
   forever gets at most 4 executed searches; the 5th tool_result tells the
   model to draft with what it has, and the call terminates rather than
   looping. Asserted on the recorded call log, and the whole assertion runs
   under a 20s guard so a regression fails loudly instead of hanging.
7. **Retrieval failure degrades, not dies** — with a `retrieve` that throws
   (injected), the tool_result is a note and the builder still returns a valid
   draft.
8. **Token ceiling raised** — every request the builder issues carries
   `max_tokens` ≥ 16000, so a large coded card can finish. (Direct regression
   for the observed "wasn't valid JSON" truncation failure.)
9. **Revision keeps the tool** — `draftUiCard({instructions, current,
   feedback})` also offers `search_knowledge`, and the replayed conversation
   contains the prior draft and the feedback text.
10. **Validation unchanged** — a scripted draft that colors text with
    `var(--primary)` is rejected and fed back with the instructive error; the
    corrected second attempt is accepted. Confirms the theme gate and the
    one-retry self-correction still work through the new loop.

## Red expectation

Before implementation the script fails at assertion 1: `draftUiCard()` sends no
`tools` field, so `search_knowledge` is absent from the request. (It cannot
fail at import time — `draftUiCard` and `BuilderClient` already exist.)

## Secondary checks (not proof)

- `npx tsc --noEmit` clean.
- `npx next lint` clean on touched files.
- `$HOME/.claude/scripts/gate` PASS.
- Manual: in the admin card builder, the prompt that previously failed
  ("a visual of my face built with numbers") now returns a rendered card.
