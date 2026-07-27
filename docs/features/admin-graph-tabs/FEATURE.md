# Feature — Graph section reorganized into 5 sub-tabs

## What

Restructure the admin dashboard's **Graph** section from one long stacked page
into five sub-tabs across the top of the panel, reusing the same `SubTabs`
strip the Content section uses:

1. **Graph** — the index-health stats (sources / chunks / entities / relations
   / orphans), origin breakdown, embedding-health notices, and the visual
   node-link graph.
2. **Test** — the retrieval playground ("see what the chatbot is given for a
   question").
3. **Entities** — the paginated entity list with suggested merges (count badge
   in the tab label, warning badge when merges are suggested).
4. **Relationships** — the paginated relations list and add-relation form
   (count badge in the tab label).
5. **Overviews** — the neighborhood-overview paragraphs and the Rebuild
   overviews button.

## Why

The Graph page currently stacks stats, the playground, overviews, and a
three-pane graph view vertically; the playground and overviews are buried
between the stats and the graph. Splitting into tabs gives each activity —
inspecting, testing, editing entities, editing relations, curating overviews —
its own screen.

## Behavior

- The Graph panel keeps its title and intro paragraph, then renders a
  horizontal tab strip (Graph | Test | Entities | Relationships | Overviews).
  Graph is the default tab.
- The Entities tab label shows the entity count and, when the graph suggests
  merges, a ⚠ count; the Relationships tab label shows the relation count —
  same badges the old pane switcher had.
- `GraphView`'s own Visual graph / Entities / Relations pill switcher goes
  away; the visual canvas lives on the Graph tab, and the Entities and
  Relations panes are mounted directly as sub-tabs.
- `SubTabs` grows two backward-compatible abilities it needs here: labels may
  be React nodes (for count badges) and the tablist `aria-label` is
  configurable (the Content section keeps its current one by default).
- No server actions, data model, or pane internals change — this is purely a
  layout restructure of the Graph section.

## Out of scope

- Deep links into Graph sub-tabs (`?tab=` keeps resolving nav sections only).
- Any change to retrieval, extraction, or the panes' editing behavior.
- Any public-site change.
