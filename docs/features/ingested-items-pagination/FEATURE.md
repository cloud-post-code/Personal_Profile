# Feature — Paginate the item lists on custom ingestion sources

## What

Custom ingestion source tabs paginate their ingested-item lists instead of
rendering every item at once — with per-point splitting, one document can
add up to 20 items, and a source accumulates them across uploads.

- **`Paginated`** (`app/admin/Paginated.tsx`): a small client component
  taking pre-rendered rows and a page size (default 10). It renders the
  current page plus Prev / Next controls and a "Page X of Y · N items"
  count. With one page or fewer, the controls disappear entirely — short
  lists look exactly as before. Server-rendered output shows page 1, so the
  list is meaningful before hydration and in proofs.
- **`GenericIngestPanel`** wraps its item rows in `Paginated`. The rows are
  rendered server-side (server-action delete/ingest forms keep working —
  they pass through the client boundary as rendered nodes), so pagination
  is purely presentational.

## Why

A 16-page document now correctly becomes many cards; three uploads later
the tab is an unscrollable wall. Pagination keeps it usable without
touching the data layer.

## Out of scope

Paginating the built-in tabs' lists (Links/PDFs/Text/Photos keep their
existing layout); server-side paging of the DB query (item counts are far
from needing it).
