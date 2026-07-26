"use client";

import { useState } from "react";
import { ENTITY_TYPES_LIST } from "@/lib/retrieval/entities";
import type { GraphEntity, GraphEdge } from "@/lib/retrieval/graph";
import { GraphCanvas } from "./GraphCanvas";
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
