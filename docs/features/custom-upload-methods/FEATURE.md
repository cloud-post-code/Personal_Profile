# Feature — A source's upload method actually decides its upload form

## What

Custom ingestion sources currently render the same paste-text + image forms
whatever their `uploadMethod` says. This feature makes the upload method
real, everywhere the form appears:

- **`ingestFormsFor(uploadMethod, storageKinds)`** in
  `lib/ingestionSources.ts` — the one pure mapping from a source's config to
  which ingest controls it shows: `url` → a URL-scan field; `file`/`resume`
  → a document upload (PDF/Word/text files); `textarea`/`form` → the paste
  form; `image` → the image upload; `github` → the URL field;
  `generic`/unknown → paste + image. Storage kinds still gate everything (a text-only source never shows
  the image control, and text-shaped controls need text storage). A
  config whose method and storage contradict (e.g. `image` method with
  text-only storage) yields no controls — the panel says so instead of
  rendering something misleading.
- **Real write paths** in `lib/customIngest.ts`: `ingestCustomUrl` (scrapes
  via `extractLink`, upserts by URL, marks `ingest:<key>`) and
  `ingestCustomFile` (extracts via `extractDocument`, accepts .pdf/.docx,
  marks the same). Both enforce text storage, keep the ownership mark
  through extraction, index best-effort, and take injectable extractors so
  the proof is offline. New thin actions `ingestCustomUrlAction` /
  `ingestCustomFileAction`; the dashboard passes them to the panel.
- **`GenericIngestPanel`** renders its controls from `ingestFormsFor`.
- **The builder's test pane** (`SourceBuilder.tsx`) uses the same mapping,
  so the sample page finally matches the draft: a `file` draft shows a
  document-upload control (test submissions still only add local items),
  a `url` draft shows the URL field, and so on.
- The builder system prompt now teaches when to pick `url` / `file` /
  `textarea` / `image` instead of steering everything to `generic`.

## Why

Found live: chatting "a Word/PDF document source" produced a correct
`uploadMethod: "file"` draft whose test page still showed a paste-text box —
the config field existed but changed nothing.

## Out of scope

OCR for scanned PDFs, new upload-method vocabulary entries.
