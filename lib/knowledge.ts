import { prisma, getProfile } from "./db";

/**
 * Assembles everything the chatbot knows about Blake into a system prompt:
 * the editable profile/persona, curated projects, and scanned links.
 * The admin controls all of this content, so the bot only speaks from it.
 */
export async function buildSystemPrompt(): Promise<string> {
  const [profile, projects, links] = await Promise.all([
    getProfile(),
    prisma.project.findMany({ orderBy: { order: "asc" } }),
    prisma.link.findMany({
      where: { status: "scanned" },
      orderBy: { createdAt: "desc" },
      take: 40,
    }),
  ]);

  const projectBlock = projects.length
    ? projects
        .map(
          (p) =>
            `- ${p.name}${p.url ? ` (${p.url})` : ""}: ${p.blurb}`,
        )
        .join("\n")
    : "(No projects added yet.)";

  const linkBlock = links.length
    ? links
        .map((l) => {
          const tags = safeTags(l.tags);
          return `- [${l.kind}] ${l.title ?? l.url} — ${l.summary}${
            tags.length ? ` (tags: ${tags.join(", ")})` : ""
          }\n  ${l.url}`;
        })
        .join("\n")
    : "(No links scanned yet.)";

  return `You are the personal AI host for ${profile.name}'s website. You speak on Blake's behalf to visitors — friendly, curious, and genuine, never corporate. Refer to Blake in the first person ("I", "my") as if you are him, unless a visitor asks something you have no information about.

VOICE & WORLDVIEW:
${profile.persona || "Warm, curious, a builder at heart. Enthusiastic about making useful things. Speaks plainly, with a bit of playful energy."}

ABOUT BLAKE:
${profile.bio || "(Bio not filled in yet — be honest that details are still being added.)"}
${profile.tagline ? `Tagline: ${profile.tagline}` : ""}

HOW TO CONNECT:
${connectBlock(profile)}

PROJECTS:
${projectBlock}

RECENT LINKS / POSTS (LinkedIn, articles, project pages):
${linkBlock}

RULES:
- Only state facts present above. If you don't know, say so warmly and point them to how they can connect with Blake directly.
- Keep answers concise and conversational — a few short paragraphs at most.
- When relevant, share the actual URLs above so visitors can click through.
- Never invent projects, jobs, dates, or credentials.`;
}

function connectBlock(p: {
  email: string;
  linkedin: string;
  github: string;
}): string {
  const lines: string[] = [];
  if (p.email) lines.push(`Email: ${p.email}`);
  if (p.linkedin) lines.push(`LinkedIn: ${p.linkedin}`);
  if (p.github) lines.push(`GitHub: ${p.github}`);
  return lines.length ? lines.join("\n") : "(No contact info added yet.)";
}

export function safeTags(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}
