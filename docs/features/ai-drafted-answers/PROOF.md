# Proof — The Answers tab writes its own first draft

## Definition Of Done
- A blank, never-drafted row is filled by exactly one model call, and the text
  comes from the real retrieval + persona prompt, not a template.
- A drafted row is served to visitors immediately, with **zero** model calls,
  exactly like a hand-written row, and increments `hits`.
- The automatic pass is once-per-row forever: a second load makes no call, and a
  row Blake deliberately blanked is never refilled.
- A row Blake wrote himself is never overwritten by the automatic pass.
- Saving through the admin form clears the unreviewed mark; Redraft sets it.
- A model failure leaves the row blank and retryable and never propagates out of
  the drafting pass, so the dashboard still renders.
- The rendered Answers tab shows the draft text in the form, the unreviewed
  mark, and a Redraft control.
- No regression in the existing canned-answer behavior, and the database returns
  to its pre-run baseline.

## Primary Proof
Type: integration (internal contract — the feature's whole claim is about what
does and does not reach the model, which is only observable at the provider
boundary; plus a server-render assertion of the admin surface)

Command:
```bash
npx tsx docs/features/ai-drafted-answers/proof.ts
```

Runs against local dev Postgres (`blake-pg`, `DATABASE_URL` from `.env`); the
script loads `.env` itself. It seeds throwaway `CannedAnswer` and `Project` rows
(ids prefixed `draftproof`), drives the real drafting pass, the real
`saveCannedAnswer`, and the real `answer()` brain, renders the real
`AnswersPanel`, asserts, then deletes everything it made.

### Assertions (all must pass)
1. **Blank row gets drafted** — a blank, never-drafted row comes back with the
   double's text, `aiDraft = true`, and `draftedAt` set, from exactly **1** call.
2. **The draft is written from real knowledge** — the system prompt the double
   received contains the seeded `draftproof` project name, and the user turn
   contains the row's question. Proves generation went through
   `buildSystemPrompt(question)` and not a hardcoded string.
3. **Auto pass is once-only** — running the pass again makes **0** calls and
   leaves the drafted text byte-identical.
4. **Blake's own answers are never overwritten** — a row with text and
   `aiDraft = false` is untouched by the pass, and still `aiDraft = false`.
5. **A deliberately blanked row stays blank** — `answer = ""` with `draftedAt`
   already set draws **0** calls and remains empty, so it keeps falling through
   to the model.
6. **A draft is live immediately** — asking the brain the drafted question
   returns the drafted text verbatim with **0** model calls, and `hits`
   increments by exactly 1. This is the assertion the feature exists for.
7. **Saving reviews the row** — `saveCannedAnswer` on a drafted row clears
   `aiDraft` while `draftedAt` survives, so review neither re-drafts nor
   un-marks anything else.
8. **Redraft overwrites and re-marks** — `redraftAnswer` on a reviewed,
   hand-edited row replaces the text with a fresh draft, sets `aiDraft = true`,
   and costs exactly **1** call.
9. **Failure is contained and retryable** — with a client that throws, the pass
   resolves without throwing, the row is still blank, and `draftedAt` is still
   null so the next load retries.
10. **The pass hands the page back on its deadline** — with a client slower than
    `DRAFT_DEADLINE_MS`, the pass returns well inside a second and reports
    nothing drafted, so a slow provider cannot hold the dashboard open.
11. **An overrunning draft still lands** — the abandoned draft finishes and
    stores itself afterwards, so the deadline costs a row its place in the
    render, never its one automatic shot.
12. **Stats report unreviewed drafts** — `cannedStats` counts drafted-but-unsaved
    rows separately from live and unanswered ones.
13. **The tab renders the draft** — `renderToStaticMarkup(<AnswersPanel/>)` over
    a drafted row contains the draft text inside the answer field, exactly one
    unreviewed marker (the drafted row, not the reviewed one), and a Redraft
    control.
14. **Cleanup** — `CannedAnswer`, `Project`, `ChatSession` and `ChatMessage`
    counts return to their pre-run baseline, and any pre-existing blank rows the
    script parked to keep itself isolated are restored.

Expected evidence: every assertion prints `PASS`, followed by
`All proof assertions passed`; exit code 0.

### Secondary guards (not proof)
- `npx tsx docs/features/canned-answers-and-brain/proof.ts` still green — the
  serving path this feature feeds must not regress.
- `npx tsc --noEmit` clean.
- Schema keeps `provider = "postgresql"`.

## Environment And Data
- Local dev Postgres container `blake-pg` on port 5433, `DATABASE_URL` in `.env`.
- The two new `CannedAnswer` columns must be pushed before the run.
- No `ANTHROPIC_API_KEY` is required: every model call in the proof is served by
  an injected double.
- The script blanks `VOYAGE_API_KEY`/`OPENAI_API_KEY` for its own process, so
  retrieval runs for real on the local hashed embedder. Otherwise every run
  spends embedding quota — and waits out its rate-limit backoff — on work this
  feature makes no claim about.
- The script sets `DRAFT_DEADLINE_MS` itself: high for the behavioral
  assertions, low for the two that are about the deadline.
- The script parks any pre-existing blank rows as already-drafted for the
  duration, so it drafts only its own fixtures, and restores them on exit.

## Anti-Gaming Constraints
- The Anthropic client is injected at the **outermost provider boundary only**
  (the client object). Retrieval, prompt assembly, persistence, the brain, and
  the React render all run for real.
- "Zero calls" and "exactly one call" are counted on the double, never inferred
  from source or comments.
- The draft's provenance is asserted by inspecting the prompt the double
  received, so a hardcoded or templated answer cannot pass.
- Assertion 6 reads the text back through `answer()`, so a draft cannot pass by
  being merely stored.
- Assertion 11 renders the real component; a matching string elsewhere in the
  file cannot satisfy it.

## Repo Safety Gate
```bash
$HOME/.claude/scripts/gate
```

## Manual Gaps
- The automatic pass firing on a real dashboard load is not driven here (admin
  login required). Manual: open the Answers tab on a fresh database, confirm the
  five starters arrive filled in and marked unreviewed, then click a starter
  chip on the public site and confirm the stored text appears instantly.
