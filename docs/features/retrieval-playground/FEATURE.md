# Feature — Retrieval playground on the Graph tab

## Why
The graph's faults are invisible in chat: when the bot gives a weak answer,
there is no way to see whether retrieval fed it the wrong chunks, missed a
relation, or matched nothing at all (`lib/retrieval/graph.ts` exists because
those faults "are invisible in chat"). Tuning by re-asking the chatbot is
guesswork. The admin needs to see exactly what `retrieve()` returns for a
question — then graph edits become observation-driven.

## What
A **Test retrieval** box on the Graph tab: type a question, see what the
chatbot would be given for it.

### Shown per query
- Every retrieved chunk with its origin label, blended score, and how it got
  in — **ranked** (lexical + vector seed) or **via graph** (one-hop entity
  expansion).
- The relation lines that would be attached as KNOWN RELATIONSHIPS.
- Which entities were recognized in the question itself (the exact key match
  `retrieve()` uses for expansion seeds) — the clearest signal of whether the
  graph "sees" the question.
- Honest empty states: nothing indexed yet, or nothing matched.

### Behavior
- Read-only — running a query changes nothing.
- Uses the real `retrieve()` with its default knobs, so what the playground
  shows is what chat gets. No second retrieval code path.
- Blank input is a no-op.

## Boundaries
- Logic lives in `lib/retrieval/graph.ts` (`retrievalPreview`) with the other
  admin read helpers, so it is testable without a request context. The server
  action is a thin auth wrapper; the input box is a small client component on
  the Graph tab.
- No persistence, no query log (the Activity tab already logs real visitor
  questions), no tuning knobs in the UI in this iteration.

## Acceptance
- A query matching indexed text returns its chunk marked `rank` with a
  positive score; a fact reachable only through an entity edge arrives marked
  `graph`.
- Relations and recognized-entity names are reported.
- The preview is byte-identical to what `retrieve()` returns for the same
  query — including weakly-related chunks a nonsense query can still score,
  which the playground shows honestly rather than hiding.
- Blank input is a no-op; an unindexed corpus is reported as such.
- Seeds render before graph hops, mirroring prompt assembly order.
