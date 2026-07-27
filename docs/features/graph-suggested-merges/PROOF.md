# Proof — Suggested merges on the Graph tab

## Definition Of Done
- `suggestedMerges()` finds containment and shared-neighbor duplicate pairs in
  the live graph, with the higher-mention entity proposed as survivor, deduped
  per unordered pair, and never suggests unrelated or sub-4-character pairs.
- `mergeEntities(fromId, intoId)` performs the one-click merge through the
  existing `mergeInto` machinery and fails soft on stale ids.
- The Entities pane renders the suggestions with a Merge button wired to a thin
  auth + revalidate server action.

## Primary Proof
Type: integration (internal contract against the real DB layer — same pattern
as every other proof in this repo)

Command:
```bash
npx tsx docs/features/graph-suggested-merges/proof.ts
```

Runs against the local dev Postgres (`blake-pg`, from `.env` `DATABASE_URL`);
the script loads `.env` itself. It seeds throwaway sources (ids prefixed
`mergeproof`), exercises the real `lib/retrieval/graph.ts` code path, asserts,
and cleans up. Entity extraction is injected as a deterministic stub so the
proof makes zero Anthropic calls.

Expected evidence (all assertions green):
1. **Containment pair suggested** — "Brambleworks" / "Bramble Works Ltd"
   (condensed keys `brambleworks` ⊂ `brambleworksltd`) is suggested with a
   containment reason.
2. **Shared-neighbor pair suggested** — "Kestrel Labs" / "Kestrel
   Laboratories" (no condensed containment, ≥ 2 common neighbors, Jaccard
   ≥ 0.5, shared word "kestrel") is suggested with a neighbor reason.
3. **Negatives** — an unrelated entity pairs with nothing; a containment whose
   shorter condensed key is under 4 characters is not suggested; two entities
   sharing 2 neighbors at Jaccard 0.5 but no name word ("Glimmer Foundry" /
   "Peatlight Archive") are not suggested.
4. **Direction** — the suggested survivor (`into`) is the entity with more
   mentions.
5. **Pair dedup** — each unordered pair appears at most once.
6. **One-click merge** — `mergeEntities` moves mentions to the survivor,
   rewires edges (duplicates collapse), deletes the merged-away row, and the
   pair no longer appears in `suggestedMerges()`.
7. **Fail-soft** — `mergeEntities` returns false for a missing entity id and
   for `fromId === intoId`, changing nothing.
8. **Cleanup** — deleting the seeded sources returns chunk/mention/entity
   counts to baseline.

Secondary guards (not proof):
- `npx tsc --noEmit` clean.
- `npx next lint` clean on touched files.
- Server-rendered admin markup contains the Suggested merges block when
  suggestions exist (manual gap below — admin is password-gated).

## Environment And Data
- Local dev Postgres `blake-pg` reachable via `.env` `DATABASE_URL`
  (Docker, port 5433 — separate data from prod).
- No network: extraction stubbed, embeddings fall back to the local hashed
  model when no provider key is set; nothing in the proof depends on either.

## Anti-Gaming Constraints
- The proof drives the real `indexSource` → Prisma → `suggestedMerges` /
  `mergeEntities` path; only the outermost extraction call is stubbed.
- No assertion may be satisfied by reading the seeded fixture back — every
  positive assertion goes through `suggestedMerges()` output or post-merge DB
  state.
- `PROOF.md` and the assertions must not be weakened to pass.

## Repo Safety Gate
Command:
```bash
$HOME/.claude/scripts/gate
```

## Red Expectation
Before implementation the script fails at import time:
`suggestedMerges` / `mergeEntities` are not exported by
`lib/retrieval/graph.ts`.

## Manual Gaps
- Clicking the Merge button in a real browser needs the password-gated admin;
  Claude does not enter credentials. The server action is a thin wrapper over
  the proven `mergeEntities`, same as every other Graph tab action.
