"use client";

import { useMemo, useState } from "react";
import { Cards, type UiBlock } from "@/app/cards/Cards";
import { panel, field, btnGhost, btnDanger, SectionTitle } from "./ui";

/**
 * The A2UI tab: one worked sample of every card the chatbot can put in a
 * conversation, rendered by the same component the chat uses.
 *
 * The samples run on invented data rather than the real Projects/Photos rows on
 * purpose. A preview that reads from the database shows an empty state on a
 * fresh install — exactly when someone most needs to see what the cards look
 * like — and it changes shape every time content is edited, so it stops being a
 * reference. Fixed sample data means this tab always answers "what does
 * show_gallery actually draw?".
 *
 * The booking card is the one exception: it has no static form. It fetches live
 * free/busy on mount, so it renders here in whatever state the calendar is
 * actually in, and is labelled as live.
 */

/** A flat placeholder image, so the gallery samples need no uploads. */
function swatch(label: string, bg: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320">` +
    `<rect width="480" height="320" fill="${bg}"/>` +
    `<text x="240" y="172" text-anchor="middle" font-family="sans-serif" ` +
    `font-size="24" fill="#ffffff">${label}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const SAMPLE_PHOTOS = [
  {
    id: "s1",
    src: swatch("Sample photo 1", "#3b4a63"),
    description: "A sample photo. Real captions come from Claude's description of the upload.",
    caption: "Sample one",
  },
  {
    id: "s2",
    src: swatch("Sample photo 2", "#5a4a63"),
    description: "The second sample, so the arrows and dots have somewhere to go.",
    caption: "Sample two",
  },
  {
    id: "s3",
    src: swatch("Sample photo 3", "#3f5a52"),
    description: "The third sample — the filmstrip scrolls once there are enough.",
    caption: "Sample three",
  },
];

const SAMPLE_PROJECTS = [
  {
    id: "sample-a",
    name: "Sample Project A",
    blurb: "A one-line blurb — this is the line that sells the project.",
    detail:
      "The longer write-up, hidden behind Learn more. It is the place for how it "
      + "was built, what was hard, and what it does now.",
    githubUrl: "https://github.com/example/sample-a",
    liveUrl: "https://example.com",
    imageUrl: swatch("Project image", "#33415c"),
    tags: ["typescript", "next.js"],
  },
  {
    id: "sample-b",
    name: "Sample Project B",
    blurb: "No image and no live link — the card closes up around what is missing.",
    detail: null,
    githubUrl: "https://github.com/example/sample-b",
    liveUrl: null,
    imageUrl: null,
    tags: ["python"],
  },
  {
    id: "sample-c",
    name: "Sample Project C",
    blurb: "Links but no image, and a detail paragraph to expand.",
    detail: "Learn more shows this. Keep it to a paragraph or two.",
    githubUrl: null,
    liveUrl: "https://example.com",
    imageUrl: null,
    tags: ["react", "postgres"],
  },
];

/** Five roles, so the "earlier roles" fold is on show — the card holds four. */
const SAMPLE_TIMELINE = [
  {
    role: "Sample Role",
    company: "Sample Company",
    dates: "2023 – present",
    description: "What the role covers, in the voice the rest of the site uses.",
  },
  {
    role: "Previous Role",
    company: "Earlier Company",
    dates: "2021 – 2023",
    description: "Dates are free text, so they read however they were typed.",
  },
  { role: "Third Role", company: "Another Company", dates: "2019 – 2021", description: "" },
  {
    role: "Fourth Role",
    company: "One More Company",
    dates: "Summer '18",
    description: "The fourth entry is the last one shown before the fold.",
  },
  {
    role: "Fifth Role",
    company: "The First Company",
    dates: "2016 – 2018",
    description: "This one sits behind the fold until the visitor asks for it.",
  },
];

const SAMPLE_BOOKING_URL = "https://cal.example.com/sample/intro";

type Sample = {
  /** Stable across sort and filter — the anchor id and the dismiss key. */
  id: string;
  label: string;
  tool: string;
  renders: string;
  note?: string;
  block: UiBlock;
};

/** Every sample on the tab: the tool that emits it, and the block it renders. */
const SAMPLES: Sample[] = [
  {
    id: "projects",
    label: "All projects",
    tool: "show_projects",
    renders: "Every project, as a grid of cards.",
    block: { type: "projects", items: SAMPLE_PROJECTS },
  },
  {
    id: "project",
    label: "Single project",
    tool: "show_project",
    renders: "One project by id, drawn wider than the grid card.",
    block: { type: "project", item: SAMPLE_PROJECTS[0] },
  },
  {
    id: "gallery-carousel",
    label: "Gallery — carousel",
    tool: "show_gallery",
    renders: "Photos one at a time, with arrows and dots.",
    block: { type: "gallery", layout: "carousel", items: SAMPLE_PHOTOS },
  },
  {
    id: "gallery-filmstrip",
    label: "Gallery — filmstrip",
    tool: "show_gallery",
    renders: "The same photos as thumbnails — tap for the lightbox.",
    block: { type: "gallery", layout: "filmstrip", items: SAMPLE_PHOTOS },
  },
  {
    id: "timeline",
    label: "Experience timeline",
    tool: "show_timeline",
    renders: "Work history from your Experience editor, as a vertical timeline.",
    block: {
      type: "timeline",
      items: SAMPLE_TIMELINE,
      summary: "A one-paragraph summary in your own prose, above the roles.",
    },
  },
  {
    id: "contact",
    label: "Contact form",
    tool: "show_contact_form",
    renders: "The in-chat contact form, posted to /api/contact.",
    note: "Live form — anything sent from here lands in Contacts like a real visitor message.",
    block: { type: "contact", bookingLink: SAMPLE_BOOKING_URL },
  },
  {
    id: "booking-link",
    label: "Booking link",
    tool: "show_booking",
    renders: "Your external scheduler, when a booking link is set.",
    block: { type: "booking_link", url: SAMPLE_BOOKING_URL, name: "Blake" },
  },
  {
    id: "booking-live",
    label: "Live booking",
    tool: "show_booking",
    renders: "Real open times, when booking is on and Google is connected.",
    note: "Live card — it reads your actual calendar, so it shows the state booking is really in.",
    block: { type: "booking" },
  },
];

type SortKey = "default" | "tool-asc" | "tool-desc";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "default", label: "Default order" },
  { key: "tool-asc", label: "Tool A–Z" },
  { key: "tool-desc", label: "Tool Z–A" },
];

const anchorId = (id: string) => `a2ui-${id}`;

export function A2uiPanel() {
  const [query, setQuery] = useState("");
  // Dismissals live in component state, not the database: this tab is a
  // reference, and hiding a card you have already read is a "clear my view"
  // action, not a setting. Restore all puts them back, and so does a reload —
  // which the counter next to the button says out loud, so nobody thinks they
  // have switched a card off for visitors.
  const [hidden, setHidden] = useState<string[]>([]);
  const [sort, setSort] = useState<SortKey>("default");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = SAMPLES.filter((s) => !hidden.includes(s.id)).filter(
      (s) =>
        !q ||
        s.label.toLowerCase().includes(q) ||
        s.tool.toLowerCase().includes(q) ||
        s.renders.toLowerCase().includes(q),
    );
    if (sort === "default") return rows;
    const dir = sort === "tool-asc" ? 1 : -1;
    // Tie-break on label so the two show_gallery and two show_booking samples
    // hold a stable order against each other instead of shuffling.
    return [...rows].sort(
      (a, b) => dir * (a.tool.localeCompare(b.tool) || a.label.localeCompare(b.label)),
    );
  }, [query, hidden, sort]);

  function jumpTo(id: string) {
    document.getElementById(anchorId(id))?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <section data-fill="surface" style={panel}>
      <SectionTitle>A2UI</SectionTitle>
      <p style={{ color: "var(--on-surface)", fontStyle: "italic", fontSize: 13, marginBottom: 14 }}>
        The rich cards the chatbot can show in a conversation. Each one below is
        a sample on invented content, drawn by the same component visitors see —
        so this is what the card looks like, not what your data says.
      </p>

      {/* ── Toolbar: search and sort ── */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search cards — name, tool, or what it draws…"
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
        {hidden.length > 0 && (
          <button type="button" onClick={() => setHidden([])} style={btnGhost as React.CSSProperties}>
            Restore {hidden.length} hidden
          </button>
        )}
      </div>

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
            {visible.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => jumpTo(s.id)}
                  style={{ ...(btnGhost as React.CSSProperties), fontStyle: "normal" }}
                >
                  {s.label}
                </button>
              </li>
            ))}
          </ol>
        </nav>
      )}

      {visible.length === 0 && (
        <p style={{ color: "var(--on-surface)", fontStyle: "italic", fontSize: 14 }}>
          {hidden.length > 0 && !query.trim()
            ? "Every card is hidden. Restore them with the button above."
            : "No card matches that search."}
        </p>
      )}

      {visible.map((s, i) => (
        <div
          key={s.id}
          id={anchorId(s.id)}
          style={{ marginBottom: i === visible.length - 1 ? 0 : 26, scrollMarginTop: 12 }}
        >
          <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap", marginBottom: 4 }}>
            <strong style={{ fontSize: 14 }}>{s.label}</strong>
            <code style={toolName}>{s.tool}</code>
            <span style={{ fontSize: 13, color: "var(--on-surface)" }}>{s.renders}</span>
            <button
              type="button"
              onClick={() => setHidden((h) => [...h, s.id])}
              aria-label={`Hide the ${s.label} card`}
              style={{ ...(btnDanger as React.CSSProperties), marginLeft: "auto" }}
            >
              Delete
            </button>
          </div>
          {s.note && (
            <p style={{ fontSize: 12, fontStyle: "italic", color: "var(--accent-on-surface)", margin: "0 0 8px" }}>
              {s.note}
            </p>
          )}
          <div style={{ marginTop: 8 }}>
            <Cards block={s.block} />
          </div>
        </div>
      ))}
    </section>
  );
}

const toolName: React.CSSProperties = {
  fontSize: 12,
  padding: "3px 8px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border)",
  background: "var(--bg-soft)",
  color: "var(--on-bg-soft)",
};
