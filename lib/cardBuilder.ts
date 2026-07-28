import { claude, claudeModel } from "@/lib/claude";
import { CARD_TOOLS, type CardTool } from "@/lib/canned";
import { parseSampleBlock, swatch } from "@/lib/uiCards";

/**
 * The AI card builder: turns a plain-text description ("a card that shows my
 * three best projects with a fun blurb") into a complete draft card — name,
 * tool, purpose text and a renderable sample block — and revises the draft
 * from feedback. The admin never has to hand-write block JSON; the builder
 * page previews each draft with the chat's own Cards component and only
 * saveUiCard()'s validation-checked output ever reaches the database.
 */

export type CardDraft = {
  label: string;
  tool: string;
  description: string;
  reason: string;
  note: string;
  /** JSON string of the UiBlock the preview renders. */
  sampleBlock: string;
};

/** The card type each tool is allowed to draw — a mismatch is a broken card. */
const TOOL_TO_TYPE: Record<CardTool, string> = {
  show_projects: "projects",
  show_project: "project",
  show_gallery: "gallery",
  show_timeline: "timeline",
  show_contact_form: "contact",
  show_booking: "booking",
  show_booking_link: "booking_link",
  show_card: "custom",
};

const BUILDER_BRIEF = `You design "A2UI cards" for a personal portfolio site's chatbot. A card is a rich UI block the chatbot can draw in a conversation. Your job: turn the owner's description into ONE card definition.

There are two ways to build a card. FIRST decide which fits:

1. A LIVE-DATA card, when the owner wants the site's own content (their projects, photos, work history, contact form, booking). These hydrate from the database at chat time, so their sample is ILLUSTRATIVE ("Sample Project A" style). Tools and exact sample shapes ("type" must match the tool):
- show_projects → {"type":"projects","items":[ProjectCard, …]} — a grid of project cards
- show_project → {"type":"project","item":ProjectCard} — one project, drawn wide
- show_gallery → {"type":"gallery","layout":"carousel"|"filmstrip","items":[PhotoCard, …]} — photos
- show_timeline → {"type":"timeline","items":[TimelineEntry, …],"summary":"one short paragraph"} — work history
- show_contact_form → {"type":"contact","bookingLink":null} — the in-chat contact form
- show_booking → {"type":"booking"} — live open times from the calendar (no other fields)
- show_booking_link → {"type":"booking_link","url":"https://…","name":"Blake"} — external scheduler link

2. A CUSTOM card (tool "show_card"), for anything else — services and prices, an FAQ, testimonials, a skills breakdown, whatever the owner describes. You design it yourself from typed elements, and the content you write IS what visitors will see (nothing is hydrated later — write it fully and well). Shape:
{"type":"custom","title":"…","elements":[Element, …]}
Element is one of:
{"kind":"heading","text":"…"} | {"kind":"text","text":"…"} | {"kind":"list","items":["…"]} | {"kind":"badges","items":["…"]} | {"kind":"stats","items":[{"label":"…","value":"…"}]} | {"kind":"buttons","items":[{"label":"…","url":"https://…"}]} | {"kind":"image","src":"placeholder"} | {"kind":"quote","text":"…","by":"…"} | {"kind":"divider"}

Field shapes for live-data samples:
ProjectCard = {"id":string,"name":string,"blurb":string,"detail":string|null,"githubUrl":string|null,"liveUrl":string|null,"imageUrl":string|null,"tags":[string,…]}
PhotoCard = {"id":string,"src":string,"description":string,"caption":string|null}
TimelineEntry = {"role":string,"company":string,"dates":string,"description":string}

Rules:
- Prefer a live-data tool when the intent clearly matches one; design a custom card for everything else.
- For every image field (src, imageUrl), use the exact string "placeholder" — the system swaps it for a generated placeholder image. Never use a real URL for images.
- In a custom card, only include facts the owner actually stated. Where you need specifics they didn't give (a price, a link), keep it generic and flag it in "note" so they know to revise.
- "reason" is the instruction the chatbot will actually receive about when to show this card. Write it as guidance, starting "When …".
- "note" is an optional admin-facing caveat; usually "".

Respond with ONLY a JSON object (no prose, no code fences):
{"label":"…","tool":"show_…","description":"one line on what it renders","reason":"When …","note":"","sampleBlock":{…the block object…}}`;

