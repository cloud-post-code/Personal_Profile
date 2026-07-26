# Feature — The Answers tab writes its own first draft

## Summary
Today the "Answers" tab opens on five blank rows. Every one of them is a chore
Blake has to sit down and write, and until he does, each starter chip costs a
model call on every page view — the tab's whole reason for existing is deferred
until he types.

The knowledge base already contains the answer to "What's your background and
past experience?". So the tab should write its own first draft from that
knowledge, in Blake's voice, and hand him a filled-in form to edit instead of an
empty one.

A draft is served to visitors the moment it exists. That is not a compromise:
the draft is produced by the same retrieval + persona prompt the chatbot would
have used to answer that exact question anyway, so serving it is the same answer
the visitor was going to get — only instant and free. The row is visibly marked
as unreviewed until Blake saves it, so the tab becomes a review queue rather
than a to-do list.

## Desired Behavior
- Opening the Answers tab drafts every row that has a blank answer and has
  never been drafted before, then shows the drafts already filled into the form.
- A drafted row is live immediately: the matching question is served from the
  database with zero model calls, exactly like a hand-written row.
- A drafted row is labeled as an unreviewed AI draft, and the tab header counts
  how many are still unreviewed.
- Saving a row through the form marks it reviewed — it is Blake's answer now,
  whether or not he changed a word.
- Every row has a "Redraft" button that throws away the current text and asks
  for a new draft, for when the knowledge base has improved since.
- Drafting never blocks or breaks the dashboard: if the model call fails, or no
  API key is configured, the row stays blank and the tab renders as it does today.

## Scope
- `CannedAnswer` gains two columns: whether the current text is an unreviewed AI
  draft, and when the row was last drafted.
- A new module owns draft generation, reusing `buildSystemPrompt(question)` so a
  draft is written from real retrieved knowledge and the real persona.
- The automatic pass runs when the Answers tab loads, over blank rows only.
- `app/admin/AnswersPanel.tsx`: draft badge, unreviewed count, Redraft button.
- Server actions for redrafting, as thin auth wrappers.

## Non-Goals
- No change to how visitor questions are matched — still normalized string
  equality, still nothing fuzzy.
- No change to `lib/brain.ts` or the wire protocol. A drafted answer is
  indistinguishable from a hand-written one at serve time.
- No scheduled or background re-drafting when the knowledge base changes.
  Redrafting is a button, not a watcher.
- No drafting of the question text — Blake or the starter list owns the questions.
- No second model tier: drafts come from `claudeModel()`, like everything else.

## Scenarios
- **First open.** The five seeded starters are blank and never drafted. The tab
  drafts all five, renders them filled in and marked unreviewed, and the header
  reads five unreviewed. Clicking a starter chip on the public site returns the
  drafted text instantly, with no model call, and increments `hits`.
- **Second open.** Nothing is blank-and-undrafted, so no model call is made and
  no existing text is touched.
- **Blake edits and saves.** The row loses its unreviewed mark and the header
  count drops. It is never auto-drafted again.
- **Blake clears an answer and saves.** The row is blank again, but it has been
  drafted before, so the automatic pass leaves it alone — a deliberately emptied
  row stays empty and falls through to the model.
- **Blake adds a new question and leaves the answer blank.** The next tab load
  drafts it.
- **Redraft.** Clicking Redraft on any row replaces its text with a fresh draft
  and marks it unreviewed, including on a row Blake had already reviewed.
- **No API key / model failure.** The drafting pass swallows the error; the row
  is left blank and undrafted so a later load can retry, and the dashboard
  renders normally.
- **A slow pass.** Drafting runs longer than the deadline: the tab renders with
  the rows that finished, the rest arrive on a later load, and no draft is lost.

## Constraints
- Schema stays `provider = "postgresql"` (Railway deploys from it).
- Serving logic is unchanged: a row is served when it is enabled and its answer
  is non-empty. "Unreviewed" is an admin-facing distinction only.
- Drafting is bounded per tab load — the rows in a pass go out together so Blake
  isn't watching a blank dashboard, but a pass never exceeds a fixed cap,
  however long the question list grows.
- A pass has a deadline. Drafting runs retrieval, retrieval embeds, and the
  embedding provider rate-limits, so a batch can take half a minute; past the
  deadline the page stops waiting for it. In-flight drafts still finish and
  store themselves, and a later load picks up whatever missed the deadline.
- A row is auto-drafted at most once, ever. The record of having been drafted
  survives Blake blanking the text.
- Draft generation lives in `lib/`, not in the admin components or actions, so
  it is testable with an injected model client the way `lib/brain.ts` is.
- Generation failures are swallowed at the dashboard boundary; a broken model
  must never take down the admin.

## Implementation Routing
- Required skills: coding-frontend (admin tab + server actions), coding-proof-author
