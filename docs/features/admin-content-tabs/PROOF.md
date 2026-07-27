# Proof — Combined Content section: Projects / Knowledge / Photos tabs + "Me" button

## Definition Of Done

- A `SubTabs` client component renders a horizontal tab strip and shows exactly
  the active tab's panel; the initial prop picks the starting tab and an
  unknown initial falls back to the first tab.
- `resolveAdminTab` maps the legacy deep-link keys `projects` / `knowledge`
  (and the new `photos`) to the Content nav entry with the right sub-tab, and
  passes every other key through untouched.
- The dashboard wires Projects, Knowledge, and Photos panels into `SubTabs`
  under one `content` nav entry, and the old Profile entry is labeled "Me".

## Primary Proof

Type: component + unit (the feature is nav restructure; the panels themselves
are unchanged server-action forms, so the proof renders the new switcher and
exercises the deep-link mapping rather than standing up auth + Postgres)

Command:

```bash
npx tsx --tsconfig docs/features/admin-content-tabs/tsconfig.json docs/features/admin-content-tabs/proof.ts
```

(The local tsconfig switches `jsx` to `react-jsx` so tsx can compile the
imported `.tsx` component; the app's own tsconfig uses Next's `preserve`.)

No network, no database. `SubTabs` is rendered with `renderToStaticMarkup`
(client components render fine server-side), so tab-strip markup and
which-panel-shows are observed directly.

### Assertions (all must pass)

1. `CONTENT_TAB_KEYS` is exactly `projects, knowledge, photos`.
2. `resolveAdminTab("projects" | "knowledge" | "photos")` → nav `content` with
   that sub-tab; `resolveAdminTab("persona")` → nav `persona`, no sub;
   `resolveAdminTab(undefined)` → no nav, no sub.
3. `SubTabs` with three tabs and no initial renders all three tab buttons,
   shows the first panel only, and marks exactly one tab `aria-selected`.
4. `SubTabs` with `initial="photos"` shows the Photos panel only.
5. `SubTabs` with an unknown initial falls back to the first panel.
6. The dashboard page source mounts `SubTabs` inside a `content` nav entry
   wiring all three panels as sub-tab entries, labels the profile entry "Me",
   resolves the initial tab through `resolveAdminTab`, and has no leftover
   "Profile" label or photos-inside-knowledge fragment.

## Secondary checks

- Gate (`~/.claude/scripts/gate`): typecheck + lint clean.
