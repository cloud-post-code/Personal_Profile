import { Cards, type UiBlock } from "@/app/cards/Cards";
import { panel, SectionTitle } from "./ui";

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

/** Every sample on the tab: the tool that emits it, and the block it renders. */
const SAMPLES: { tool: string; renders: string; note?: string; block: UiBlock }[] = [
  {
    tool: "show_projects",
    renders: "Every project, as a grid of cards.",
    block: { type: "projects", items: SAMPLE_PROJECTS },
  },
  {
    tool: "show_project",
    renders: "One project by id, drawn wider than the grid card.",
    block: { type: "project", item: SAMPLE_PROJECTS[0] },
  },
  {
    tool: "show_gallery",
    renders: "Photos as a carousel — one at a time, arrows and dots.",
    block: { type: "gallery", layout: "carousel", items: SAMPLE_PHOTOS },
  },
  {
    tool: "show_gallery",
    renders: "The same photos as a filmstrip — thumbnails, tap for the lightbox.",
    block: { type: "gallery", layout: "filmstrip", items: SAMPLE_PHOTOS },
  },
  {
    tool: "show_timeline",
    renders: "Work history from your Experience editor, as a vertical timeline.",
    block: { type: "timeline", items: SAMPLE_TIMELINE, summary: "A one-paragraph summary in your own prose, above the roles." },
  },
  {
    tool: "show_contact_form",
    renders: "The in-chat contact form, posted to /api/contact.",
    note: "Live form — anything sent from here lands in Contacts like a real visitor message.",
    block: { type: "contact", bookingLink: SAMPLE_BOOKING_URL },
  },
  {
    tool: "show_booking",
    renders: "Your external scheduler, when a booking link is set.",
    block: { type: "booking_link", url: SAMPLE_BOOKING_URL, name: "Blake" },
  },
  {
    tool: "show_booking",
    renders: "Real open times, when booking is on and Google is connected.",
    note: "Live card — it reads your actual calendar, so it shows the state booking is really in.",
    block: { type: "booking" },
  },
];

export function A2uiPanel() {
  return (
    <section data-fill="surface" style={panel}>
      <SectionTitle>A2UI</SectionTitle>
      <p style={{ color: "var(--on-surface)", fontStyle: "italic", fontSize: 13, marginBottom: 18 }}>
        The rich cards the chatbot can show in a conversation. Each one below is
        a sample on invented content, drawn by the same component visitors see —
        so this is what the card looks like, not what your data says.
      </p>
      {SAMPLES.map((s, i) => (
        <div key={`${s.tool}-${i}`} style={{ marginBottom: i === SAMPLES.length - 1 ? 0 : 26 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap", marginBottom: 4 }}>
            <code style={toolName}>{s.tool}</code>
            <span style={{ fontSize: 13, color: "var(--on-surface)" }}>{s.renders}</span>
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
