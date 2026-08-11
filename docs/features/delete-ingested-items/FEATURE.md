# Feature — Delete individual ingested items

## What

Every item listed on a custom ingestion source's tab gets a **Delete**
button. Deleting an item removes exactly that piece of ingested
information — the `Source` row (text/url/file items) or `Photo` row (image
items) — with the repo's standard retraction: chunks cascade with the row,
and `dropOrigin` retracts the entities and relations extracted from it, so
the agent genuinely forgets it.

`deleteIngestedItem(sourceKey, itemId)` in `lib/customIngest.ts` is the
testable write. It enforces **ownership**: the item id (`source:<id>` /
`photo:<id>`) must belong to a row marked `ingest:<sourceKey>` — a forged
or cross-source id (including ids of built-in tab rows) is refused, so this
path can never delete Links/PDFs/Text/Photos rows or another source's
items. Unknown id shapes are refused.

`deleteIngestedItemAction` is the thin admin-auth wrapper (same auth level
as the built-in tabs' existing per-row deletes — no edit password, since
this is content, not source config). `GenericIngestPanel` renders the
button per item via a `deleteItemAction` prop, keeping the panel offline-
renderable for proofs.

## Why

Custom sources could ingest but never un-ingest a single item — the only
removal was deleting the whole source and everything in it.

## Out of scope

Per-item delete redesign for the built-in tabs (they already have their own
delete controls); upload-file garbage collection (matches existing
deletePhoto semantics).
