import { ENTITY_TYPES_LIST } from "@/lib/retrieval/entities";
import type { GraphEntity, GraphEdge, GraphStats } from "@/lib/retrieval/graph";
import { saveEntity, removeEntity, createEntityEdge, removeEntityEdge } from "./actions";
import { field, btn, btnGhost, btnDanger, SectionTitle, Label } from "./ui";

/**
 * The Graph tab: what the extractor pulled out of each source, and the controls
 * to correct it. Renaming an entity onto an existing name merges the two —
 * that's the fix for the same thing being extracted under two spellings, which
 * otherwise splits the graph and weakens one-hop expansion at retrieval time.
 */
export function GraphPanel({
  stats,
  entities,
  edges,
}: {
  stats: GraphStats;
  entities: GraphEntity[];
  edges: GraphEdge[];
}) {
  const mixedIndex = stats.embedModels.length > 1;

  return (
    <section data-fill="surface" style={{
      background: "var(--surface)",
      color: "var(--on-surface)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-md)",
      padding: 20,
      marginBottom: 20,
    }}>
      <SectionTitle>Knowledge graph</SectionTitle>
      <p style={hint}>
        Every source you add is split into chunks and read for the people, orgs, projects and
        topics it names, plus how they relate. The chatbot follows those relations to find
        facts a plain keyword match would miss — so a wrong or duplicated entity here shows up
        as a worse answer there. Fix them below.
      </p>

      <div style={statGrid}>
        <Stat label="Sources" value={stats.sources} />
        <Stat label="Chunks" value={stats.chunks} />
        <Stat label="Entities" value={stats.entities} />
        <Stat label="Relations" value={stats.edges} />
        <Stat label="Orphans" value={stats.orphanEntities} />
      </div>

      {/* Index health — both of these silently degrade retrieval. */}
      {stats.chunksWithoutEmbedding > 0 && (
        <Notice tone="danger">
          {stats.chunksWithoutEmbedding} chunk(s) have no embedding, so only keyword matching can
          find them. Re-run the reindex script to repair.
        </Notice>
      )}
      {mixedIndex && (
        <Notice tone="danger">
          Chunks are split across {stats.embedModels.length} embedding models (
          {stats.embedModels.map((m) => `${m.model}: ${m.count}`).join(", ")}). Similarity is only
          compared within one model, so part of your knowledge is keyword-only. Re-index
          everything to put it all on one model.
        </Notice>
      )}
      {!mixedIndex && stats.embedModels[0] && (
        <p style={hint}>
          All {stats.embedModels[0].count} chunks embedded with{" "}
          <strong>{stats.embedModels[0].model}</strong>.
        </p>
      )}

      {/* ── Entities ── */}
      <div style={divider}>
        <Label>Entities — rename to correct, or rename onto another to merge them</Label>
        {entities.length === 0 ? (
          <p style={hint}>Nothing extracted yet. Add a source on the Knowledge tab.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {entities.map((e) => (
              <EntityRow key={e.id} entity={e} />
            ))}
          </div>
        )}
      </div>

      {/* ── Relations ── */}
      <div style={divider}>
        <Label>Relations</Label>
        {edges.length === 0 ? (
          <p style={hint}>No relations extracted yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
            {edges.map((e) => (
              <div key={e.id} style={edgeRow}>
                <span style={{ fontSize: 13, minWidth: 0 }}>
                  <strong>{e.fromName}</strong>{" "}
                  <span style={{ fontStyle: "italic", color: "var(--accent-on-surface)" }}>
                    {e.relation}
                  </span>{" "}
                  → <strong>{e.toName}</strong>
                </span>
                <form action={removeEntityEdge}>
                  <input type="hidden" name="id" value={e.id} />
                  <button style={{ ...btnDanger, padding: "3px 9px", fontSize: 12 }}>Delete</button>
                </form>
              </div>
            ))}
          </div>
        )}

        {entities.length >= 2 && (
          <form action={createEntityEdge} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <select name="fromId" style={{ ...field, marginBottom: 0, maxWidth: 200 }}>
              {entities.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
            <input
              name="relation"
              placeholder="works at, built, uses…"
              required
              style={{ ...field, marginBottom: 0, maxWidth: 190 }}
            />
            <select name="toId" style={{ ...field, marginBottom: 0, maxWidth: 200 }}>
              {[...entities].reverse().map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
            <button style={btn}>Add relation</button>
          </form>
        )}
      </div>
    </section>
  );
}

/** One entity: where it came from, and the controls to correct or remove it. */
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
        <input
          name="name"
          defaultValue={entity.name}
          style={{ ...field, marginBottom: 0, flex: 1, minWidth: 160 }}
        />
        <select name="type" defaultValue={entity.type} style={{ ...field, marginBottom: 0, maxWidth: 130 }}>
          {ENTITY_TYPES_LIST.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <button style={{ ...btnGhost, padding: "6px 12px" }}>Save</button>
        {/* Shares the form's hidden id; formAction routes it to the delete action. */}
        <button formAction={removeEntity} style={{ ...btnDanger, padding: "6px 12px" }}>
          Delete
        </button>
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

function Notice({ tone, children }: { tone: "danger"; children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: 13,
        color: `var(--${tone}-on-surface)`,
        border: `1px solid color-mix(in srgb, var(--${tone}-on-surface) 45%, transparent)`,
        borderRadius: 8,
        padding: "8px 12px",
        marginBottom: 10,
      }}
    >
      {children}
    </p>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div data-fill="bg-soft" style={statTile}>
      <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "var(--font-heading)", lineHeight: 1.1 }}>
        {value}
      </div>
      <div style={statLabel}>{label}</div>
    </div>
  );
}

const hint: React.CSSProperties = {
  color: "var(--on-surface)",
  fontStyle: "italic",
  fontSize: 13,
  marginBottom: 14,
};
const statGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
  gap: 10,
  marginBottom: 14,
};
const statTile: React.CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 10,
  padding: "10px 12px",
  background: "var(--bg-soft)",
  color: "var(--on-bg-soft)",
};
const statLabel: React.CSSProperties = {
  fontSize: 11,
  fontStyle: "italic",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginTop: 2,
};
const divider: React.CSSProperties = {
  borderTop: "1px solid var(--border)",
  marginTop: 18,
  paddingTop: 16,
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
