# Proof — Ingestion-driven dashboard

## Primary proof command

```
npx tsx docs/features/ingestion-driven-dashboard/proof.ts
```

Fully offline: exercises the pure `contentTabsFromSources` mapping and
`resolveAdminTab`, plus source-level wiring checks on the dashboard page (the
page itself needs auth + Postgres to render). No DB, no model calls.

## Assertions (all must pass)

1. **`contentTabsFromSources` maps rows in row order** to `{key, label,
   content}` entries, pairing each row with its panel by key — so DB order is
   display order.
2. **Disabled rows are dropped** from the strip.
3. **Rows with no matching panel are dropped** (a custom row cannot crash the
   dashboard before its generic panel exists).
4. **`resolveAdminTab` with a live key list** resolves a custom key into the
   Content section; **without a list** the seven built-in keys still resolve,
   legacy `knowledge` still maps to `links`, and unknown keys pass through.
5. **The wiring is real**: the starter sources are seeded at server start
   (`lib/bootstrap.ts`, run by `instrumentation.ts` — moved there by
   deploy-db-bootstrap), the dashboard calls `listIngestionSources`, renders
   `tabs={contentTabs}`, and no longer contains the hardcoded
   `label: "PDFs"` literal.
6. **The rewritten `admin-content-tabs` proof passes** against the current
   7-source world (run separately; see that PROOF.md).

## Red expectation

Before implementation, `contentTabsFromSources` does not exist — the import
fails and the proof exits non-zero.

## Secondary checks (not proof)

- `npx tsx docs/features/admin-content-tabs/proof.ts` (repaired legacy proof)
- `npx tsc --noEmit`, `npx next lint`, gate PASS
- Browser: Content tabs render in DB order on /admin/dashboard
