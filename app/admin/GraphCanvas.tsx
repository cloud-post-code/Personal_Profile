"use client";

import { useEffect, useRef, useState } from "react";
import type { Core, LayoutOptions, NodeSingular } from "cytoscape";
import { ENTITY_TYPES_LIST } from "@/lib/retrieval/entities";
import type { GraphEntity, GraphEdge } from "@/lib/retrieval/graph";
import { btnGhost } from "./ui";

/**
 * The graph as a navigable picture, drawn with Cytoscape.js (MIT) and its
 * fCoSE force layout.
 *
 * The hand-rolled static SVG this replaced could not survive a real graph:
 * labels collided, nodes clipped at the frame edge, and there was no way to
 * zoom, pan or pull a cluster apart. Cytoscape brings those for free, plus the
 * detail worth having — labels that fade out when zoomed away so a dense graph
 * stays readable, and neighbour highlighting to trace how one entity connects.
 *
 * Loaded lazily inside an effect: it needs a real DOM, and there's no reason to
 * ship the layout engine to anyone who never opens this tab.
 */

/** One stable colour per entity type. Canvas can't read CSS variables. */
const TYPE_COLOR: Record<string, string> = {
  person: "#e4a2b8",
  org: "#8fb8de",
  project: "#9fd6b4",
  skill: "#e0c48f",
  place: "#c2a8e0",
  topic: "#8fd4d8",
  event: "#e0a98f",
  other: "#b8b8b8",
};

let fcoseRegistered = false;

