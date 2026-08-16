# Feature — Per-item classification override

## What

An ingestion source's classification becomes the **default** for what it
ingests, and a single document can be classified differently at ingest time.

Every ingest form on a custom source's Content tab (URL, document, text,
image) carries a "Who is this for?" picker whose first option is *Same as
this source (<label>)*. Leaving it alone inherits; choosing a tier records an
override for exactly the items that upload produced.

`lib/itemClassification.ts` is the testable core:

- `resolveClassifications(sourceKey, itemIds)` — batch resolution, two
  queries regardless of item count. An item with no override row resolves to
  the source's classification, flagged `overridden: false`.
- `setItemClassification(s)` — records an override. Passing the source's own
  default, an empty value, or an unknown value **clears** the override rather
  than storing it, so an item explicitly set back to the default resumes
  following that default when the source later changes.
- `clearItemClassifications` / `clearSourceClassifications` — cleanup on item
  delete and whole-source purge.

Overrides live in their own `ItemClassification` table keyed by the composite
`"<model>:<rowid>"` item id that `lib/ingestedItems.ts` already assigns. A
table rather than a column because ingested items span four backing tables,
two of which (Experience, Persona) are JSON inside `Profile` with no row of
their own — this keeps the override uniform for every source, matching the way
`IngestedItem` is a read-time projection.

**Split ingests**: one document can split into many item rows. The choice is
made about the document, so every item it splits into inherits it. A URL
re-scan replaces its previous items, and their overrides go with them.

All four tiers (Public / Co-worker / Close friend / Personal) are now
selectable, on both the source default and the per-item override.

## Why

Classification was fixed per source, so a source of mostly-public material
could not hold one personal document without splitting it into a second
source.

## Out of scope

- **Enforcement.** Classification is recorded, not enforced: retrieval does
  not filter on it, so every item still reaches every visitor regardless of
  tier. Both admin pickers say so. Making tiers real requires a notion of who
  the current viewer is (tied to `AddressBookEntry.trust`) and is its own
  feature.
- Re-classifying an item after ingest — the picker is at ingest time only.
- Per-item classification on the seven built-in tabs' bespoke panels; the
  resolution layer covers their item ids, but only the generic panel has the
  picker.
