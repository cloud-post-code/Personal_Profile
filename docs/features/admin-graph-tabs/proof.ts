/**
 * Proof for admin-graph-tabs — see PROOF.md for the contract.
 *
 * Renders the SubTabs switcher server-side (the part that changed) and checks
 * the Graph panel's wiring at source level, because the panes are server-action
 * forms that need auth + Postgres to exercise. Uses createElement (not JSX) so
 * tsx runs it as .ts.
 */
import { createElement as h, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { SubTabs } from "../../../app/admin/SubTabs";

let failures = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  ok  ${name}`);
  } else {
    failures++;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// ── 1–3. SubTabs: node labels, aria-label, five-tab switching. ──
const graphTabs = [
  { key: "graph", label: "Graph", content: h("p", null, "GRAPH-PANEL") },
  { key: "test", label: "Test", content: h("p", null, "TEST-PANEL") },
  {
    key: "entities",
    label: h(Fragment, null, "Entities ", h("span", null, "116")),
    content: h("p", null, "ENTITIES-PANEL"),
  },
  {
    key: "relations",
    label: h(Fragment, null, "Relationships ", h("span", null, "180")),
    content: h("p", null, "RELATIONS-PANEL"),
  },
  { key: "overviews", label: "Overviews", content: h("p", null, "OVERVIEWS-PANEL") },
];

function render(initial?: string, ariaLabel?: string): string {
  return renderToStaticMarkup(h(SubTabs, { tabs: graphTabs, initial, ariaLabel }));
}

{
  const html = render();
  check(
    "SubTabs renders a React-node label with its count span",
    html.includes("Entities ") && html.includes("<span>116</span>"),
    html,
  );
  check(
    'tablist aria-label defaults to "Content sections"',
    html.includes('aria-label="Content sections"'),
    html,
  );
  check(
    "five graph tabs default to the Graph panel only",
    html.includes("GRAPH-PANEL") &&
      !["TEST-PANEL", "ENTITIES-PANEL", "RELATIONS-PANEL", "OVERVIEWS-PANEL"].some((m) =>
        html.includes(m),
      ),
    html,
  );
  check(
    "exactly one tab is aria-selected",
    (html.match(/aria-selected="true"/g) ?? []).length === 1,
    html,
  );
}
check(
  "tablist aria-label is overridable",
  render(undefined, "Graph sections").includes('aria-label="Graph sections"'),
);
check(
  'initial="overviews" shows the Overviews panel only',
  (() => {
    const html = render("overviews");
    return html.includes("OVERVIEWS-PANEL") && !html.includes("GRAPH-PANEL");
  })(),
);

// ── 4–6. GraphPanel / GraphView wiring (source-level: need auth + Postgres to render). ──
const read = (p: string) => readFileSync(path.join(__dirname, "../../../", p), "utf8");
const panel = read("app/admin/GraphPanel.tsx");
const view = read("app/admin/GraphView.tsx");
const page = read("app/admin/dashboard/page.tsx");

check("GraphPanel mounts SubTabs", panel.includes("SubTabs"));
{
  const keys = ["graph", "test", "entities", "relations", "overviews"];
  const idx = keys.map((k) => panel.indexOf(`key: "${k}"`));
  check(
    "GraphPanel has the five tab keys in order",
    idx.every((i) => i >= 0) && idx.every((i, n) => n === 0 || i > idx[n - 1]),
    JSON.stringify(Object.fromEntries(keys.map((k, n) => [k, idx[n]]))),
  );
}
for (const label of ["Graph", "Test", "Entities", "Relationships", "Overviews"]) {
  check(`GraphPanel labels a tab "${label}"`, panel.includes(label));
}
check(
  "Graph tab holds the visual canvas and the stats",
  panel.includes("GraphCanvas") && panel.includes("Stat"),
);
check("Test tab holds the retrieval playground", panel.includes("RetrievalPlayground"));
check("Entities tab mounts EntitiesPane", panel.includes("EntitiesPane"));
check("Relationships tab mounts RelationsPane", panel.includes("RelationsPane"));
check("Overviews tab holds the rebuild action", panel.includes("rebuildOverviews"));
check(
  "Entities and Relationships labels carry Count badges, warning on Entities",
  panel.includes("Count") && panel.includes("danger"),
);

check(
  "GraphView exports EntitiesPane and RelationsPane",
  view.includes("export function EntitiesPane") && view.includes("export function RelationsPane"),
);
check(
  "GraphView's old three-pane switcher is gone",
  !view.includes("PaneTab") && !view.includes("Visual graph"),
);
check(
  "GraphPanel no longer imports the GraphView shell component",
  !/import\s*{[^}]*\bGraphView\b[^}]*}/.test(panel),
);

// ── 7. Dashboard unchanged: GraphPanel under the graph nav entry. ──
check(
  "dashboard mounts GraphPanel under the graph nav entry",
  page.includes('key: "graph"') && page.includes("<GraphPanel"),
);

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed.`);
  process.exit(1);
}
console.log("\nAll assertions passed.");
