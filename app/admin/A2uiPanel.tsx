"use client";

import { useMemo, useState } from "react";
import { Cards } from "@/app/cards/Cards";
import { parseSampleBlock, type UiCardRow } from "@/lib/uiCards";
import { CARD_TOOLS } from "@/lib/canned";
import { saveCard, deleteCard } from "./actions";
import { panel, field, btn, btnGhost, btnDanger, SectionTitle, Label } from "./ui";

/**
 * The A2UI tab: the card catalog, one database row per card the chatbot can
 * draw. Each row stores the card's name, tool, when the agent should show it,
 * and a sample payload — rendered as a preview by the same Cards component the
 * chat uses, so the preview shows what the card looks like, not what the
 * site's data says. The starter set is seeded once; rows are editable,
 * addable and deletable from here.
 *
 * Collapsed by default: open, eight cards — two of which mount live fetches —
 * are a long scroll; closed, the tab reads as an index.
 */

type SortKey = "default" | "tool-asc" | "tool-desc";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "default", label: "Default order" },
  { key: "tool-asc", label: "Tool A–Z" },
  { key: "tool-desc", label: "Tool Z–A" },
];

const anchorId = (key: string) => `a2ui-${key}`;

export function A2uiPanel({ rows }: { rows: UiCardRow[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("default");
  const [open, setOpen] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = rows.filter(
      (r) =>
        !q ||
        r.label.toLowerCase().includes(q) ||
        r.tool.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.reason.toLowerCase().includes(q),
    );
    if (sort === "default") return filtered;
    const dir = sort === "tool-asc" ? 1 : -1;
    // Tie-break on label so rows sharing a tool hold a stable order.
    return [...filtered].sort(
      (a, b) => dir * (a.tool.localeCompare(b.tool) || a.label.localeCompare(b.label)),
    );
  }, [rows, query, sort]);

  const isOpen = (id: string) => open.includes(id);

  function toggle(id: string) {
    setOpen((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));
  }

  /** Jumping to a closed card opens it — landing on a bare heading is a dud. */
  function jumpTo(r: UiCardRow) {
    setOpen((o) => (o.includes(r.id) ? o : [...o, r.id]));
    document.getElementById(anchorId(r.key))?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <section data-fill="surface" style={panel}>
      <SectionTitle>A2UI cards</SectionTitle>
      <p style={{ color: "var(--on-surface)", fontStyle: "italic", fontSize: 13, marginBottom: 14 }}>
        The cards the chatbot can show in a conversation. These entries are
        live wiring: &ldquo;when the agent should show it&rdquo; goes into the
        chatbot&apos;s instructions, and deleting a card takes it away from the
        chatbot entirely. Deleting every card restores the starter set. Pick a
        card to draw its preview — previews render the stored sample, not your
        live data.
      </p>

      {/* ── Toolbar: search, sort, add ── */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search cards — name, tool, or when it's shown…"
          aria-label="Search cards"
          style={{ ...field, marginBottom: 0, flex: 1, minWidth: 220 }}
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          aria-label="Sort cards"
          style={{ ...field, marginBottom: 0, width: "auto" }}
        >
          {SORTS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        {open.length > 0 && (
          <button type="button" onClick={() => setOpen([])} style={btnGhost as React.CSSProperties}>
            Close all
          </button>
        )}
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          aria-expanded={adding}
          style={btn as React.CSSProperties}
        >
          {adding ? "Cancel" : "+ Add card"}
        </button>
      </div>

      {adding && (
        <div style={{ border: "1px solid var(--primary)", borderRadius: "var(--radius-md)", padding: 14, marginBottom: 18 }}>
          <strong style={{ fontSize: 14, display: "block", marginBottom: 10 }}>New card</strong>
          <CardForm />
        </div>
      )}

      {/* ── Table of contents ── */}
      {visible.length > 0 && (
        <nav
          aria-label="Cards on this tab"
          style={{
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            padding: "12px 14px",
            marginBottom: 22,
          }}
        >
          <div style={{ fontSize: 12, fontStyle: "italic", color: "var(--on-surface)", marginBottom: 8 }}>
            {visible.length} card{visible.length === 1 ? "" : "s"}
          </div>
          <ol style={{ display: "flex", flexWrap: "wrap", gap: 8, listStyle: "none", margin: 0, padding: 0 }}>
            {visible.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => jumpTo(r)}
                  style={{ ...(btnGhost as React.CSSProperties), fontStyle: "normal" }}
                >
                  {r.label}
                </button>
              </li>
            ))}
          </ol>
        </nav>
      )}

      {visible.length === 0 && (
        <p style={{ color: "var(--on-surface)", fontStyle: "italic", fontSize: 14 }}>
          {rows.length === 0
            ? "No cards yet. Add one above — the starter set only seeds an empty table once."
            : "No card matches that search."}
        </p>
      )}

      {visible.map((r, i) => (
        <div
          key={r.id}
          id={anchorId(r.key)}
          style={{
            marginBottom: i === visible.length - 1 ? 0 : isOpen(r.id) ? 26 : 10,
            scrollMarginTop: 12,
          }}
        >
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => toggle(r.id)}
              aria-expanded={isOpen(r.id)}
              aria-controls={`${anchorId(r.key)}-body`}
              style={rowToggle}
            >
              <span aria-hidden style={{ fontSize: 11, opacity: 0.7 }}>
                {isOpen(r.id) ? "▾" : "▸"}
              </span>
              <strong style={{ fontSize: 14 }}>{r.label}</strong>
              <code style={toolName}>{r.tool}</code>
              <span style={{ fontSize: 13, fontWeight: 400 }}>{r.description}</span>
            </button>
            <form action={deleteCard} style={{ marginLeft: "auto" }}>
              <input type="hidden" name="id" value={r.id} />
              <button aria-label={`Delete the ${r.label} card`} style={btnDanger as React.CSSProperties}>
                Delete
              </button>
            </form>
          </div>
          {isOpen(r.id) && (
            <div id={`${anchorId(r.key)}-body`}>
              {r.note && (
                <p style={{ fontSize: 12, fontStyle: "italic", color: "var(--accent-on-surface)", margin: "6px 0 0" }}>
                  {r.note}
                </p>
              )}
              <CardPreview raw={r.sampleBlock} />
              <details style={{ marginTop: 12 }}>
                <summary style={{ fontSize: 13, cursor: "pointer", color: "var(--on-surface)" }}>
                  Edit this card
                </summary>
                <div style={{ marginTop: 10 }}>
                  <CardForm row={r} />
                </div>
              </details>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}

function CardPreview({ raw }: { raw: string }) {
  const block = parseSampleBlock(raw);
  if (!block) {
    return (
      <p style={{ fontSize: 13, fontStyle: "italic", color: "var(--danger-on-surface)", margin: "8px 0 0" }}>
        The sample block isn&apos;t valid card JSON, so there&apos;s no preview. Fix it
        under &ldquo;Edit this card&rdquo;.
      </p>
    );
  }
  return (
    <div style={{ marginTop: 8 }}>
      <Cards block={block} />
    </div>
  );
}

/** Create (no row) or edit (row) — one server-action form either way. */
function CardForm({ row }: { row?: UiCardRow }) {
  return (
    <form action={saveCard}>
      {row && <input type="hidden" name="id" value={row.id} />}
      {row && <input type="hidden" name="key" value={row.key} />}
      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
        <div>
          <Label>Name</Label>
          <input name="label" defaultValue={row?.label ?? ""} placeholder="Gallery — carousel" style={field} />
        </div>
        <div>
          <Label>Tool that draws it</Label>
          <select name="tool" defaultValue={row?.tool ?? CARD_TOOLS[0]} style={field}>
            {CARD_TOOLS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>
      <Label>What it renders (one line)</Label>
      <input
        name="description"
        defaultValue={row?.description ?? ""}
        placeholder="Photos one at a time, with arrows and dots."
        style={field}
      />
      <Label>When the agent should show it</Label>
      <textarea
        name="reason"
        defaultValue={row?.reason ?? ""}
        rows={2}
        placeholder="When asked to see photos, a gallery, or pictures…"
        style={{ ...field, resize: "vertical" }}
      />
      <Label>Note (optional, shown on this tab)</Label>
      <input
        name="note"
        defaultValue={row?.note ?? ""}
        placeholder="Live card — reads your actual calendar."
        style={field}
      />
      <Label>Sample block (JSON the preview renders)</Label>
      <textarea
        name="sampleBlock"
        defaultValue={row?.sampleBlock ?? ""}
        rows={6}
        placeholder='{"type":"gallery","layout":"carousel","items":[…]}'
        spellCheck={false}
        style={{ ...field, resize: "vertical", fontFamily: "monospace", fontSize: 12 }}
      />
      <input type="hidden" name="order" value={row?.order ?? 0} />
      <button style={btn as React.CSSProperties}>{row ? "Save card" : "Add card"}</button>
    </form>
  );
}

/** The whole heading is the disclosure control, so the hit target is the row. */
const rowToggle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
  flex: 1,
  minWidth: 0,
  padding: "6px 0",
  background: "none",
  border: "none",
  color: "inherit",
  textAlign: "left",
  cursor: "pointer",
};

const toolName: React.CSSProperties = {
  fontSize: 12,
  padding: "3px 8px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border)",
  background: "var(--bg-soft)",
  color: "var(--on-bg-soft)",
};
