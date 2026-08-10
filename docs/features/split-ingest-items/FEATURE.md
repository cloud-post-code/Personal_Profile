# Feature — Every text ingest splits into one item per point

## What

Ingesting text into a custom source (document upload, URL scan, or pasted
text) no longer produces one blob row. A **split pass is a built-in
behavior of the pipeline** — the admin never has to ask for it in the
prompt:

- After extraction, one model call splits the raw text into discrete items,
  returned as JSON `[{title, text}]`. **The source's own `systemPrompt` is
  the lens**: it defines what counts as one item and which details each
  should carry ("one work initiative with owner, timeline, status…"). An
  empty prompt gets the default lens ("one distinct, self-contained point
  per item").
- Each item becomes its own `Source` row under the source (marked
  `ingest:<key>`, tagged `doc:<parent label>` for provenance), indexed
  individually — so the tab lists ~N cards and each point is independently
  retrievable.
- **Caps and fallback are universal**: at most `MAX_SPLIT_ITEMS` (20) per
  document, input truncated to a bounded window, and any split failure
  (model error, bad JSON, 0–1 items) degrades to today's single summarized
  row — a model outage can never lose an upload.
- **URL re-scans replace their items** instead of duplicating them: the
  scan deletes rows tagged `doc:<url>` before writing the fresh set (the
  doc-level URL row itself is dropped once its items exist). File and paste
  ingests append, as uploading twice always has.
- The splitter client is injectable, so the proof runs with zero model
  calls. The builder's system prompt now teaches that splitting is
  automatic and the source prompt should describe the ITEM, not ask for
  splitting.

## Why

A 16-page initiative brief ingested into Work Initiatives came back as one
card. The admin's prompt said "extract each initiative" but was
display-only; and even applied, one row can't hold N initiatives. Mechanism
in code, criteria in the prompt.

## Out of scope

Splitting the built-in Links/PDFs/Text tabs (they keep document-level rows);
re-upload dedup for files; image splitting.
