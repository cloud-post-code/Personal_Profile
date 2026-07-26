"use client";

import { useMemo, useState } from "react";
import { ENTITY_TYPES_LIST } from "@/lib/retrieval/entities";
import type { GraphEntity, GraphEdge } from "@/lib/retrieval/graph";
import { saveEntity, removeEntity, createEntityEdge, removeEntityEdge } from "./actions";
import { field, btn, btnGhost, btnDanger, Label } from "./ui";

/**
 * The graph, three ways: a rendered node-link picture, and paginated Entities
 * and Relations lists for editing. A picture makes structural faults obvious
 * that a list hides — a hub every edge runs through, a cluster with no link to
 * the person the site is about, a duplicate sitting beside its twin.
 */

const PAGE_SIZE = 20;
type Pane = "visual" | "entities" | "relations";

export function GraphView({
  entities,
  edges,
}: {
  entities: GraphEntity[];
  edges: GraphEdge[];
}) {
  const [pane, setPane] = useState<Pane>("visual");

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        <PaneTab on={pane === "visual"} onClick={() => setPane("visual")}>Visual graph</PaneTab>
        <PaneTab on={pane === "entities"} onClick={() => setPane("entities")}>
          Entities <Count n={entities.length} />
        </PaneTab>
        <PaneTab on={pane === "relations"} onClick={() => setPane("relations")}>
          Relations <Count n={edges.length} />
        </PaneTab>
      </div>

      {pane === "visual" && <GraphCanvas entities={entities} edges={edges} />}
      {pane === "entities" && <EntitiesPane entities={entities} />}
      {pane === "relations" && <RelationsPane entities={entities} edges={edges} />}
    </div>
  );
}

// ── Visual ──────────────────────────────────────────────────────────────────

const W = 820;
const H = 560;

type Placed = GraphEntity & { x: number; y: number };

/**
 * Force-directed layout (Fruchterman-Reingold), run to completion once and
 * rendered static. The graph is small enough that the O(n²) repulsion pass is
 * cheap, and a settled picture beats an animated one for reading structure.
 * Deterministic: nodes seed on a circle by index, so the layout is stable
 * across renders instead of jumping on every edit.
 */
function layout(entities: GraphEntity[], edges: GraphEdge[]): Placed[] {
  const n = entities.length;
  if (n === 0) return [];

  const idx = new Map(entities.map((e, i) => [e.id, i]));
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    x[i] = W / 2 + Math.cos(a) * (Math.min(W, H) / 2.6);
    y[i] = H / 2 + Math.sin(a) * (Math.min(W, H) / 2.6);
  }

  const links = edges
    .map((e) => [idx.get(e.fromId), idx.get(e.toId)] as const)
    .filter((l): l is readonly [number, number] => l[0] !== undefined && l[1] !== undefined);

  const area = W * H;
  const k = Math.sqrt(area / n) * 0.62;
  // Repulsion is O(n²) per pass and this also runs during SSR, so trade
  // iterations away as the graph grows rather than stalling the page.
  const ITER = n > 300 ? 60 : n > 120 ? 150 : 320;

  const dx = new Float64Array(n);
  const dy = new Float64Array(n);

  for (let step = 0; step < ITER; step++) {
    dx.fill(0);
    dy.fill(0);

    // Repulsion — every pair pushes apart.
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let ux = x[i] - x[j];
        let uy = y[i] - y[j];
        let d2 = ux * ux + uy * uy;
        if (d2 < 0.01) {
          // Coincident nodes: nudge deterministically so they separate.
          ux = ((i % 7) - 3) * 0.1 + 0.05;
          uy = ((j % 5) - 2) * 0.1 + 0.05;
          d2 = ux * ux + uy * uy;
        }
        const d = Math.sqrt(d2);
        const f = (k * k) / d;
        const fx = (ux / d) * f;
        const fy = (uy / d) * f;
        dx[i] += fx; dy[i] += fy;
        dx[j] -= fx; dy[j] -= fy;
      }
    }

    // Attraction along edges.
    for (const [a, b] of links) {
      const ux = x[a] - x[b];
      const uy = y[a] - y[b];
      const d = Math.sqrt(ux * ux + uy * uy) || 0.01;
      const f = (d * d) / k;
      const fx = (ux / d) * f;
      const fy = (uy / d) * f;
      dx[a] -= fx; dy[a] -= fy;
      dx[b] += fx; dy[b] += fy;
    }

    // Cool down, pull gently to centre, clamp inside the frame.
    const temp = k * (1 - step / ITER) * 0.6;
    for (let i = 0; i < n; i++) {
      dx[i] += (W / 2 - x[i]) * 0.012;
      dy[i] += (H / 2 - y[i]) * 0.012;
      const d = Math.sqrt(dx[i] * dx[i] + dy[i] * dy[i]) || 0.01;
      const m = Math.min(d, temp);
      x[i] = Math.max(28, Math.min(W - 28, x[i] + (dx[i] / d) * m));
      y[i] = Math.max(24, Math.min(H - 24, y[i] + (dy[i] / d) * m));
    }
  }

  return entities.map((e, i) => ({ ...e, x: x[i], y: y[i] }));
}

