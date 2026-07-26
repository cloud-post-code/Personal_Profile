import { prisma, getProfile } from "../db";
import { personaPromptBlock } from "../persona";
import { safeExperience, safeTags } from "../knowledge";
import { indexOrigin, dropOrigin, type IndexOpts } from "./indexer";

/**
 * Turns every admin surface into indexable text, so one graph covers
 * everything Blake curates instead of just the Knowledge tab's sources.
 *
 * Each function is best-effort at the call site: an indexing failure must
 * never fail the admin save that triggered it.
 *
 * ACTIVITY IS DELIBERATELY APPROVAL-GATED. Visitors type into the public chat
 * box, so their words are untrusted input. Indexing raw conversations would let
 * anyone write into the knowledge base and have it retrieved later as fact.
 * Only an assistant answer Blake has rated "up" is indexed, so nothing crosses
 * from a visitor into knowledge without him endorsing it.
 */

export const ORIGIN_KINDS = [
  "profile", "persona", "project", "photo", "source", "activity",
] as const;

/** Human label for the Graph tab's per-origin breakdown. */
export const ORIGIN_LABELS: Record<string, string> = {
  profile: "Profile",
  persona: "Persona",
  project: "Projects",
  photo: "Photos",
  source: "Knowledge",
  activity: "Approved answers",
};

/** Bio, experience and the "everything else" block from the Profile tab. */
export async function indexProfile(opts: IndexOpts = {}): Promise<void> {
  const p = await getProfile();
  const lines: string[] = [];
  if (p.bio) lines.push(p.bio.trim());
  if (p.experienceSummary) lines.push(p.experienceSummary.trim());
  for (const e of safeExperience(p.experience)) {
    const head = [e.role, e.company].filter(Boolean).join(" at ");
    const when = e.dates ? ` (${e.dates})` : "";
    lines.push(`${head}${when}${e.description ? `. ${e.description}` : ""}`);
  }
  if (p.other) lines.push(p.other.trim());
  if (p.location) lines.push(`${p.name} is based in ${p.location}.`);

  await indexOrigin(
    { kind: "profile", id: "profile", label: "Profile", text: lines.join("\n\n") },
    opts,
  );
}

/** The filled persona + agent-behavior sections. */
export async function indexPersona(opts: IndexOpts = {}): Promise<void> {
  const p = await getProfile();
  await indexOrigin(
    { kind: "persona", id: "persona", label: "Persona", text: personaPromptBlock(p.personaSections) },
    opts,
  );
}

/** One project card: name, blurb, the longer write-up, and its tags. */
export async function indexProject(id: string, opts: IndexOpts = {}): Promise<void> {
  const proj = await prisma.project.findUnique({ where: { id } });
  if (!proj) return dropOrigin("project", id);

  const tags = safeTags(proj.tags);
  const text = [
    `${proj.name}. ${proj.blurb}`.trim(),
    proj.detail?.trim() ?? "",
    tags.length ? `Tags: ${tags.join(", ")}.` : "",
    proj.githubUrl ? `Source code: ${proj.githubUrl}` : "",
    proj.liveUrl ? `Live at: ${proj.liveUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  await indexOrigin(
    { kind: "project", id, label: `Project: ${proj.name}`, text },
    opts,
  );
}

/** A photo's caption and its vision-generated description. */
export async function indexPhoto(id: string, opts: IndexOpts = {}): Promise<void> {
  const photo = await prisma.photo.findUnique({ where: { id } });
  if (!photo) return dropOrigin("photo", id);

  const text = [photo.caption?.trim() ?? "", photo.description?.trim() ?? ""]
    .filter(Boolean)
    .join("\n\n");

  await indexOrigin(
    { kind: "photo", id, label: `Photo: ${photo.filename}`, text },
    opts,
  );
}

/**
 * An answer Blake approved with 👍, indexed with the question it answered so
 * the pair reads as a self-contained fact. Any other rating drops it —
 * un-approving an answer removes it from knowledge.
 */
export async function indexApprovedAnswer(messageId: string, opts: IndexOpts = {}): Promise<void> {
  const msg = await prisma.chatMessage.findUnique({ where: { id: messageId } });
  if (!msg || msg.role !== "assistant" || msg.rating !== "up") {
    return dropOrigin("activity", messageId);
  }

  // The visitor's question is included only as context for an answer Blake
  // already vouched for — it is never indexed on its own.
  const question = await prisma.chatMessage.findFirst({
    where: { sessionId: msg.sessionId, role: "user", createdAt: { lt: msg.createdAt } },
    orderBy: { createdAt: "desc" },
    select: { content: true },
  });

  const text = [question ? `Question: ${question.content.trim()}` : "", msg.content.trim()]
    .filter(Boolean)
    .join("\n\n");

  await indexOrigin(
    { kind: "activity", id: messageId, label: "Approved answer", text },
    opts,
  );
}

/** Re-index every origin. Used by scripts/reindex.ts. */
export async function indexEverything(
  opts: IndexOpts & { onProgress?: (label: string) => void } = {},
): Promise<number> {
  const { onProgress, ...indexOpts } = opts;
  let done = 0;
  const step = async (label: string, run: () => Promise<void>) => {
    await run();
    done++;
    onProgress?.(label);
  };

  await step("Profile", () => indexProfile(indexOpts));
  await step("Persona", () => indexPersona(indexOpts));

  for (const p of await prisma.project.findMany({ select: { id: true, name: true } })) {
    await step(`Project: ${p.name}`, () => indexProject(p.id, indexOpts));
  }
  for (const ph of await prisma.photo.findMany({ select: { id: true, filename: true } })) {
    await step(`Photo: ${ph.filename}`, () => indexPhoto(ph.id, indexOpts));
  }
  const approved = await prisma.chatMessage.findMany({
    where: { role: "assistant", rating: "up" },
    select: { id: true },
  });
  for (const m of approved) {
    await step("Approved answer", () => indexApprovedAnswer(m.id, indexOpts));
  }
  return done;
}
