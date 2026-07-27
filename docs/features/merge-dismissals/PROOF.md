# Proof — "Don't merge" on suggested merges

## Definition Of Done
- `dismissMerge(fromId, intoId)` persists a direction-agnostic dismissal for
  the pair's normalized keys and fails soft on stale/missing ids.
- `suggestedMerges()` never returns a dismissed pair, in either direction, and
  the dismissal survives the entity rows being deleted and recreated (new
  ids, same names).
- The Suggested merges block renders a **Don't merge** button per pair wired
  to a thin auth + revalidate server action.

## Primary Proof
Type: integration (internal contract against the real DB layer — same pattern
as every other proof in this repo)

Command:
```bash
npx tsx docs/features/merge-dismissals/proof.ts
```

Runs against the local dev Postgres (`blake-pg`, from `.env` `DATABASE_URL`);
the script loads `.env` itself. It seeds throwaway entities (containment pair
"Brackenvale" / "Brackenvale Collective", plus an unrelated control pair),
exercises the real `lib/retrieval/graph.ts` path, asserts, and cleans up.
Zero Anthropic calls, zero embeddings.

Expected evidence (all assertions green):
1. **Baseline** — the seeded containment pair is suggested by
   `suggestedMerges()`.
2. **Dismissal hides the pair** — after `dismissMerge`, the pair appears in
   neither direction; the unrelated control pair is still suggested.
3. **Idempotent + fail-soft** — repeating the dismissal returns true and
   changes nothing; a missing id or `fromId === intoId` returns false and
   writes no row.
4. **Survives id churn** — deleting both entity rows and recreating them with
   the same names (new ids) still yields no suggestion for the pair.
5. **Cleanup** — seeded entities and dismissal rows are removed; entity and
   dismissal counts return to baseline.

Secondary guards (not proof):
- `npx tsc --noEmit` clean.
- `npx next lint` clean on touched files.

## Environment And Data
- Local dev Postgres `blake-pg` reachable via `.env` `DATABASE_URL`
  (Docker, port 5433 — separate data from prod).
- `npx prisma db push` applied so the `MergeDismissal` table exists locally
  (prod applies it automatically via the start command).

## Anti-Gaming Constraints
- Assertions go through the real `suggestedMerges()` / `dismissMerge()`
  exports and post-state in the DB — never by reading the fixture back.
- `PROOF.md` and the assertions must not be weakened to pass.

## Repo Safety Gate
Command:
```bash
$HOME/.claude/scripts/gate
```

## Red Expectation
Before implementation the script fails at import time: `dismissMerge` is not
exported by `lib/retrieval/graph.ts`.

## Manual Gaps
- Clicking the button in a real browser needs the password-gated admin;
  Claude does not enter credentials. The server action is a thin wrapper over
  the proven `dismissMerge`, same as every other Graph tab action.
