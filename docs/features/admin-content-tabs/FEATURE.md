# Feature — Combined Content section: Projects / Knowledge / Photos tabs + "Me" button

## What

Restructure the admin dashboard's Projects and Knowledge pages into one
**Content** section with three tabs across the top of the page:

1. **Projects** — everything from the old Projects tab (GitHub import, add
   project form, project rows).
2. **Knowledge** — the source extractor and source list from the old Knowledge
   tab.
3. **Photos** — the photo upload/edit grid, promoted out of the bottom of the
   Knowledge tab into its own tab.

The side menu gains a **Me** button: the old "Profile" entry relabeled, since
it holds who-Blake-is content (headshot, resume, bio, experience, socials).

## Why

Projects, Knowledge, and Photos are all "the stuff the chatbot knows about" and
belong together; Photos was invisible at the bottom of Knowledge. "Me" reads
better than "Profile" for the personal-details section.

## Behavior

- Side menu: Me, Persona, Theme, Content, Answers, Graph, Activity, Contacts.
- The Content section renders a horizontal tab strip (Projects | Knowledge |
  Photos) at the top; clicking a tab swaps the panel below. Projects is the
  default tab.
- Deep links keep working: `?tab=projects`, `?tab=knowledge`, and the new
  `?tab=photos` open the Content section on that sub-tab; `?tab=profile` still
  opens the Me section (the nav key is unchanged, only the label).
- No server actions, data model, or panel internals change — this is purely a
  navigation restructure.

## Out of scope

- Any public-site (chat) change.
- Merging Persona or Theme into Me.
- Changing what any panel does.