export function GraphCanvas({
  entities,
  edges,
}: {
  entities: GraphEntity[];
  edges: GraphEdge[];
}) {
  const box = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const [selected, setSelected] = useState<GraphEntity | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!box.current || entities.length === 0) return;
    let cancelled = false;
    let cy: Core | undefined;
    let observer: ResizeObserver | undefined;

    (async () => {
      const cytoscape = (await import("cytoscape")).default;
      const fcose = (await import("cytoscape-fcose")).default;
      if (!fcoseRegistered) {
        cytoscape.use(fcose);
        fcoseRegistered = true;
      }
      if (cancelled || !box.current) return;

      const css = getComputedStyle(document.documentElement);
      const ink = css.getPropertyValue("--text").trim() || "#222";
      const line = css.getPropertyValue("--border").trim() || "#ccc";

      const maxMentions = Math.max(...entities.map((e) => e.mentions), 1);
      const radius = Math.min(420, 90 + entities.length * 4);

      cy = cytoscape({
        container: box.current,
        // Seed positions deterministically so fCoSE (randomize: false) settles
        // to the same picture every visit instead of reshuffling on each edit.
        elements: [
          ...entities.map((e, i) => {
            const a = (i / entities.length) * Math.PI * 2;
            return {
              data: {
                id: e.id,
                label: e.name,
                color: TYPE_COLOR[e.type] ?? TYPE_COLOR.other,
                size: 16 + Math.sqrt(e.mentions / maxMentions) * 34,
                orphan: e.mentions === 0 ? 1 : 0,
              },
              position: { x: Math.cos(a) * radius, y: Math.sin(a) * radius },
            };
          }),
          ...edges.map((e) => ({
            data: { id: e.id, source: e.fromId, target: e.toId, label: e.relation },
          })),
        ],
        style: [
          {
            selector: "node",
            style: {
              "background-color": "data(color)",
              width: "data(size)",
              height: "data(size)",
              label: "data(label)",
              "font-size": 11,
              color: ink,
              "text-valign": "bottom",
              "text-margin-y": 5,
              "text-wrap": "ellipsis",
              "text-max-width": "110px",
              // Labels disappear as you zoom out — the fix for a wall of
              // overlapping text on a dense graph.
              "min-zoomed-font-size": 9,
              "border-width": 0,
            },
          },
          {
            selector: "node[orphan = 1]",
            style: { "border-width": 2, "border-color": "#e06666", "border-style": "dashed" },
          },
          {
            selector: "edge",
            style: {
              width: 1.2,
              "line-color": line,
              "curve-style": "bezier",
              "target-arrow-shape": "triangle",
              "target-arrow-color": line,
              "arrow-scale": 0.7,
              label: "data(label)",
              "font-size": 9,
              color: ink,
              "text-opacity": 0.75,
              // Relation labels only once you're zoomed in far enough to read
              // them; otherwise they'd bury the nodes.
              "min-zoomed-font-size": 11,
            },
          },
          { selector: ".faded", style: { opacity: 0.12, "text-opacity": 0 } },
          {
            selector: ".highlight",
            style: { "border-width": 3, "border-color": ink, "border-style": "solid" },
          },
          { selector: ".match", style: { "border-width": 3, "border-color": "#f0a500" } },
        ],
        layout: {
          name: "fcose",
          quality: "proof",
          randomize: false,
          animate: false,
          fit: true,
          padding: 40,
          nodeSeparation: 120,
          idealEdgeLength: () => 110,
          nodeRepulsion: () => 9000,
        } as unknown as LayoutOptions,
        minZoom: 0.15,
        maxZoom: 3.5,
        wheelSensitivity: 0.25,
      });

      const byId = new Map(entities.map((e) => [e.id, e]));

      cy.on("tap", "node", (evt) => {
        const node = evt.target as NodeSingular;
        const hood = node.closedNeighborhood();
        cy!.elements().addClass("faded");
        hood.removeClass("faded");
        cy!.elements().removeClass("highlight");
        node.addClass("highlight");
        setSelected(byId.get(node.id()) ?? null);
      });

      cy.on("tap", (evt) => {
        if (evt.target === cy) {
          cy!.elements().removeClass("faded highlight");
          setSelected(null);
        }
      });

      // The initial fit runs before webfonts settle and before the flex parent
      // has its final width, which leaves the graph shrunk in a half-empty box
      // with its labels bunched. Refit once ready, and again whenever the
      // container resizes.
      cy.ready(() => cy?.fit(undefined, 40));
      observer = new ResizeObserver(() => {
        cy?.resize();
        cy?.fit(undefined, 40);
      });
      observer.observe(box.current);

      cyRef.current = cy;
    })();

    return () => {
      cancelled = true;
      observer?.disconnect();
      cy?.destroy();
      cyRef.current = null;
    };
  }, [entities, edges]);

  // Highlight search matches without re-running the layout.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.nodes().removeClass("match");
    const q = query.trim().toLowerCase();
    if (!q) return;
    cy.nodes()
      .filter((n) => String(n.data("label")).toLowerCase().includes(q))
      .addClass("match");
  }, [query]);

  if (entities.length === 0) {
    return <p style={hint}>Nothing extracted yet — add knowledge and it will appear here.</p>;
  }

  const fit = () => {
    const cy = cyRef.current;
    if (cy) cy.animate({ fit: { eles: cy.elements(), padding: 40 }, duration: 250 });
  };
  const zoomBy = (factor: number) => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.animate({ zoom: cy.zoom() * factor, duration: 180 });
  };

  return (
    <div>
      <p style={hint}>
        Drag to pan, scroll to zoom, drag any dot to pull it out of a cluster. Dots are entities
        sized by how many chunks mention them; labels and relation names fade in as you zoom.
        Click a dot to isolate it and its neighbours. Dots ringed in red are orphans — nothing
        mentions them, so retrieval can never reach them.
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find an entity…"
          style={{
            padding: "7px 12px",
            background: "var(--bg-soft)",
            color: "var(--on-bg-soft)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            fontSize: 13,
            outline: "none",
            minWidth: 180,
          }}
        />
        <button type="button" onClick={fit} style={{ ...btnGhost, padding: "6px 12px" }}>Fit</button>
        <button type="button" onClick={() => zoomBy(1.3)} style={{ ...btnGhost, padding: "6px 12px" }}>+</button>
        <button type="button" onClick={() => zoomBy(1 / 1.3)} style={{ ...btnGhost, padding: "6px 12px" }}>−</button>
      </div>

      <div
        ref={box}
        style={{
          height: 560,
          border: "1px solid var(--border)",
          borderRadius: 10,
          background: "var(--bg-soft)",
        }}
      />

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
        {ENTITY_TYPES_LIST.filter((t) => entities.some((e) => e.type === t)).map((t) => (
          <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11 }}>
            <span style={{ width: 9, height: 9, borderRadius: 999, background: TYPE_COLOR[t], display: "inline-block" }} />
            {t}
          </span>
        ))}
      </div>

      {selected && (
        <div style={{ marginTop: 12, border: "1px solid var(--border)", borderRadius: 10, padding: "10px 14px" }}>
          <strong style={{ fontSize: 14 }}>{selected.name}</strong>{" "}
          <span style={{ fontSize: 12, fontStyle: "italic" }}>({selected.type})</span>
          <div style={{ fontSize: 12, marginTop: 4 }}>
            {selected.mentions} mention{selected.mentions === 1 ? "" : "s"} · {selected.edges} relation
            {selected.edges === 1 ? "" : "s"}
            {selected.sources.length > 0 && ` · from ${selected.sources.join(", ")}`}
          </div>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
            {edges
              .filter((e) => e.fromId === selected.id || e.toId === selected.id)
              .map((e) => (
                <span key={e.id} style={{ fontSize: 12 }}>
                  {e.fromName} <em style={{ color: "var(--accent-on-surface)" }}>{e.relation}</em> → {e.toName}
                </span>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

const hint: React.CSSProperties = {
  color: "var(--on-surface)",
  fontStyle: "italic",
  fontSize: 13,
  marginBottom: 14,
};
