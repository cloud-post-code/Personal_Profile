# Feature — A source can opt out of splitting: one item per upload

## What

Splitting stays the default pipeline behavior, but it becomes a per-source
setting the admin controls when building or editing a source:

- **`IngestionSource.splitMode`**: `"split"` (default — every text ingest
  splits into one item per point) or `"single"` (every upload stays one
  item). Validated in `saveIngestionSource` against the closed
  `SPLIT_MODES` vocabulary.
- **The pipeline honors it**: when a source is `single`, the split pass is
  skipped entirely — no split model call is made — and the ingest keeps
  today's one-summarized-row behavior. `split` sources behave exactly as
  before.
- **Exposed everywhere a source is configured**: the edit page and the
  manual create form get an "Items per upload" select; the builder chat's
  draft carries `splitMode` (coerced to `split` on junk), its system prompt
  teaches the model to set `single` when the admin says things like "keep
  each upload as one entry", and the test pane shows which mode the draft
  is in.

## Why

Splitting a 16-page brief into initiatives is right for Work Initiatives —
but some sources ingest documents that ARE one thing (a policy, a bio, a
reference doc). The admin should be able to say so at build time instead of
fighting the default.

## Out of scope

Per-upload overrides (a checkbox at ingest time); changing built-in tabs.
