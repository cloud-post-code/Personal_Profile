# Feature — Edit any ingestion source, behind a locally-stored edit password

## What

- **Edit button everywhere**: every Content tab (built-in and custom) shows
  an "Edit ingestion" link in its corner, deep-linking to
  `/admin/sources/<key>`.
- **Edit page** `app/admin/sources/[key]/page.tsx`: prefilled form over the
  source's row — label, description, system prompt, upload method, storage
  kinds, output method, enabled, and display order — saving through
  `saveIngestionSource` with the row's id. Reordering here reorders the tab
  strip (order is data since ingestion-driven-dashboard).
- **Edit password, stored locally**: editing source *configuration* is
  gated a second time beyond admin login. `lib/ingestionAuth.ts` checks the
  typed password against `INGESTION_EDIT_PASSWORD` from the local `.env`
  (never committed; documented in `.env.example`), falling back to
  `ADMIN_PASSWORD` when unset; empty both means locked. A correct password
  sets a short-lived signed cookie (`blake_ingest_edit`, 1 hour, distinct
  HMAC label from the admin cookie) so each edit session unlocks once. The
  update action re-checks the cookie server-side — the gate is not just UI.

## Why

Ingestion-source config decides what the agent ingests and how; a separate,
locally-held password makes edits a deliberate act and completes the ask:
each ingestion page gets an edit button, and the password that unlocks
editing lives only in the local env file.

## Out of scope

Deleting sources, retracting an entire source's ingested content.
