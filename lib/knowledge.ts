import { prisma, getProfile } from "./db";
import { personaPromptBlock } from "./persona";
import { retrieve, formatContext } from "./retrieval/search";
import { googleConfigured } from "./google";

/**
 * Assembles the chatbot's system prompt: a persona core (profile, projects,
 * photos, contact, A2UI instructions, corrections) plus knowledge for THIS
 * question, retrieved from the chunk/entity index built at ingest time.
 * The admin controls all of this content, so the bot only speaks from it.
 *
 * When no query is given, or nothing has been indexed yet (pre-backfill),
 * we fall back to the legacy dump of recent source summaries so the bot is
 * never knowledge-blind.
 *
 * The prompt also tells Claude HOW to use the A2UI tools (show_projects,
 * show_project, show_gallery) so it can render rich cards in chat.
 */
export async function buildSystemPrompt(query?: string): Promise<string> {
  const [profile, projects, photos, corrections, chunkCount] = await Promise.all([
    getProfile(),
    prisma.project.findMany({ orderBy: { order: "asc" } }),
    prisma.photo.findMany({ orderBy: { order: "asc" } }),
    // Admin corrections: bad answers Blake flagged with a note on the Activity
    // tab. These steer the bot away from repeating mistakes.
    prisma.chatMessage.findMany({
      where: { role: "assistant", rating: "down", note: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { note: true },
    }),
    prisma.chunk.count(),
  ]);

  // Just the index — id, name and links. Every project's blurb and write-up is
  // chunked and retrieved on demand, so the ids are here purely so show_project
  // can be called and the links can be quoted.
  const projectBlock = projects.length
    ? projects
        .map((p) => {
          const links = [
            p.githubUrl ? `GitHub: ${p.githubUrl}` : null,
            p.liveUrl ? `Live: ${p.liveUrl}` : null,
          ]
            .filter(Boolean)
            .join(" | ");
          return `- (id:${p.id}) ${p.name}${links ? ` [${links}]` : ""}`;
        })
        .join("\n")
    : "(No projects added yet.)";

  const sourceBlock = await knowledgeBlock(query, chunkCount);

  const photoBlock = photos.length
    ? `${photos.length} photo(s) available. Use show_gallery to display them.`
    : "(No photos uploaded yet.)";

  const correctionNotes = corrections
    .map((c) => c.note?.trim())
    .filter((n): n is string => !!n);
  const correctionBlock = correctionNotes.length
    ? `\n\nCORRECTIONS (Blake reviewed past answers and flagged these — follow them strictly, they override nothing factual above but tell you how to behave):\n${correctionNotes
        .map((n) => `- ${n}`)
        .join("\n")}`
    : "";

  // The booking tool is withheld from the model unless it can actually book, so
  // the instructions for it are withheld on the same condition — telling Claude
  // about a tool it hasn't been given is how you get an apology instead of a card.
  const canBook = profile.bookingEnabled && googleConfigured();

  const personaBlock =
    personaPromptBlock(profile.personaSections) ||
    "Warm, curious, a builder at heart. Enthusiastic about making useful things. Speaks plainly, with a bit of playful energy.";

  return `You are the personal AI host for ${profile.name}'s website. You speak on Blake's behalf to visitors — friendly, curious, and genuine, never corporate. Refer to Blake in the first person ("I", "my") as if you are him, unless a visitor asks something you have no information about.

PERSONA (who you are and how you behave — follow it in every answer):
${personaBlock}

WHO YOU ARE:
${profile.name}${profile.tagline ? ` — ${profile.tagline}` : ""}${
    profile.location ? `, based in ${profile.location}` : ""
  }.

HOW TO CONNECT:
${connectBlock(profile)}

PROJECT INDEX (ids for show_project; details come through KNOWLEDGE below):
${projectBlock}

PHOTOS:
${photoBlock}

KNOWLEDGE FOR THIS QUESTION (retrieved from everything Blake curates — his
profile and experience, persona, project write-ups, photo descriptions, saved
sources, and answers he approved. Each block is labelled with where it came
from):
${sourceBlock}

USING RICH CARDS (A2UI):
You have tools that render visual cards in the chat. Prefer them over plain text lists:
- When asked about projects generally, call show_projects (renders all project cards).
- When focused on ONE project, call show_project with its id.
- When asked to see photos / a gallery / pictures, call show_gallery. Choose layout "carousel" for a slideshow feel, or "filmstrip" for a browsable strip with a lightbox.
- When someone wants to connect, reach out, get in touch, hire, or collaborate, call show_contact_form so they can leave their details — then also mention the direct contact info above.${bookingBlock(canBook)}
Always add a short spoken sentence alongside a card — the card supplements your words, it doesn't replace them.

RULES:
- Only state facts present above. If you don't know, say so warmly and point them to how they can connect with Blake directly.
- For questions about Blake's history, background, or opinions, synthesize naturally from the KNOWLEDGE section — that's where his bio, experience and detail live now.
- Keep answers concise and conversational.
- Never invent projects, jobs, dates, or credentials.${correctionBlock}`;
}

/**
 * The knowledge section: retrieved chunks + entity relations when we have a
 * query and an index; the legacy summary dump otherwise.
 */
async function knowledgeBlock(query: string | undefined, chunkCount: number): Promise<string> {
  if (query?.trim() && chunkCount > 0) {
    try {
      return formatContext(await retrieve(query));
    } catch {
      // Retrieval trouble shouldn't kill the chat — fall through to the dump.
    }
  }
  const sources = await prisma.source.findMany({
    where: { status: "scanned" },
    orderBy: { createdAt: "desc" },
    take: 60,
  });
  if (!sources.length) return "(No sources extracted yet.)";
  return sources
    .map((s) => {
      const tags = safeTags(s.tags);
      const ref = s.url ?? s.filename ?? s.title ?? "(source)";
      return `- [${s.kind}/${s.type}] ${s.title ?? ref} — ${s.summary}${
        tags.length ? ` (tags: ${tags.join(", ")})` : ""
      }${s.url ? `\n  ${s.url}` : ""}`;
    })
    .join("\n");
}

/**
 * The booking instruction, only when there is a booking tool to instruct about.
 * Booking beats the contact form when the visitor wants a conversation: one is
 * a confirmed meeting, the other is a message in a queue.
 */
function bookingBlock(canBook: boolean): string {
  if (!canBook) return "";
  return `
- When someone wants to meet, talk, book a call, get time on the calendar, or asks when Blake is free, call show_booking. It shows his REAL open times from his live calendar and confirms the meeting on the spot — prefer it over show_contact_form whenever a conversation is what they want. Never state specific available times yourself; you don't have them, the card does.`;
}

function connectBlock(p: {
  email: string;
  linkedin: string;
  github: string;
  socials: string;
}): string {
  const lines: string[] = [];
  if (p.email) lines.push(`Email: ${p.email}`);
  if (p.linkedin) lines.push(`LinkedIn: ${p.linkedin}`);
  if (p.github) lines.push(`GitHub: ${p.github}`);
  for (const s of safeSocials(p.socials)) lines.push(`${s.label}: ${s.url}`);
  return lines.length ? lines.join("\n") : "(No contact info added yet.)";
}

export function safeSocials(raw: string): { label: string; url: string }[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v)
      ? v.filter((x) => x && x.label && x.url).map((x) => ({ label: String(x.label), url: String(x.url) }))
      : [];
  } catch {
    return [];
  }
}

export function safeTags(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

export type Experience = { role: string; company: string; dates: string; description: string };

export function safeExperience(raw: string): Experience[] {
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v
      .map((x) => ({
        role: String(x?.role ?? "").trim(),
        company: String(x?.company ?? "").trim(),
        dates: String(x?.dates ?? "").trim(),
        description: String(x?.description ?? "").trim(),
      }))
      .filter((x) => x.role || x.company || x.description);
  } catch {
    return [];
  }
}