/** Minimal client surface, injectable for tests (same pattern as answerDrafts). */
export type BuilderClient = {
  messages: {
    create(req: {
      model: string;
      max_tokens: number;
      system: string;
      messages: { role: "user" | "assistant"; content: string }[];
    }): Promise<{ content: unknown[] }>;
  };
};

export type BuilderDeps = { client?: BuilderClient };

/**
 * Draft a card from a description, or revise a draft from feedback. The
 * revision call replays the description and current draft as conversation
 * turns, so feedback like "make it three photos" edits rather than restarts.
 */
export async function draftUiCard(
  input: { instructions: string; current?: CardDraft; feedback?: string },
  deps: BuilderDeps = {},
): Promise<CardDraft> {
  const instructions = input.instructions.trim();
  if (!instructions) throw new Error("Describe the card you want first.");

  const messages: { role: "user" | "assistant"; content: string }[] = [
    { role: "user", content: instructions },
  ];
  if (input.current && input.feedback?.trim()) {
    messages.push(
      { role: "assistant", content: draftToJson(input.current) },
      { role: "user", content: `Revise the card with this feedback: ${input.feedback.trim()}` },
    );
  }

  const client = deps.client ?? claude();
  const response = await client.messages.create({
    model: claudeModel(),
    max_tokens: 2000,
    system: BUILDER_BRIEF,
    messages,
  });

  return parseDraft(textOf(response.content));
}

function textOf(content: unknown[]): string {
  return content
    .map((b) => (b && typeof b === "object" && "text" in b ? String((b as { text: unknown }).text) : ""))
    .join("");
}

function draftToJson(d: CardDraft): string {
  return JSON.stringify({ ...d, sampleBlock: JSON.parse(d.sampleBlock) });
}

/**
 * Parse and validate a model response into a draft. Every failure throws a
 * message the builder page can show next to a "try again" — a malformed
 * completion must cost one retry, never a saved broken card.
 */
export function parseDraft(raw: string): CardDraft {
  // Models fence JSON out of habit even when told not to.
  const stripped = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(stripped) as Record<string, unknown>;
  } catch {
    throw new Error("The model's response wasn't valid JSON — try again.");
  }

  const label = String(parsed.label ?? "").trim();
  if (!label) throw new Error("The draft is missing a name — try again.");
  const tool = String(parsed.tool ?? "");
  if (!CARD_TOOLS.includes(tool as CardTool)) {
    throw new Error(`The draft names an unknown tool "${tool}" — try again.`);
  }

  const rawBlock = parsed.sampleBlock;
  if (!rawBlock || typeof rawBlock !== "object") {
    throw new Error("The draft is missing its sample block — try again.");
  }
  const withImages = substitutePlaceholders(rawBlock as Record<string, unknown>, label);
  const sampleBlock = JSON.stringify(withImages);
  const block = parseSampleBlock(sampleBlock);
  if (!block) throw new Error("The draft's sample block isn't a renderable card — try again.");
  if (block.type !== TOOL_TO_TYPE[tool as CardTool]) {
    throw new Error(
      `The sample is a "${block.type}" block but ${tool} draws "${TOOL_TO_TYPE[tool as CardTool]}" — try again.`,
    );
  }

  return {
    label,
    tool,
    description: String(parsed.description ?? "").trim(),
    reason: String(parsed.reason ?? "").trim(),
    note: String(parsed.note ?? "").trim(),
    sampleBlock,
  };
}

/** Rotating flat colors for generated placeholder images. */
const SWATCH_COLORS = ["#3b4a63", "#5a4a63", "#3f5a52", "#33415c", "#5c4433"];

/**
 * Swap every "placeholder" image the model emitted (and any non-data URL — the
 * preview must never fetch an external image the model invented) for a
 * generated flat swatch. Walks the block structurally, so it covers items in
 * arrays as well as top-level fields.
 */
function substitutePlaceholders(node: Record<string, unknown>, label: string): Record<string, unknown> {
  let i = 0;
  const next = () => SWATCH_COLORS[i++ % SWATCH_COLORS.length];
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if ((k === "src" || k === "imageUrl") && typeof val === "string" && val && !val.startsWith("data:")) {
          out[k] = swatch(label, next());
        } else {
          out[k] = walk(val);
        }
      }
      return out;
    }
    return v;
  };
  return walk(node) as Record<string, unknown>;
}
