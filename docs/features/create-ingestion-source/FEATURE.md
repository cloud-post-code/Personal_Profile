# Feature — Create new ingestion sources from the admin

## What

- **Create page** `app/admin/sources/new/page.tsx` (auth-gated like the card
  builder pages): a form for label, optional key, description, system
  prompt, upload method, and storage kinds. Submits to a thin server action
  wrapping `saveIngestionSource`; new rows are non-builtin and land at the
  end of the tab strip. The Content section header gets a
  "+ New ingestion source" link to the page.
- **Generic panel** `app/admin/GenericIngestPanel.tsx`: every non-builtin
  enabled source renders as a real Content tab. The panel shows the source's
  description and system prompt, an ingest form for **text** (title +
  textarea) when `storageKinds` includes text, an ingest form for **images**
  (file + caption) when it includes image, and the source's ingested items
  through the uniform `listIngestedItems` shape (text boxes and image
  thumbnails).
- **Custom ingest writes** live in `lib/customIngest.ts` (actions stay thin
  auth wrappers): `ingestCustomText` stores a `Source` row marked
  `kind = "ingest:<key>"` (extracted + indexed best-effort, injectable
  extractor so proofs stay offline); `ingestCustomImage` stores the bytes
  via the upload dir and a `Photo` row marked the same way (injectable
  describer). Both refuse kinds the source's `storageKinds` doesn't allow —
  the uniform text/image rule is enforced at the write.
- **No leaks**: custom-marked rows never appear in built-in surfaces — the
  dashboard's Text tab and Photos tab, the public gallery card
  (`lib/cards.ts`), the knowledge prompt photo list (`lib/knowledge.ts`),
  and the image-gen reference list (`lib/imageGen.ts`) all exclude
  `kind` starting with `ingest:`.

## Why

This is the "create upload source" ask: new ingestion sources are rows, not
code, and anything they ingest is stored uniformly as text or image without
polluting the built-in tabs or public site.

## Out of scope

Editing existing sources and the edit password gate (edit-ingestion-source);
deleting custom items from the generic panel.
