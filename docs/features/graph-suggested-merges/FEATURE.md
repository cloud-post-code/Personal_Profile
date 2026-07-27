# Feature — Suggested merges on the Graph tab

## Why
The main cleanup path on the Graph tab is merging duplicate entities — the
extractor routinely produces "Blake" and "Blake Mauri", or "Brambleworks" and
"Bramble Works Ltd", as separate nodes, which fragments mentions and edges and
weakens one-hop expansion in `lib/retrieval/search.ts`. Today finding those
pairs means the admin scanning the whole entity list by eye and typing one name
onto the other. The data to find them automatically is already in the graph.

## What
A **Suggested merges** block on the Graph tab's Entities pane: likely-duplicate
pairs computed from the graph itself, each with a one-click **Merge** button
that runs the existing merge machinery.

### Detection (two signals, both cheap and explainable)
- **Name containment** — one entity's normalized key, condensed to
  alphanumerics, is a substring of the other's (`brambleworks` ⊂
  `brambleworksltd`, `blake` ⊂ `blakemauri`). The shorter condensed key must be
  at least 4 characters, so junk pairs like "AI" ⊂ "AI Safety" don't fire.
- **Shared neighbors** — two entities whose edge-neighbor sets mostly overlap
  (Jaccard ≥ 0.5 with at least 2 shared neighbors, both having ≥ 2 neighbors)
  AND that share a name word of 3+ characters. Catches duplicates containment
  misses ("Kestrel Labs" / "Kestrel Laboratories"). The shared-word requirement
  is deliberate: in this graph nearly everything neighbors Blake, so neighbor
  overlap alone would pair unrelated skills and projects ("TypeScript" /
  "React") and a one-click merge of a false positive is worse than a missed
  suggestion.

### Presentation
- Each suggestion names both entities, shows the human-readable reason, and
  proposes a direction: the entity with more mentions survives (tie broken by
  edge count, then longer name — fuller names are usually the canonical ones).
- One **Merge** button per pair. Merging reuses the existing `mergeInto` path:
  mentions move, edges rewire, duplicates collapse, self-loops drop, edge
  ownership carries over.
- Each unordered pair appears once; containment wins as the reason when both
  signals fire. Capped at 20 suggestions, strongest first.
- No suggestions → the block doesn't render. Declining a suggestion is simply
  not clicking it; there is no persisted dismissal in this iteration.

## Boundaries
- No LLM call, no embedding math — suggestions are pure graph/string
  computation, so the list is deterministic and free.
- Detection and merge logic live in `lib/retrieval/graph.ts` (testable, no
  request context); the server action in `app/admin/actions.ts` stays a thin
  auth + revalidate wrapper; the UI lives in the existing
  `app/admin/GraphView.tsx` Entities pane.
- Merging is the existing semantic, unchanged. No new tables, no migration.

## Acceptance
- A containment pair and a shared-neighbor pair are both suggested; unrelated
  entities are not; sub-4-character containments are not.
- The proposed survivor is the higher-mention entity.
- One-click merge removes the merged-away entity, moves its mentions, rewires
  its edges, and the pair disappears from the suggestions.
- Merging two entities that were already merged (stale form resubmit) fails
  soft — no throw, nothing changed.
