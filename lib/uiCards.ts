import { prisma } from "@/lib/db";
import { CARD_TOOLS, type CardTool } from "@/lib/canned";
import type { UiBlock } from "@/lib/cards";

/**
 * The A2UI card catalog: one row per card the chatbot can draw, holding its
 * name, the tool that draws it, the guidance for when the agent should show
 * it, and a stored sample payload the admin tab renders as a preview.
 *
 * The catalog drives the chatbot: lib/brain.ts offers a tool only when a row
 * names it, and lib/knowledge.ts builds the "when to use each card" prompt
 * section from the rows' reasons. Deleting a row therefore takes the card away
 * from the agent, and editing a reason steers it. The one thing a row can
 * never do is force a tool past its live-state gate (toolUsableNow) — the
 * booking tools stay withheld while they cannot actually book.
 *
 * Data only, like lib/canned.ts — rendering belongs to the admin panel.
 */

export type UiCardRow = {
  id: string;
  key: string;
  label: string;
  tool: string;
  description: string;
  reason: string;
  note: string;
  sampleBlock: string;
  order: number;
};

const BLOCK_TYPES = [
  "projects",
  "project",
  "gallery",
  "contact",
  "timeline",
  "booking",
  "booking_link",
] as const;

/**
 * Parse a stored sample into a renderable block, or null when it isn't one.
 * Sample JSON is admin-typed free text, so a typo must degrade into "no
 * preview", never a crashed dashboard.
 */
export function parseSampleBlock(raw: string): UiBlock | null {
  try {
    const v = JSON.parse(raw);
    if (
      v &&
      typeof v === "object" &&
      (BLOCK_TYPES as readonly string[]).includes((v as { type?: string }).type ?? "")
    ) {
      return v as UiBlock;
    }
    return null;
  } catch {
    return null;
  }
}

export async function listUiCards(): Promise<UiCardRow[]> {
  return prisma.uiCard.findMany({ orderBy: [{ order: "asc" }, { createdAt: "asc" }] });
}

/** Write one row from the admin form. A blank id creates. */
export async function saveUiCard(input: {
  id?: string;
  key: string;
  label: string;
  tool: string;
  description: string;
  reason: string;
  note: string;
  sampleBlock: string;
  order?: number;
}): Promise<string | null> {
  const label = input.label.trim();
  if (!label) return "The card needs a name.";
  const tool = CARD_TOOLS.includes(input.tool as CardTool) ? input.tool : null;
  if (!tool) return `Unknown tool "${input.tool}".`;

  const sampleBlock = input.sampleBlock.trim() || "{}";
  if (sampleBlock !== "{}" && !parseSampleBlock(sampleBlock)) {
    return "Sample block must be JSON with a \"type\" of: " + BLOCK_TYPES.join(", ") + ".";
  }

  // The key anchors deep links and the starter seed; a hand-typed one is
  // normalized rather than rejected, and a blank one is derived from the label.
  const key =
    (input.key.trim() || label)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "card";

  const data = {
    key,
    label,
    tool,
    description: input.description.trim(),
    reason: input.reason.trim(),
    note: input.note.trim(),
    sampleBlock,
    order: input.order ?? 0,
  };

  // `key` is unique. When another row already owns it, write there and drop
  // the row being edited — the same merge-on-collision the canned answers do —
  // instead of throwing a raw constraint error out of the form.
  const owner = await prisma.uiCard.findUnique({ where: { key } });
  if (owner && owner.id !== input.id) {
    await prisma.uiCard.update({ where: { id: owner.id }, data });
    if (input.id) await prisma.uiCard.delete({ where: { id: input.id } });
    return null;
  }

  if (input.id) {
    await prisma.uiCard.update({ where: { id: input.id }, data });
  } else {
    await prisma.uiCard.create({ data });
  }
  return null;
}

export async function deleteUiCard(id: string) {
  await prisma.uiCard.delete({ where: { id } });
}

export type CardGuidance = { tool: string; reason: string };

/**
 * Whether a card's tool can succeed RIGHT NOW. The booking tools depend on
 * live admin state (calendar connected, link pasted); a catalog row can put a
 * tool in play, but it can never force one past this gate — gates only narrow.
 * knowledge.ts and brain.ts both filter through here, so the tool offered to
 * the model and the instructions about it are withheld on the same condition.
 */
export function toolUsableNow(
  tool: string,
  live: { canBook: boolean; hasBookingLink: boolean },
): boolean {
  if (tool === "show_booking") return live.canBook;
  if (tool === "show_booking_link") return live.hasBookingLink;
  return true;
}

/**
 * The catalog as the chatbot consumes it: which tools exist and when to use
 * them. Falls back to the starter set when the table is empty — a visitor can
 * chat before the dashboard has ever seeded it — and when the read fails,
 * because a DB hiccup must degrade to stock guidance, not a card-less bot.
 */
