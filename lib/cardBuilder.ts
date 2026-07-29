import { claude, cardBuilderModel } from "@/lib/claude";
import { prisma, getProfile } from "@/lib/db";
import { safeTags, safeExperience } from "@/lib/knowledge";
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

/** The card types each tool may draw — a mismatch is a broken card. */
const TOOL_TO_TYPES: Record<CardTool, string[]> = {
  show_projects: ["projects"],
  show_project: ["project"],
  show_gallery: ["gallery"],
  show_timeline: ["timeline"],
  show_contact_form: ["contact"],
  show_booking: ["booking"],
  show_booking_link: ["booking_link"],
  show_card: ["custom", "html"],
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

2. A CUSTOM card (tool "show_card"), for simple content that fits stock elements — an FAQ, testimonials, a short list. The content you write IS what visitors will see (nothing is hydrated later — write it fully and well). Shape:
{"type":"custom","title":"…","elements":[Element, …]}
Element is one of:
{"kind":"heading","text":"…"} | {"kind":"text","text":"…"} | {"kind":"list","items":["…"]} | {"kind":"badges","items":["…"]} | {"kind":"stats","items":[{"label":"…","value":"…"}]} | {"kind":"buttons","items":[{"label":"…","url":"https://…"}]} | {"kind":"image","src":"placeholder"} | {"kind":"quote","text":"…","by":"…"} | {"kind":"divider"}

3. A CODED card (also tool "show_card"), whenever the design calls for a layout the stock elements can't express — a word cloud, a pricing grid, a skill meter, any bespoke visual. You are the coding agent here: write real HTML with inline CSS yourself. As with custom cards, what you write IS what visitors see. Shape:
{"type":"html","html":"<div style=\"…\">…</div>","height":320}
Coding rules (violations fail validation or render blank):
- Inline CSS only: style attributes and/or one <style> tag. NO <script>, no event-handler attributes (onclick etc.), no <iframe>/<object>/<embed>/<form>/<link>/<meta> — the card runs in a sealed sandbox that refuses to execute anything, and validation rejects markup that looks executable.
- The sandbox blocks ALL external requests: outside images, fonts and stylesheets will not load. Draw visuals with CSS and inline SVG, or data: URIs.
- Links need target="_blank" (the sandbox cannot navigate the page it sits in).
- "height" is the rendered height in px (40–1200): size it to the content, it does not auto-grow.

DESIGN SYSTEM for coded cards — this is the site's real system; colors, edges and text MUST follow it, and validation enforces the hard rules:
- COLORS (enforced): only the theme variables, or color-mix() blends of them for shades — raw hex/rgb()/hsl() values are rejected. Backgrounds/fills/borders: var(--bg-soft), var(--surface), var(--primary), var(--accent), var(--border). Shade example: color-mix(in srgb, var(--primary) 35%, transparent).
- TEXT COLOR (enforced, this one bites): the "color" property may ONLY use the readable-on tokens — var(--on-bg-soft) for normal text, var(--accent-on-bg-soft) for emphasis, var(--success-on-bg-soft)/var(--danger-on-bg-soft) for status, var(--on-primary) on a primary background, var(--on-surface) on a surface background — or color-mix() blends of those (keep the token at ≥55% so text stays legible). NEVER color text with var(--primary)/var(--accent)/var(--surface) directly: on many themes those sit close to the card background and the text becomes invisible. Vary word-cloud emphasis with font-size, font-weight and ≥55% color-mix opacity of the on-tokens, not with brand colors. The same rule applies to SVG fill/stroke on text-bearing shapes.
- TEXT (enforced): never declare a concrete font-family — headings already use the site's heading font (h1 17px, h2 15px, h3 14px) and body text is already 14px/1.55 in the site font; font-family declarations that don't reference a var() are rejected. Secondary/caption text: 11–12px, often italic. Tags: 11px, var(--accent-on-bg-soft), "#" prefix, no background.
- EDGES: containers use border:1px solid var(--border) with border-radius var(--radius-md); small controls var(--radius-sm); pills and dots var(--radius-pill). Don't invent other corner treatments.
- BUTTONS: primary = background var(--primary), color var(--on-primary), no border, padding 10px 18px, radius var(--radius-sm); secondary = transparent, 1px solid var(--border), italic.
- SPACING: ~16px container padding, 8–12px gaps.
- Everything the theme does NOT specify — layout, composition, proportions, word-cloud sizing, chart shapes — is yours to design freely.

Field shapes for live-data samples:
ProjectCard = {"id":string,"name":string,"blurb":string,"detail":string|null,"githubUrl":string|null,"liveUrl":string|null,"imageUrl":string|null,"tags":[string,…]}
PhotoCard = {"id":string,"src":string,"description":string,"caption":string|null}
TimelineEntry = {"role":string,"company":string,"dates":string,"description":string}

Rules:
- Prefer a live-data tool when the intent clearly matches site content; stock elements for simple text cards; CODED html when the layout is the point.
- Custom and coded card content comes from the REAL SITE DATA section below — real project names, real tags, real roles. Never invent facts; where the data is silent, stay generic and say so in "note".
- For every image field (src, imageUrl), use the exact string "placeholder" — the system swaps it for a generated placeholder image. Never use a real URL for images.
- In a custom card, only include facts the owner actually stated. Where you need specifics they didn't give (a price, a link), keep it generic and flag it in "note" so they know to revise.
- "reason" is the instruction the chatbot will actually receive about when to show this card. Write it as guidance, starting "When …".
- "note" is an optional admin-facing caveat; usually "".

Respond with ONLY a JSON object (no prose, no code fences):
{"label":"…","tool":"show_…","description":"one line on what it renders","reason":"When …","note":"","sampleBlock":{…the block object…}}`;

/**
 * The site's actual content, given to the drafting model so custom and coded
 * cards are built FROM real data instead of invented "typical" examples. A
 * card listing project tags carries Blake's real tags; the model only stays
 * generic where the data is silent. Best-effort: a DB hiccup degrades to
 * drafting without data, not a dead builder.
 */
async function siteDataBrief(): Promise<string> {
  try {
    const [profile, projects, photoCount] = await Promise.all([
      getProfile(),
      prisma.project.findMany({ orderBy: { order: "asc" } }),
      prisma.photo.count(),
    ]);
    const lines: string[] = ["REAL SITE DATA (build card content from this — do not invent facts):"];
    lines.push(`Owner: ${profile.name}${profile.tagline ? ` — ${profile.tagline}` : ""}${profile.location ? `, ${profile.location}` : ""}`);
    if (projects.length) {
      lines.push("Projects (name | tags | blurb):");
      for (const p of projects.slice(0, 20)) {
        lines.push(`- ${p.name} | ${safeTags(p.tags).join(", ") || "(no tags)"} | ${p.blurb.slice(0, 140)}`);
      }
    } else {
      lines.push("Projects: none added yet.");
    }
    const roles = safeExperience(profile.experience);
    if (roles.length) {
      lines.push("Experience (role @ company, dates):");
      for (const r of roles.slice(0, 12)) lines.push(`- ${r.role} @ ${r.company}, ${r.dates}`);
    }
    lines.push(`Photos: ${photoCount} uploaded.`);
    return lines.join("\n").slice(0, 3500);
  } catch {
    return "REAL SITE DATA: (unavailable right now — keep content generic and flag it in the note.)";
  }
}

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
  const system = `${BUILDER_BRIEF}\n\n${await siteDataBrief()}`;
  // Agentic self-correction: a draft that fails validation goes back to the
  // model WITH the validation error, once. The errors are written as
  // instructions ("use the theme variables…"), so the second attempt usually
  // lands; only a second failure surfaces to the admin.
  let convo = messages;
  for (let attempt = 0; ; attempt++) {
    const response = await client.messages.create({
      model: cardBuilderModel(),
      // Coded cards carry full HTML documents; don't truncate them mid-tag.
      max_tokens: 4000,
      system,
      messages: convo,
    });
    const raw = textOf(response.content);
    try {
      return parseDraft(raw);
    } catch (e) {
      if (attempt >= 1) throw e;
      convo = [
        ...convo,
        { role: "assistant", content: raw },
        {
          role: "user",
          content:
            `That response failed validation: ${(e as Error).message} ` +
            "Respond again with ONLY the corrected JSON object.",
        },
      ];
    }
  }
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
  const allowed = TOOL_TO_TYPES[tool as CardTool];
  if (!allowed.includes(block.type)) {
    throw new Error(
      `The sample is a "${block.type}" block but ${tool} draws ${allowed.map((t) => `"${t}"`).join(" or ")} — try again.`,
    );
  }
  if (block.type === "html") enforceThemedHtml(block.html);

  return {
    label,
    tool,
    description: String(parsed.description ?? "").trim(),
    reason: String(parsed.reason ?? "").trim(),
    note: String(parsed.note ?? "").trim(),
    sampleBlock,
  };
}

/**
 * The theme-fidelity gate for coded cards: colors, edges and text must come
 * from the site's design system. Colors and fonts are checkable mechanically,
 * so they are enforced here; layout stays the model's to design. Thrown
 * messages are instructions — the drafting loop feeds them back to the model
 * for a corrected attempt.
 */
function enforceThemedHtml(html: string): void {
  if (/#[0-9a-fA-F]{3,8}\b|(?:rgb|hsl)a?\s*\(/.test(html)) {
    throw new Error(
      "The coded card hard-codes colors. Use only the theme variables (var(--primary), "
      + "var(--on-bg-soft), …) or color-mix() blends of them — try again.",
    );
  }
  // Text must use the readable-on tokens. Raw brand tokens as text color are
  // the invisible-words bug: on themes where --primary sits near the card
  // surface, a word cloud colored var(--primary) renders as a blank card.
  const colorDecl = /(?:^|[;{"\s'])color\s*:\s*([^;"'}]+)/gi;
  for (let m = colorDecl.exec(html); m; m = colorDecl.exec(html)) {
    const value = m[1].trim();
    if (/^(inherit|currentcolor|transparent)$/i.test(value)) continue;
    if (!/var\(--[a-z0-9-]*on-[a-z0-9-]*\)/i.test(value)) {
      throw new Error(
        `The coded card colors text with "${value}", which can vanish against the card `
        + "background on some themes. Color text ONLY with the readable-on tokens — "
        + "var(--on-bg-soft), var(--accent-on-bg-soft), var(--success-on-bg-soft), "
        + "var(--on-primary) on primary — or color-mix() of them — try again.",
      );
    }
  }
  // A font-family that names a real font drifts off-theme; one that references
  // a var() (or inherit) rides the theme. The body font needs no declaration.
  const fontDecl = /font-family\s*:\s*([^;"'}]+)/gi;
  for (let m = fontDecl.exec(html); m; m = fontDecl.exec(html)) {
    if (!/var\(|inherit/i.test(m[1])) {
      throw new Error(
        "The coded card sets a concrete font-family. Text inherits the site's fonts; "
        + "use var(--font-heading) for headings or omit font-family — try again.",
      );
    }
  }
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
