# Proof — Unified ingested items

## Primary proof command

```
npx tsx docs/features/unified-ingested-items/proof.ts
```

Runs against the local dev Postgres via `.env`. No model calls. Seeds rows
with `proof-uni-` markers (Source, Photo, Project) and snapshots/restores
nothing else; all seeded rows are deleted in a `finally`.

## Assertions (all must pass)

1. **Every item from every source key has `kind` `"text"` or `"image"`** and
   the invariant `kind === "image" ⟺ imageUrl !== null` holds.
2. **`links` returns the seeded link Source as a text item** and does not
   return pdf/text/custom rows.
3. **`pdfs` returns the seeded pdf Source**; **`text` returns the seeded
   pasted-text Source** and excludes the custom-marked (`ingest:*`) row.
4. **`photos` returns the seeded Photo as an image item** whose `text` is the
   stored description and whose `imageUrl` points at the uploads route.
5. **`projects` returns a text item for the seeded project and an image item
   for its image**.
6. **A custom key returns exactly its own marked rows** — the `ingest:<key>`
   Source as text and the `ingest:<key>` Photo as image.
7. **Malformed `Profile.experience` JSON degrades to an empty list**, not a
   crash (checked via the exported pure parser on a bad string).

## Red expectation

Before implementation, `lib/ingestedItems.ts` does not exist — the import
fails and the proof exits non-zero.

## Secondary checks (not proof)

- `npx tsc --noEmit`, `npx next lint`, gate PASS