export async function cardCatalog(): Promise<CardGuidance[]> {
  try {
    const rows = await prisma.uiCard.findMany({
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      select: { tool: true, reason: true },
    });
    if (rows.length > 0) return rows;
  } catch {
    // fall through to starters
  }
  return STARTER_CARDS.map((c) => ({ tool: c.tool, reason: c.reason }));
}

/**
 * Fill an EMPTY table with the starter cards — one per card the chatbot can
 * currently draw. Never tops up a non-empty table: a missing row is a
 * deletion Blake made on purpose.
 */
export async function seedStarterUiCards() {
  if ((await prisma.uiCard.count()) > 0) return;
  await prisma.uiCard.createMany({
    data: STARTER_CARDS.map((c, i) => ({ ...c, order: i })),
    skipDuplicates: true,
  });
}

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

/**
 * The starter rows: every card the chatbot can currently draw. The `reason`
 * texts are the same guidance lib/knowledge.ts gives the model today, so the
 * seeded catalog documents the behavior that actually ships.
 */
const STARTER_CARDS: Omit<UiCardRow, "id" | "order">[] = [
  {
    key: "projects",
    label: "All projects",
    tool: "show_projects",
    description: "Every project, as a grid of cards.",
    reason: "When asked about projects generally — it renders all project cards.",
    note: "",
    sampleBlock: JSON.stringify({ type: "projects", items: SAMPLE_PROJECTS }),
  },
  {
    key: "project",
    label: "Single project",
    tool: "show_project",
    description: "One project by id, drawn wider than the grid card.",
    reason: "When asked about one specific project — it renders that card alone.",
    note: "",
    sampleBlock: JSON.stringify({ type: "project", item: SAMPLE_PROJECTS[0] }),
  },
  {
    key: "gallery-carousel",
    label: "Gallery — carousel",
    tool: "show_gallery",
    description: "Photos one at a time, with arrows and dots.",
    reason:
      "When asked to see photos, a gallery, or pictures. Choose layout \"carousel\" "
      + "for a slideshow feel.",
    note: "",
    sampleBlock: JSON.stringify({ type: "gallery", layout: "carousel", items: SAMPLE_PHOTOS }),
  },
  {
    key: "gallery-filmstrip",
    label: "Gallery — filmstrip",
    tool: "show_gallery",
    description: "The same photos as thumbnails — tap for the lightbox.",
    reason:
      "When asked to see photos, a gallery, or pictures. Choose layout \"filmstrip\" "
      + "for a browsable strip with a lightbox.",
    note: "",
    sampleBlock: JSON.stringify({ type: "gallery", layout: "filmstrip", items: SAMPLE_PHOTOS }),
  },
  {
    key: "timeline",
    label: "Experience timeline",
    tool: "show_timeline",
    description: "Work history from your Experience editor, as a vertical timeline.",
    reason:
      "When asked about experience, background, career, work history, a CV or resume, "
      + "or where Blake has worked. Speak to the arc of it; leave the roles, companies "
      + "and dates to the card rather than listing them again.",
    note: "",
    sampleBlock: JSON.stringify({
      type: "timeline",
      items: SAMPLE_TIMELINE,
      summary: "A one-paragraph summary in your own prose, above the roles.",
    }),
  },
  {
    key: "contact",
    label: "Contact form",
    tool: "show_contact_form",
    description: "The in-chat contact form, posted to /api/contact.",
    reason:
      "When someone wants to connect, reach out, get in touch, hire, or collaborate — "
      + "so they can leave their details. Then also mention the direct contact info "
      + "from HOW TO CONNECT.",
    note: "Live form — anything sent from here lands in Contacts like a real visitor message.",
    sampleBlock: JSON.stringify({ type: "contact", bookingLink: SAMPLE_BOOKING_URL }),
  },
  {
    key: "booking-link",
    label: "Booking link",
    tool: "show_booking_link",
    description: "Your external scheduler, when a booking link is set.",
    reason:
      "When the visitor asks for a link to schedule later or share with someone else. "
      + "Prefer show_booking's live times when booking is on.",
    note: "",
    sampleBlock: JSON.stringify({
      type: "booking_link",
      url: SAMPLE_BOOKING_URL,
      name: "Blake",
    }),
  },
  {
    key: "booking-live",
    label: "Live booking",
    tool: "show_booking",
    description: "Real open times, when booking is on and Google is connected.",
    reason:
      "When someone wants to meet, talk, book a call, get time on the calendar, or "
      + "asks when Blake is free. It shows REAL open times from the live calendar and "
      + "confirms on the spot — never state available times yourself.",
    note: "Live card — it reads your actual calendar, so it shows the state booking is really in.",
    sampleBlock: JSON.stringify({ type: "booking" }),
  },
];
