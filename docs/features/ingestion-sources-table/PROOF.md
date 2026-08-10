# Proof — Ingestion sources as data

## Primary proof command

```
npx tsx docs/features/ingestion-sources-table/proof.ts
```

Runs against the local dev Postgres via `.env` (the script loads it itself,
never overriding already-set values). No model calls. Every row the proof
creates uses a `proof-ing-` key prefix and is deleted in a `finally`; the
seed check snapshots the table count first and only exercises
seed-into-empty semantics indirectly (idempotence on a non-empty table).

## Assertions (all must pass)

1. **`STARTER_INGESTION_SOURCES` defines exactly the seven tabs in display
   order** `experience, projects, links, pdfs, text, photos, persona` — the
   codes the dashboard vocabulary uses today.
2. **Every starter carries the full contract**: non-empty `label`,
   `systemPrompt`, `uploadMethod` from the closed vocabulary, `storageKinds`
   from `text | image | text+image`, non-empty `outputMethod`.
3. **`seedStarterIngestionSources()` on a non-empty table changes nothing**
   — row count identical before/after, so deletions are never resurrected.
4. **`saveIngestionSource` rejects an unknown `uploadMethod`** with an error
   string, and rejects an unknown `storageKinds`.
5. **A blank key is derived from the label and slugified**; a colliding key
   for a NEW row gets a `-2` suffix instead of overwriting the owner.
6. **New rows append at `max(order)+1`** and `listIngestionSources()` returns
   rows ordered by `order` ascending.
7. **`deleteIngestionSource` removes the row** — a subsequent list does not
   contain it.

## Red expectation

Before implementation, `import { listIngestionSources } from
"@/lib/ingestionSources"` fails (module does not exist), and Prisma has no
`ingestionSource` delegate — the proof exits non-zero.

## Secondary checks (not proof)

- `npx tsc --noEmit`
- `npx next lint`
- `$HOME/.claude/scripts/gate` PASS
