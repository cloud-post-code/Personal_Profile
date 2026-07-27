# Feature — "Don't merge" on suggested merges

## Why
The Suggested merges block on the Graph tab proposes duplicate pairs, but
declining one is currently "just don't click it" — the false positive
reappears on every visit, forever, cluttering the list and burying real
duplicates. The admin needs a way to say "these two are not the same thing"
once and have it stick.

## What
A **Don't merge** button next to the existing **Merge** button on each
suggestion. Clicking it persists a dismissal for that pair; the pair never
appears in `suggestedMerges()` again.

### Behavior
- Dismissals are stored by the pair of normalized entity *keys* (sorted, so
  direction doesn't matter), not entity ids. Entity rows get pruned and
  recreated as sources are re-indexed; the admin's judgment that two *names*
  are different things must survive that.
- `suggestedMerges()` filters out dismissed pairs before ranking/capping, so
  dismissing a weak suggestion lets the next-strongest one surface.
- `dismissMerge(fromId, intoId)` fails soft: missing entities or stale ids
  change nothing; repeating a dismissal is a no-op.
- The button is wired through a thin auth + revalidate server action, same as
  every other Graph tab control.

### Out of scope
- Listing or un-dismissing dismissed pairs (if a dismissal was wrong, the
  manual rename-onto-existing-name merge path still works).
- Renaming an entity changes its key, so a previously dismissed pair may
  resurface under the new name — accepted; the dismissal was about the old
  name.

## Constraints
- New Prisma model only (`MergeDismissal`); no changes to existing models, and
  the datasource stays `provider = "postgresql"` (Railway deploys run
  `prisma db push` on start, which picks the table up automatically).
- No new dependencies.
