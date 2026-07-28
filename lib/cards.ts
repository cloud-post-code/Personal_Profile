import { prisma, getProfile } from "./db";
import { safeTags, safeExperience } from "./knowledge";

/**
 * Shapes the data the A2UI cards render. The chat route calls these to hydrate
 * the tool blocks Claude emits (show_projects / show_project / show_gallery)
 * into concrete payloads the frontend renders as cards.
 */

export type ProjectCard = {
  id: string;
  name: string;
  blurb: string;
  detail: string | null;
  githubUrl: string | null;
  liveUrl: string | null;
  imageUrl: string | null;
  tags: string[];
};

export type PhotoCard = {
  id: string;
  src: string;
  description: string;
  caption: string | null;
};

export type TimelineEntry = {
  role: string;
  company: string;
  dates: string;
  description: string;
};

/**
 * One element of a custom-designed card. A closed vocabulary rather than
 * markup: the card builder's model output becomes visitor-facing UI, and a
 * fixed set of typed elements is what keeps that safe and on-theme.
 */
export type CustomElement =
  | { kind: "heading"; text: string }
  | { kind: "text"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "badges"; items: string[] }
  | { kind: "stats"; items: { label: string; value: string }[] }
  | { kind: "buttons"; items: { label: string; url: string }[] }
  | { kind: "image"; src: string; alt?: string }
  | { kind: "quote"; text: string; by?: string }
  | { kind: "divider" };

export type UiBlock =
  | { type: "projects"; items: ProjectCard[] }
  | { type: "project"; item: ProjectCard | null }
  | { type: "gallery"; layout: "carousel" | "filmstrip"; items: PhotoCard[] }
  // A card designed in the admin card builder. Unlike the tool-drawn blocks
  // above, the stored content IS the card — nothing is hydrated at chat time.
  | { type: "custom"; title?: string; elements: CustomElement[] }
  // Optional because older stored blocks (canned answers, A2A payloads) predate
  // the field; absent reads the same as "no link configured".
  | { type: "contact"; bookingLink?: string | null }
  // Entries in the order Blake stored them, and a one-paragraph summary that is
  // his own prose, not a join of the entries.
  | { type: "timeline"; items: TimelineEntry[]; summary: string }
  // The slots are deliberately NOT resolved here. They are live free/busy that
  // goes stale in minutes, and a card sitting in a scrolled-back chat carrying
  // baked-in times would offer a slot that is long gone. The card fetches
  // /api/booking/slots when it mounts, and again after a lost race.
  | { type: "booking" }
  // The external scheduler (Calendly etc.). Unlike live slots a URL does not go
  // stale, so it is carried in the block.
  | { type: "booking_link"; url: string; name: string };

function toProjectCard(p: {
  id: string;
  name: string;
  blurb: string;
  detail: string | null;
  githubUrl: string | null;
  liveUrl: string | null;
  imageUrl: string | null;
  tags: string;
}): ProjectCard {
  return {
    id: p.id,
    name: p.name,
    blurb: p.blurb,
    detail: p.detail,
    githubUrl: p.githubUrl,
    liveUrl: p.liveUrl,
    imageUrl: p.imageUrl,
    tags: safeTags(p.tags),
  };
}

export async function allProjectsBlock(): Promise<UiBlock> {
  const projects = await prisma.project.findMany({ orderBy: { order: "asc" } });
  return { type: "projects", items: projects.map(toProjectCard) };
}

export async function singleProjectBlock(id: string): Promise<UiBlock> {
  const p = await prisma.project.findUnique({ where: { id } });
  return { type: "project", item: p ? toProjectCard(p) : null };
}

/**
 * Blake's work history, straight off the Profile row.
 *
 * The stored order is preserved rather than sorted: `dates` is free text the
 * admin types ("2021–2024", "Summer '19", "2023 – present"), and a sort that
 * has to guess at that would reorder a correct list into a wrong one. The order
 * in the Experience editor IS the order on the card.
 */
export async function experienceTimelineBlock(): Promise<UiBlock> {
  const profile = await getProfile();
  return {
    type: "timeline",
    items: safeExperience(profile.experience),
    summary: profile.experienceSummary.trim(),
  };
}

/** The contact form, plus the external booking link when Blake has one. */
export async function contactBlock(): Promise<UiBlock> {
  const profile = await getProfile();
  return { type: "contact", bookingLink: profile.bookingLink.trim() || null };
}

/**
 * The external scheduler as its own card. Null when the link isn't set: a
 * canned answer can still name the tool after the link is cleared, and it must
 * not draw a card pointing nowhere.
 */
export async function bookingLinkBlock(): Promise<UiBlock | null> {
  const profile = await getProfile();
  const url = profile.bookingLink.trim();
  return url ? { type: "booking_link", url, name: profile.name } : null;
}

/** The external booking URL ("" when unset), for tool-offer gating. */
export async function bookingLinkUrl(): Promise<string> {
  return (await getProfile()).bookingLink.trim();
}

export async function galleryBlock(
  layout: "carousel" | "filmstrip",
): Promise<UiBlock> {
  const photos = await prisma.photo.findMany({ orderBy: { order: "asc" } });
  return {
    type: "gallery",
    layout,
    items: photos.map((ph) => ({
      id: ph.id,
      src: `/api/uploads/${ph.filename}`,
      description: ph.description || ph.caption || "",
      caption: ph.caption,
    })),
  };
}
