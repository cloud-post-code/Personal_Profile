# Feature — Canned answers in front of the model, and a brain the route doesn't own

## Why
Every visitor message costs a model call, including the five starter chips that
ask the same five questions forever. Those answers never change, so paying Haiku
to re-derive them on every page view is pure waste — and it is the *first*
impression, so it is also the slowest part of the site.

Separately, the chat brain lives inside `app/api/chat/route.ts`: the tool
catalogue, `hydrate()`, and the streaming tool loop are all wired to a `Request`
and a `ReadableStream`. Nothing else can reach the chatbot without duplicating
that file. A second channel (WhatsApp) would mean a second copy of the brain.

## What

### 1. A pre-model answer table
A new `CannedAnswer` row holds a question, a hand-written answer, and optionally
one UI card. When an incoming message matches a canned question, the answer is
served **with zero API calls** — no classifier, no model, no retrieval.

Matching is plain normalized string equality: lowercase, collapse internal
whitespace, strip surrounding whitespace and trailing `?`/`.`/`!`. Nothing
fuzzy. A near-miss falls through to Haiku, which is the safe direction to fail:
the worst case of a miss is today's cost, while the worst case of a loose match
is the wrong answer.

Cards are named by the tool that would have rendered them, so a canned answer
reuses the same `hydrate()` the model path uses. Without this the
"What are your recent projects?" chip regresses from cards to plain prose.

| Column | Purpose |
|---|---|
| `question` | The text as written, shown in the admin list |
| `matchKey` | The normalized form, unique — the actual lookup key |
| `answer` | Hand-written response text; empty means inactive |
| `cardTool` | `show_projects` / `show_project` / `show_gallery` / `show_contact_form`, or null |
| `cardInput` | JSON args for that tool (`{"id":"…"}`, `{"layout":"filmstrip"}`) |
| `enabled` | Off without deleting the text |
| `hits` | Times served — the running count of model calls avoided |

An answer is served only when `enabled` **and** `answer` is non-empty. A row
with a blank answer is a to-do, not a broken response.

### 2. A new admin tab
"Answers" — a list of canned Q&As with the five starter questions pre-created
(question filled, answer blank) so the tab opens with an obvious to-do list
rather than an empty state. Each row edits question, answer, card, enabled.
Rows can be added and deleted. The tab header states how many starters are
still unanswered and how many model calls the table has saved.

### 3. The brain moves to `lib/brain.ts`
`answer({ message, history, sessionId, channel })` becomes the one entry point
to the chatbot, returning an async iterable of the same two events the client
already understands:

```
{ t: "text",  v: string }   incremental (or whole) assistant text
{ t: "card",  v: UiBlock }  a hydrated UI block
```

The brain owns: canned lookup → retrieval → system prompt → Claude stream →
tool loop → `recordTurn`. `app/api/chat/route.ts` is left with request parsing,
NDJSON encoding, and HTTP status codes.

`channel` (`"web"` today) decides whether cards are emitted at all: web renders
them, anything else gets text only until it is taught to draw them. A later
channel therefore needs a transport, not a second brain.

## Boundaries
- Only two tiers: canned, and Haiku. No classifier call, no escalation, no
  second model — `claudeModel()` stays the single model accessor.
- The NDJSON line protocol and `app/Chat.tsx` are unchanged. A canned answer is
  indistinguishable from a model answer on the wire.
- Canned answers are still recorded through `recordTurn`, so the Activity tab
  and its metrics stay complete. The brain awaits that write before its stream
  ends — it happens after the last token, so it costs the visitor nothing, and
  it makes the activity log observable rather than racy.
- A canned answer ignores conversation history by design — it is a fixed
  response to a fixed question.
- Schema stays `provider = "postgresql"` (Railway deploys from it).
- Starter chips keep coming from `lib/theme.ts`. Making the chip row itself
  database-driven is out of scope.
- Two rows can never claim the same question. Saving onto an existing one
  merges into it rather than erroring, matching how the Graph tab handles
  renaming an entity onto an existing name.
- The starters are seeded only into an empty table, so a starter that gets
  deleted stays deleted.

## Non-Goals
- No WhatsApp channel in this feature — only the seam that makes one cheap.
- No fuzzy/semantic matching of visitor questions to canned answers.
- No auto-generation of canned answers from the model or from rated activity.
- No change to retrieval, embeddings, or the knowledge graph.

## Acceptance
- Clicking a starter chip whose canned answer is filled in returns the exact
  stored text and makes no Anthropic request.
- The projects starter still renders project cards when its canned answer names
  `show_projects`.
- A question that differs from a canned question by more than case, spacing, or
  trailing punctuation goes to Haiku.
- A canned row with `enabled = false`, or with an empty answer, falls through to
  Haiku rather than returning nothing.
- Canned turns appear in the Activity tab exactly like model turns.
- `app/api/chat/route.ts` contains no tool catalogue, no `hydrate()`, and no
  Anthropic import; deleting `lib/brain.ts` breaks the route at import time.
- Serving a canned answer increments its `hits`.

## Implementation Routing
- Required skills: coding-frontend (admin tab + route wiring), coding-proof-author
