# Ingestion source classification (Public / Contact / Close friends / Personal)

## Summary
Every ingestion source carries a classification describing who its content is
for: Public, Contact, Close friends, or Personal. For now only Public is
selectable — the frontend treats everything as public — but the field, the
catalog of statuses, and the selector ship now so the remaining statuses can
be enabled later without reshaping forms or data.

## Desired Behavior
- Each `IngestionSource` row stores a `classification`, defaulting to
  `public`.
- The classification catalog is data in `lib/ingestionSources.ts`
  (`public`, `contact`, `close-friends`, `personal`) with display labels.
- Every form that saves an ingestion source's config shows a classification
  selector next to its Save button:
  - the manual create form on `/admin/sources/new`;
  - the builder's "Save ingestion source" pane on the same page;
  - the edit form on `/admin/sources/[key]`.
- The selector lists all four statuses but only Public is choosable today;
  the others render disabled with a hint that they are coming.
- The server rejects a save whose classification is not in the catalog, and
  rejects not-yet-enabled statuses with a clear message (the rule is not
  UI-only).
- Existing rows and the seeded starters come out as `public` with no manual
  backfill (column default; `prisma db push` on deploy).

## Scope
- Prisma schema, `lib/ingestionSources.ts`, the three source config forms,
  and the server actions behind them.

## Non-Goals
- No frontend visibility filtering yet — every source remains shown to
  everyone. Enabling Contact / Close friends / Personal is later work.
- No per-item classification; the status lives on the source.

## Scenarios
- Blake creates a source via the manual form: the selector sits next to
  Create, shows Public preselected, and the saved row is `public`.
- Blake edits an existing source: the selector shows the row's current
  classification and saving keeps it valid.
- A request hand-crafts `classification=personal`: the save is rejected with
  "only Public is available" — nothing is written.

## Constraints
- Classification values are stable slugs (kebab-case) like the rest of the
  catalog; labels are presentation only.
- Starters seed without naming a classification so the DB default is the
  single source of truth.

## Implementation Routing
- Required skills: coding-frontend, coding-proof-author