/** One stable colour per entity type, from the theme's accent ramp. */
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

function GraphCanvas({ entities, edges }: { entities: GraphEntity[]; edges: GraphEdge[] }) {
  const nodes = useMemo(() => layout(entities, edges), [entities, edges]);
  const [selected, setSelected] = useState<string | null>(null);

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const neighbours = useMemo(() => {
    if (!selected) return null;
    const set = new Set<string>([selected]);
    for (const e of edges) {
      if (e.fromId === selected) set.add(e.toId);
      if (e.toId === selected) set.add(e.fromId);
    }
    return set;
  }, [selected, edges]);

  if (!nodes.length) {
    return <p style={hint}>Nothing extracted yet — add knowledge and it will appear here.</p>;
  }

  const maxMentions = Math.max(...nodes.map((n) => n.mentions), 1);
  const radius = (n: Placed) => 5 + Math.sqrt(n.mentions / maxMentions) * 11;
  const dim = (id: string) => (neighbours && !neighbours.has(id) ? 0.12 : 1);
  const sel = selected ? byId.get(selected) : null;

  return (
    <div>
      <p style={hint}>
        Each dot is an entity, sized by how many chunks mention it; lines are the relations
        between them. Click a dot to isolate it and its neighbours. Dots ringed in red are
        orphans — nothing mentions them, so retrieval can never reach them.
      </p>

      <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 10, background: "var(--bg-soft)" }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", minWidth: 560, display: "block" }}>
          {edges.map((e) => {
            const a = byId.get(e.fromId);
            const b = byId.get(e.toId);
            if (!a || !b) return null;
            const lit = !neighbours || (neighbours.has(e.fromId) && neighbours.has(e.toId));
            return (
              <line
                key={e.id}
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke="var(--border)"
                strokeWidth={lit ? 1.4 : 0.7}
                opacity={lit ? 0.85 : 0.1}
              />
            );
          })}

          {nodes.map((n) => (
            <g
              key={n.id}
              onClick={() => setSelected(selected === n.id ? null : n.id)}
              style={{ cursor: "pointer" }}
              opacity={dim(n.id)}
            >
              <circle
                cx={n.x} cy={n.y} r={radius(n)}
                fill={TYPE_COLOR[n.type] ?? TYPE_COLOR.other}
                stroke={n.mentions === 0 ? "#e06666" : selected === n.id ? "var(--text)" : "transparent"}
                strokeWidth={n.mentions === 0 ? 2 : selected === n.id ? 2.5 : 0}
                strokeDasharray={n.mentions === 0 ? "3 2" : undefined}
              />
              <text
                x={n.x} y={n.y - radius(n) - 4}
                textAnchor="middle"
                style={{ fontSize: 10, fill: "var(--on-bg-soft)", pointerEvents: "none" }}
              >
                {n.name.length > 22 ? `${n.name.slice(0, 21)}…` : n.name}
              </text>
            </g>
          ))}
        </svg>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
        {ENTITY_TYPES_LIST.filter((t) => nodes.some((n) => n.type === t)).map((t) => (
          <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11 }}>
            <span style={{ width: 9, height: 9, borderRadius: 999, background: TYPE_COLOR[t], display: "inline-block" }} />
            {t}
          </span>
        ))}
      </div>

      {sel && (
        <div style={{ marginTop: 12, border: "1px solid var(--border)", borderRadius: 10, padding: "10px 14px" }}>
          <strong style={{ fontSize: 14 }}>{sel.name}</strong>{" "}
          <span style={{ fontSize: 12, fontStyle: "italic" }}>({sel.type})</span>
          <div style={{ fontSize: 12, marginTop: 4 }}>
            {sel.mentions} mention{sel.mentions === 1 ? "" : "s"} · {sel.edges} relation
            {sel.edges === 1 ? "" : "s"}
            {sel.sources.length > 0 && ` · from ${sel.sources.join(", ")}`}
          </div>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
            {edges
              .filter((e) => e.fromId === sel.id || e.toId === sel.id)
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

// ── Entities ────────────────────────────────────────────────────────────────

function EntitiesPane({ entities }: { entities: GraphEntity[] }) {
  const [page, setPage] = useState(0);
  const shown = entities.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  return (
    <div>
      <Label>Rename to correct, or rename onto another entity to merge the two</Label>
      {entities.length === 0 ? (
        <p style={hint}>Nothing extracted yet. Add a source on the Knowledge tab.</p>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {shown.map((e) => (
              <EntityRow key={e.id} entity={e} />
            ))}
          </div>
          <Pager page={page} total={entities.length} onPage={setPage} noun="entities" />
        </>
      )}
    </div>
  );
}

function EntityRow({ entity }: { entity: GraphEntity }) {
  const orphan = entity.mentions === 0;
  return (
    <div
      style={{
        border: `1px solid ${orphan ? "var(--danger-on-surface)" : "var(--border)"}`,
        borderRadius: 10,
        padding: "10px 12px",
      }}
    >
      <form action={saveEntity} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input type="hidden" name="id" value={entity.id} />
        <input name="name" defaultValue={entity.name} style={{ ...field, marginBottom: 0, flex: 1, minWidth: 160 }} />
        <select name="type" defaultValue={entity.type} style={{ ...field, marginBottom: 0, maxWidth: 130 }}>
          {ENTITY_TYPES_LIST.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <button style={{ ...btnGhost, padding: "6px 12px" }}>Save</button>
        {/* Shares the form's hidden id; formAction routes it to the delete action. */}
        <button formAction={removeEntity} style={{ ...btnDanger, padding: "6px 12px" }}>Delete</button>
      </form>

      <div style={{ fontSize: 11, color: "var(--on-surface)", fontStyle: "italic", marginTop: 6 }}>
        {orphan ? (
          <span style={{ color: "var(--danger-on-surface)", fontStyle: "normal" }}>
            Orphan — mentioned in no chunk, so the chatbot can never reach it. Safe to delete.
          </span>
        ) : (
          <>
            {entity.mentions} mention{entity.mentions === 1 ? "" : "s"} · {entity.edges} relation
            {entity.edges === 1 ? "" : "s"}
            {entity.sources.length > 0 && ` · from ${entity.sources.join(", ")}`}
          </>
        )}
      </div>
    </div>
  );
}

// ── Relations ───────────────────────────────────────────────────────────────

function RelationsPane({ entities, edges }: { entities: GraphEntity[]; edges: GraphEdge[] }) {
  const [page, setPage] = useState(0);
  const shown = edges.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  return (
    <div>
      {edges.length === 0 ? (
        <p style={hint}>No relations extracted yet.</p>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {shown.map((e) => (
              <div key={e.id} style={edgeRow}>
                <span style={{ fontSize: 13, minWidth: 0 }}>
                  <strong>{e.fromName}</strong>{" "}
                  <span style={{ fontStyle: "italic", color: "var(--accent-on-surface)" }}>{e.relation}</span>{" "}
                  → <strong>{e.toName}</strong>
                </span>
                <form action={removeEntityEdge}>
                  <input type="hidden" name="id" value={e.id} />
                  <button style={{ ...btnDanger, padding: "3px 9px", fontSize: 12 }}>Delete</button>
                </form>
              </div>
            ))}
          </div>
          <Pager page={page} total={edges.length} onPage={setPage} noun="relations" />
        </>
      )}

      {entities.length >= 2 && (
        <form
          action={createEntityEdge}
          style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 14 }}
        >
          <select name="fromId" style={{ ...field, marginBottom: 0, maxWidth: 200 }}>
            {entities.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
          <input name="relation" placeholder="works at, built, uses…" required style={{ ...field, marginBottom: 0, maxWidth: 190 }} />
          <select name="toId" style={{ ...field, marginBottom: 0, maxWidth: 200 }}>
            {[...entities].reverse().map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
          <button style={btn}>Add relation</button>
        </form>
      )}
    </div>
  );
}

// ── Bits ────────────────────────────────────────────────────────────────────

function Pager({
  page,
  total,
  onPage,
  noun,
}: {
  page: number;
  total: number;
  onPage: (p: number) => void;
  noun: string;
}) {
  const pages = Math.ceil(total / PAGE_SIZE);
  if (pages <= 1) return null;
  const from = page * PAGE_SIZE + 1;
  const to = Math.min(total, (page + 1) * PAGE_SIZE);
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
      <button
        type="button"
        onClick={() => onPage(page - 1)}
        disabled={page === 0}
        style={{ ...btnGhost, padding: "5px 12px", opacity: page === 0 ? 0.4 : 1 }}
      >
        ← Prev
      </button>
      <span style={{ fontSize: 12, fontStyle: "italic" }}>
        {from}–{to} of {total} {noun}
      </span>
      <button
        type="button"
        onClick={() => onPage(page + 1)}
        disabled={page >= pages - 1}
        style={{ ...btnGhost, padding: "5px 12px", opacity: page >= pages - 1 ? 0.4 : 1 }}
      >
        Next →
      </button>
    </div>
  );
}

function PaneTab({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "7px 14px",
        borderRadius: "var(--radius-pill)",
        border: on ? "1px solid transparent" : "1px solid var(--border)",
        background: on ? "var(--primary)" : "transparent",
        color: on ? "var(--on-primary)" : "inherit",
        fontSize: 13,
        fontWeight: 600,
        fontStyle: on ? "normal" : "italic",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      {children}
    </button>
  );
}

function Count({ n }: { n: number }) {
  return (
    <span style={{ fontSize: 11, opacity: 0.75, fontWeight: 700 }}>{n}</span>
  );
}

const hint: React.CSSProperties = {
  color: "var(--on-surface)",
  fontStyle: "italic",
  fontSize: 13,
  marginBottom: 14,
};
const edgeRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "center",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "6px 12px",
};
