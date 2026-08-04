# Agentic card builder: search the knowledge graph, and room to finish the card

## Problem

The card builder is the only model call on the site that cannot see the
knowledge base. `siteDataBrief()` (lib/cardBuilder.ts) runs three fixed Prisma
queries — profile, up to 20 projects, `photo.count()` — and staples the result
to every draft call. Everything the retrieval engine indexes (sources, persona
facts, project detail text, photo descriptions, approved answers) is invisible
to it, and the brief is capped at 3500 chars regardless of what the card
actually needs.

That fixed brief fails in both directions:

- **Too little.** "A card about my writing on distributed systems" gets project
  names and tags — nothing from the indexed articles that would let the model
  write real content. The brief's own rule ("never invent facts") then forces a
  thin, generic card.
- **Too much.** A card that needs one project still carries all 20 plus every
  role, spending context on data the card will not use.

Separately, coded (`type: "html"`) cards are capped at `max_tokens: 4000`. An
ambitious card — a dense grid, a large SVG, a many-row layout — runs out of
tokens mid-string, the JSON never closes, and `parseDraft()` reports "The
model's response wasn't valid JSON — try again." The retry hits the same wall,
so the failure is deterministic, not flaky. Observed live on the prompt
"Please create a Visual of my face built with numbers".

## Desired behavior

**1. The builder decides when it needs data, and searches for it.**

The drafting call gains one tool, `search_knowledge`, backed by the same
`retrieve()` the chatbot uses — hybrid BM25 + cosine with one-hop entity-graph
expansion. The model calls it when the description implies site knowledge it
does not have, with whatever query it judges useful, and may call it several
times to research different angles before drafting.

- Tool input: `{ "query": string }`.
- Tool result: the retrieved chunks and entity relation lines, formatted by the
  existing `formatContext()`, or an explicit "nothing matched" string.
- Bounded: at most `SEARCH_BUDGET` (4) searches per draft. Past the budget the
  tool returns a message telling the model to draft with what it has.
- Best-effort: a retrieval error returns a note as the tool result. The builder
  keeps drafting; a knowledge-base problem must never dead-end a card.

The existing fixed brief stays as the always-present floor — identity, project
names, roles — so a card that needs no research costs no extra calls. Search is
the depth on top, not a replacement.

**2. Coded cards get room to finish.**

Raise the drafting `max_tokens` from 4000 to 16000 so a large HTML body
completes. Applies to the whole draft call; live-data and custom cards are
unaffected in practice because they are short.

**3. The revision loop keeps the same reach.**

Feedback ("use my actual talk titles") re-enters the same tool-enabled loop, so
a revision can research too. Validation-failure self-correction is unchanged
and still capped at one corrected attempt.

## Constraints

- Follow the tool-use loop already in `lib/brain.ts` (`stop_reason`-driven,
  assistant content replayed, `tool_result` blocks fed back) rather than a new
  pattern.
- `BuilderClient` is the injectable seam used by proof and tests. It must grow
  `tools` and expose `stop_reason` without breaking the existing shape.
- No change to `parseDraft()` validation, the theme-fidelity gate, or
  `saveUiCard()`. What reaches the database is validated exactly as before.
- Admin-only path, gated by `requireAuth()` in `draftCard()`. No new surface.
- Retrieved chunk text is site-owner content, not visitor input, and is used as
  drafting material only.

## Out of scope

- Vision / image input to the builder. A real photo of the owner still cannot
  reach the model; a "portrait" card remains an abstract composition. Tracked
  separately.
- Changing the chatbot's own retrieval, ranking, or the indexer.
- Cluster overviews (`broadOverviews()`): the builder searches chunks directly.
