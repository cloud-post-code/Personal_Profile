# Proof — Ingestion source classification

## Primary proof command

```
npx tsx docs/features/ingestion-source-classification/proof.ts
```

Local dev Postgres via `.env`; no model calls. DB rows use a `proof-isc-`
key prefix and are deleted in a `finally`.

## Assertions (all must pass)

1. **Catalog**: `CLASSIFICATIONS` is exactly
   `public | contact | close-friends | personal`, each with a display label,
   and `ENABLED_CLASSIFICATIONS` is `["public"]` for now.
2. **Schema**: `IngestionSource.classification` exists and defaults to
   `public` — a row created without naming it reads back `public`.
3. **Save accepts Public**: `saveIngestionSource` with
   `classification: "public"` persists it.
4. **Save rejects garbage**: an unknown classification returns an error and
   writes nothing.
5. **Save rejects not-yet-enabled statuses**: `personal` (in the catalog but
   not enabled) returns an "only Public" error server-side.
6. **Edit round-trip**: updating a row keeps/sets classification explicitly.
7. **Selector on every form** (source-level): the manual create form, the
   builder save pane, and the edit page each render the shared
   classification selector adjacent to their Save/Create control, and the
   three server actions all forward a `classification` field.
8. **Non-public options are disabled** (source-level): the shared selector
   marks statuses outside `ENABLED_CLASSIFICATIONS` as disabled options.

## Red expectation

Before implementation, `CLASSIFICATIONS` does not exist in
`lib/ingestionSources.ts` — the import fails and the proof exits non-zero.

## Secondary checks (not proof)

- `npx tsc --noEmit`, `npx next lint`, gate PASS
- Browser: /admin/sources/new and /admin/sources/&lt;key&gt; show the selector
  next to Save with only Public choosable.
