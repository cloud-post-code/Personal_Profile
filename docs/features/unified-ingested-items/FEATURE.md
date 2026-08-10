# Feature — One uniform shape for everything ingested: text or image

## What

`lib/ingestedItems.ts` gives every ingestion source one read path,
`listIngestedItems(sourceKey)`, returning `IngestedItem[]` where **every
piece of ingested information is exactly one of two kinds**:

```ts
type IngestedItem = {
  kind: "text" | "image";
  id: string;          // "<model>:<rowid>" — unique across backing tables
  sourceKey: string;
  title: string;
  text: string;        // the text content, or the image's description
  imageUrl: string | null;  // non-null iff kind === "image"
  createdAt: Date;
};
```

Dispatch by source key:

- `experience` → `Profile.experience` JSON entries → text items.
- `projects` → `Project` rows → one text item each, plus an image item when
  the project has an image.
- `links` → `Source` rows with `type = link` → text items.
- `pdfs` → `Source` rows with `type = pdf|doc` → text items.
- `text` → `Source` rows with `type = text` (excluding custom-source rows,
  marked `kind = "ingest:<key>"`) → text items.
- `photos` → `Photo` rows (built-in kinds) → image items with the vision
  description as their text.
- `persona` → `Profile.personaSections` JSON → text items.
- any other key (custom sources, next feature) → `Source` rows with
  `kind = "ingest:<key>"` as text items + `Photo` rows with
  `kind = "ingest:<key>"` as image items.

The invariant `kind === "image" ⟺ imageUrl !== null` holds for every item.
Parsing is defensive: malformed JSON degrades to an empty list, never a
crash.

## Why

The tabs store into four different tables; the uniform item shape is what
lets the dashboard (and future generic panels) show "what has this source
ingested" the same way everywhere, and makes "text or image" a checked rule
rather than a convention.

## Out of scope

Writing custom-source content (create-ingestion-source), rendering changes.
