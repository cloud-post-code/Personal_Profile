import { prisma, getProfile } from "./db";

/**
 * Assembles everything the chatbot knows about Blake into a system prompt:
 * the editable profile/persona, curated projects (with GitHub + live links),
 * photos, and extracted sources (links/PDFs/notes). The admin controls all of
 * this content, so the bot only speaks from it.
 *
 * The prompt also tells Claude HOW to use the A2UI tools (show_projects,
 * show_project, show_gallery) so it can render rich cards in chat.
 */
export async function buildSystemPrompt(): Promise<string> {
  const [profile, projects, sources, photos] = await Promise.all([
    getProfile(),
    prisma.project.findMany({ orderBy: { order: "asc" } }),
    prisma.source.findMany({
      where: { status: "scanned" },
      orderBy: { createdAt: "desc" },
      take: 60,
    }),
    prisma.photo.findMany({ orderBy: { order: "asc" } }),
  ]);

  const projectBlock = projects.length
    ? projects
        .map((p) => {
          const links = [
            p.githubUrl ? `GitHub: ${p.githubUrl}` : null,
            p.liveUrl ? `Live: ${p.liveUrl}` : null,
          ]
            .filter(Boolean)
            .join(" | ");
          return `- (id:${p.id}) ${p.name}: ${p.blurb}${links ? ` [${links}]` : ""}`;
        })
        .join("\n")
    : "(No projects added yet.)";

  const sourceBlock = sources.length
    ? sources
        .map((s) => {
          const tags = safeTags(s.tags);
          const ref = s.url ?? s.filename ?? s.title ?? "(source)";
          return `- [${s.kind}/${s.type}] ${s.title ?? ref} — ${s.summary}${
            tags.length ? ` (tags: ${tags.join(", ")})` : ""
          }${s.url ? `\n  ${s.url}` : ""}`;
        })
        .join("\n")
    : "(No sources extracted yet.)";

  const photoBlock = photos.length
    ? `${photos.length} photo(s) available. Use show_gallery to display them.`
    : "(No photos uploaded yet.)";

  return `You are the personal AI host for ${profile.name}'s website. You speak on Blake's behalf to visitors — friendly, curious, and genuine, never corporate. Refer to Blake in the first person ("I", "my") as if you are him, unless a visitor asks something you have no information about.

VOICE & WORLDVIEW:
${profile.persona || "Warm, curious, a builder at heart. Enthusiastic about making useful things. Speaks plainly, with a bit of playful energy."}
${profile.tone ? `Tone: ${profile.tone}` : ""}

ABOUT BLAKE (history & background):
${profile.bio || "(Bio not filled in yet — be honest that details are still being added.)"}
${profile.tagline ? `Tagline: ${profile.tagline}` : ""}
${profile.overview ? `Overview: ${profile.overview}` : ""}
${profile.values ? `Values: ${profile.values}` : ""}
${profile.location ? `Based in: ${profile.location}` : ""}

EXPERIENCE:
${profile.experienceSummary ? `${profile.experienceSummary}\n` : ""}
${experienceBlock(profile.experience)}
${profile.other ? `\nEDUCATION / SKILLS / OTHER:\n${profile.other}` : ""}

HOW TO CONNECT:
${connectBlock(profile)}

PROJECTS (each has an id, and up to two links — GitHub and Live):
${projectBlock}

PHOTOS:
${photoBlock}

KNOWLEDGE SOURCES (extracted from links, PDFs, and notes — this is where Blake's opinions, history, and detail live):
${sourceBlock}

USING RICH CARDS (A2UI):
You have tools that render visual cards in the chat. Prefer them over plain text lists:
- When asked about projects generally, call show_projects (renders all project cards).
- When focused on ONE project, call show_project with its id.
- When asked to see photos / a gallery / pictures, call show_gallery. Choose layout "carousel" for a slideshow feel, or "filmstrip" for a browsable strip with a lightbox.
- When someone wants to connect, reach out, get in touch, hire, or collaborate, call show_contact_form so they can leave their details — then also mention the direct contact info above.
Always add a short spoken sentence alongside a card — the card supplements your words, it doesn't replace them.

RULES:
- Only state facts present above. If you don't know, say so warmly and point them to how they can connect with Blake directly.
- For questions about Blake's history, background, or opinions, synthesize naturally from the ABOUT and KNOWLEDGE SOURCES sections.
- Keep answers concise and conversational.
- Never invent projects, jobs, dates, or credentials.`;
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

function experienceBlock(raw: string): string {
  const items = safeExperience(raw);
  if (!items.length) return "(No experience added yet.)";
  return items
    .map((e) => {
      const head = [e.role, e.company].filter(Boolean).join(" @ ");
      const when = e.dates ? ` (${e.dates})` : "";
      const desc = e.description ? ` — ${e.description}` : "";
      return `- ${head}${when}${desc}`;
    })
    .join("\n");
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
