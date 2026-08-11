# Feature — Delete (with warning, full data purge) and hide ingestion sources

## What

Two admin capabilities over the `IngestionSource` rows that drive the Content
tabs:

1. **Delete a source, and everything it ingested.** Deleting an ingestion
   source removes the `IngestionSource` row AND all content that source owns —
   the same ownership rules `listIngestedItems` reads by:
   - custom sources: their marked `Source` rows (`kind = "ingest:<key>"`) and
     marked `Photo` rows, plus each row's retrieval chunks and graph claims
     (`dropOrigin`);
   - `links` / `pdfs` / `text`: the unmarked `Source` rows of that type;
   - `projects`: all `Project` rows; `photos`: all unmarked `Photo` rows;
   - `experience`: clears `Profile.experience` + `experienceSummary` and
     re-indexes the profile; `persona`: clears `Profile.personaSections` and
     re-indexes the persona (the sweep retracts every persona origin).

   The delete lives on the source's edit page (`/admin/sources/[key]`), behind
   the same edit-password unlock as config edits, in a Danger zone that:
   - shows a warning naming the source and the live count of ingested items
     that will be destroyed, and that this cannot be undone;
   - requires ticking an explicit "I understand" checkbox before the delete
     button will submit.

2. **Hide a source.** A one-click Hide control on each Content tab (next to
   "Edit ingestion") sets `enabled = false`, which removes the tab from the
   strip without touching any ingested data. Hidden sources are listed in the
   Content section header with a Show button each, so hiding is always
   reversible from the dashboard. Hiding needs only admin auth (it is
   reversible and config-free); deleting keeps the edit-password gate.

## Why

Sources accumulate; today a mis-built or retired source can only be disabled
through the manual form behind the edit password, and its ingested rows linger
in knowledge forever. Delete gives a true retraction (rows, chunks, graph
claims); hide gives a cheap, reversible way to declutter the tab strip.

## Touched

- `lib/ingestedItems.ts` — `deleteIngestedData(sourceKey)` (ownership-mirrored
  purge) and `deleteIngestionSourceAndData(id)` (here, not in
  ingestionSources.ts, because that module is client-imported and the purge
  pulls in the Node-only retrieval stack)
- `lib/ingestionSources.ts` — `setIngestionSourceHidden(id, hidden)`
- `app/admin/actions.ts` — `deleteIngestionSourceAction`, `setIngestionSourceHiddenAction`
- `app/admin/sources/[key]/page.tsx` — Danger zone with warning + confirm checkbox
- `app/admin/dashboard/page.tsx` — per-tab Hide button, hidden-sources row with Show

## Not in scope

- Deleting uploaded image files from the upload volume (existing `deletePhoto`
  keeps files too; rows and index entries are what retrieval reads).
- Per-item delete (already exists per tab where it matters).
- Soft-delete/undo for the purge — the warning + checkbox is the guard.
