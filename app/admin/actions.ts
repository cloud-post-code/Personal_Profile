"use server";

// Ensure the `File` global exists even during Next's build-time page-data
// collection on Node runtimes where it isn't defined (Railway). Node 20+ ships
// File in node:buffer; we pull it onto globalThis as a safety net.
import { File as NodeFile } from "node:buffer";
if (typeof (globalThis as { File?: unknown }).File === "undefined") {
  (globalThis as { File?: unknown }).File = NodeFile;
}

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma, getProfile } from "@/lib/db";
import { checkPassword, createSession, destroySession, isAuthed } from "@/lib/auth";
import { extractLink, extractDocument, extractText, fileToText, writeProfileFromResume } from "@/lib/scrape";
import { indexSource } from "@/lib/retrieval/indexer";
import { renameEntity, deleteEntity, addEdge, deleteEdge } from "@/lib/retrieval/graph";
import { dropOrigin } from "@/lib/retrieval/indexer";
import {
  indexProfile,
  indexPersona,
  indexProject,
  indexPhoto,
  indexApprovedAnswer,
} from "@/lib/retrieval/origins";
import { saveCannedAnswer, deleteCannedAnswer } from "@/lib/canned";
import { redraftAnswer } from "@/lib/answerDrafts";
import { safeExperience, safeSocials } from "@/lib/knowledge";
import { PERSONA_SECTIONS, writePersonaSections } from "@/lib/persona";
import { formatWeeklyHours, type WeeklyHours } from "@/lib/booking/slots";
import { disconnectGoogleCalendar } from "@/lib/googleConnection";
import { COLOR_ROLES } from "@/lib/theme";
import { saveUpload, saveBytes } from "@/lib/uploads";
import { describeImage } from "@/lib/vision";
import path from "node:path";

async function requireAuth() {
  if (!(await isAuthed())) redirect("/admin");
}

/**
 * Chunk + embed + entity-extract a freshly scanned source, inline with the
 * ingest request. Best-effort: an indexing failure must never un-scan the
 * source (retrieval falls back to its summary until a rescan/reindex).
 */
async function indexScanned(sourceId: string): Promise<void> {
  await reindex(`source ${sourceId}`, () => indexSource(sourceId));
}

/**
 * Re-index one origin inline with the admin save that changed it, so edits are
 * retrievable immediately. Best-effort by design: indexing calls the embedding
 * and extraction APIs, and neither may ever cost Blake a saved edit.
 */
async function reindex(label: string, run: () => Promise<void>): Promise<void> {
  try {
    await run();
  } catch (e) {
    console.error(`reindex(${label}) failed:`, e);
  }
}

/**
 * Duck-typed uploaded-file check. We avoid `instanceof File` because the `File`
 * global isn't defined during Next's build-time page-data collection on some
 * Node runtimes (Railway), which throws a ReferenceError at build. A real
 * FormData upload is a Blob-like with arrayBuffer()/size/name.
 */
type UploadLike = { arrayBuffer: () => Promise<ArrayBuffer>; size: number; name: string; type: string };
function isUpload(v: FormDataEntryValue | null): v is File {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as UploadLike).arrayBuffer === "function" &&
    typeof (v as UploadLike).size === "number"
  );
}

function revalidateAll() {
  revalidatePath("/admin/dashboard");
  revalidatePath("/projects");
  revalidatePath("/");
}

// ── Auth ──
export async function login(formData: FormData) {
  const pw = String(formData.get("password") ?? "");
  if (!checkPassword(pw)) redirect("/admin?error=1");
  await createSession();
  redirect("/admin/dashboard");
}

export async function logout() {
  await destroySession();
  redirect("/admin");
}

// ── Details (identity + contact + socials) ──
export async function saveDetails(formData: FormData) {
  await requireAuth();
  await getProfile();

  // Socials arrive as parallel label[]/url[] arrays; zip into JSON.
  const labels = formData.getAll("social_label").map(String);
  const urls = formData.getAll("social_url").map(String);
  const socials = labels
    .map((label, i) => ({ label: label.trim(), url: (urls[i] ?? "").trim() }))
    .filter((s) => s.label && s.url);

  await prisma.profile.update({
    where: { id: 1 },
    data: {
      name: String(formData.get("name") ?? "Blake"),
      location: String(formData.get("location") ?? ""),
      email: String(formData.get("email") ?? ""),
      linkedin: String(formData.get("linkedin") ?? ""),
      github: String(formData.get("github") ?? ""),
      socials: JSON.stringify(socials),
    },
  });
  revalidateAll();
}

/**
 * The whole Profile tab saves at once: identity, contact, socials, bio, the
 * experience overview paragraph, the experience cards, and "other". One form,
 * one button — so nothing is silently left unsaved in another section.
 */
export async function saveProfile(formData: FormData) {
  await requireAuth();
  await getProfile();

  // Socials arrive as parallel label[]/url[] arrays; zip into JSON.
  const labels = formData.getAll("social_label").map(String);
  const urls = formData.getAll("social_url").map(String);
  const socials = labels
    .map((label, i) => ({ label: label.trim(), url: (urls[i] ?? "").trim() }))
    .filter((s) => s.label && s.url);

  const experience = safeExperience(String(formData.get("experience") ?? "[]"));

  await prisma.profile.update({
    where: { id: 1 },
    data: {
      name: String(formData.get("name") ?? "Blake"),
      location: String(formData.get("location") ?? ""),
      email: String(formData.get("email") ?? ""),
      github: String(formData.get("github") ?? ""),
      socials: JSON.stringify(socials),
      bio: String(formData.get("bio") ?? ""),
      experienceSummary: String(formData.get("experienceSummary") ?? ""),
      experience: JSON.stringify(experience),
      other: String(formData.get("other") ?? ""),
    },
  });
  await reindex("profile", indexProfile);
  revalidateAll();
}

/**
 * Resume upload: Claude parses the file and splits it into every Profile
 * destination — bio, experience cards, an "everything else" block, plus
 * name/location/email/socials. Only fills fields the resume actually contains;
 * never overwrites existing values with blanks. Socials are merged (deduped by
 * url) with any already saved.
 */
export async function uploadResume(formData: FormData) {
  await requireAuth();
  const file = formData.get("file");
  if (!isUpload(file) || file.size === 0) return;
  const bytes = Buffer.from(await file.arrayBuffer());
  const { text } = await fileToText(bytes, file.name);
  const parsed = await writeProfileFromResume(text);

  const profile = await getProfile();
  const data: Record<string, string> = {};
  if (parsed.bio) data.bio = parsed.bio;
  if (parsed.experience.length) data.experience = JSON.stringify(parsed.experience);
  if (parsed.experienceSummary) data.experienceSummary = parsed.experienceSummary;
  if (parsed.other) data.other = parsed.other;
  if (parsed.name) data.name = parsed.name;
  if (parsed.location) data.location = parsed.location;
  if (parsed.email) data.email = parsed.email;

  // Merge socials with existing (keep existing; add new urls not already there).
  if (parsed.socials.length) {
    const existing = safeSocials(profile.socials);
    const seen = new Set(existing.map((s) => s.url));
    const merged = [...existing, ...parsed.socials.filter((s) => !seen.has(s.url))];
    data.socials = JSON.stringify(merged);
  }

  if (Object.keys(data).length) {
    await prisma.profile.update({ where: { id: 1 }, data });
    await reindex("profile", indexProfile);
  }
  revalidateAll();
}

// ── Persona (the section catalogue in lib/persona.ts) ──
export async function savePersona(formData: FormData) {
  await requireAuth();
  await getProfile();

  // Driven by the catalogue so adding a section can't silently fail to save.
  const sections: Record<string, string> = {};
  for (const s of PERSONA_SECTIONS) {
    sections[s.key] = String(formData.get(`section_${s.key}`) ?? "");
  }

  await prisma.profile.update({
    where: { id: 1 },
    data: { tagline: String(formData.get("tagline") ?? "") },
  });
  await writePersonaSections(sections);
  await reindex("persona", indexPersona);
  revalidateAll();
}

// ── Theme (aesthetic description + the design tokens the site renders from) ──
export async function saveTheme(formData: FormData) {
  await requireAuth();
  await getProfile();

  // Driven by COLOR_ROLES so adding a role to the design panel can't silently
  // fail to save. Only valid hex values are stored — a blank or malformed entry
  // is omitted entirely so the role falls back to its default rather than being
  // persisted as an empty string.
  const colors: Record<string, string> = {};
  for (const role of COLOR_ROLES) {
    const v = String(formData.get(`color_${role.key}`) ?? "").trim();
    if (/^#[0-9a-fA-F]{3,8}$/.test(v)) colors[role.key] = v;
  }

  await prisma.profile.update({
    where: { id: 1 },
    data: {
      aesthetic: String(formData.get("aesthetic") ?? ""),
      themeFont: String(formData.get("themeFont") ?? "space-grotesk"),
      themeBodyFont: String(formData.get("themeBodyFont") ?? "inter"),
      themeRadius: String(formData.get("themeRadius") ?? "rounded"),
      themeFontSize: String(formData.get("themeFontSize") ?? "").trim(),
      themeHeadingWeight: String(formData.get("themeHeadingWeight") ?? "").trim(),
      themeColors: JSON.stringify(colors),
    },
  });
  revalidateAll();
}

/** Headshot image upload. */
export async function uploadHeadshot(formData: FormData) {
  await requireAuth();
  const file = formData.get("file");
  if (!isUpload(file) || file.size === 0) return;
  const filename = await saveUpload(file);
  await getProfile();
  await prisma.profile.update({
    where: { id: 1 },
    data: { headshot: `/api/uploads/${filename}` },
  });
  revalidateAll();
}

// ── Sources (unified extraction: link / pdf / text) ──
export async function addSource(formData: FormData) {
  await requireAuth();
  const type = String(formData.get("type") ?? "link");

  if (type === "link") {
    const url = String(formData.get("url") ?? "").trim();
    if (!url || !/^https?:\/\//i.test(url)) return;
    const src = await prisma.source.upsert({
      where: { url },
      update: { status: "pending", error: null, type: "link" },
      create: { url, type: "link", status: "pending" },
    });
    try {
      const r = await extractLink(url);
      await prisma.source.update({
        where: { id: src.id },
        data: { ...toData(r), status: "scanned", error: null },
      });
      await indexScanned(src.id);
    } catch (e) {
      await prisma.source.update({
        where: { id: src.id },
        data: { status: "failed", error: err(e) },
      });
    }
  } else if (type === "pdf" || type === "doc") {
    const file = formData.get("file");
    if (!isUpload(file) || file.size === 0) return;
    const bytes = Buffer.from(await file.arrayBuffer());
    const isWord = /\.docx$/i.test(file.name);
    const src = await prisma.source.create({
      data: { type: isWord ? "doc" : "pdf", filename: file.name, status: "pending" },
    });
    try {
      const r = await extractDocument(bytes, file.name);
      await prisma.source.update({
        where: { id: src.id },
        data: { ...toData(r), status: "scanned", error: null },
      });
      await indexScanned(src.id);
    } catch (e) {
      await prisma.source.update({
        where: { id: src.id },
        data: { status: "failed", error: err(e) },
      });
    }
  } else if (type === "text") {
    const text = String(formData.get("text") ?? "").trim();
    const title = String(formData.get("title") ?? "").trim() || null;
    if (text.length < 2) return;
    const src = await prisma.source.create({
      data: { type: "text", title, status: "pending" },
    });
    try {
      const r = await extractText(text, title);
      await prisma.source.update({
        where: { id: src.id },
        data: { ...toData(r), status: "scanned", error: null },
      });
      await indexScanned(src.id);
    } catch (e) {
      await prisma.source.update({
        where: { id: src.id },
        data: { status: "failed", error: err(e) },
      });
    }
  }
  revalidateAll();
}

export async function rescanSource(formData: FormData) {
  await requireAuth();
  const id = String(formData.get("id") ?? "");
  const src = await prisma.source.findUnique({ where: { id } });
  if (!src || src.type !== "link" || !src.url) return;
  try {
    const r = await extractLink(src.url);
    await prisma.source.update({
      where: { id: src.id },
      data: { ...toData(r), status: "scanned", error: null },
    });
    await indexScanned(src.id);
  } catch (e) {
    await prisma.source.update({ where: { id: src.id }, data: { status: "failed", error: err(e) } });
  }
  revalidateAll();
}

export async function updateSourceSummary(formData: FormData) {
  await requireAuth();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.source.update({
    where: { id },
    data: { summary: String(formData.get("summary") ?? ""), status: "scanned" },
  });
  // Re-index: for summary-only sources the summary IS the chunked content.
  await indexScanned(id);
  revalidateAll();
}

export async function deleteSource(formData: FormData) {
  await requireAuth();
  const id = String(formData.get("id") ?? "");
  if (id) await prisma.source.delete({ where: { id } }).catch(() => {});
  // Chunks cascade off the Source row, but the entities and relations extracted
  // from it don't — dropOrigin retracts those too.
  if (id) await reindex(`source ${id}`, () => dropOrigin("source", id));
  revalidateAll();
}

// ── Projects (github + live links) ──
export async function addProject(formData: FormData) {
  await requireAuth();
  const name = String(formData.get("name") ?? "").trim();
  let blurb = String(formData.get("blurb") ?? "").trim();
  const githubUrl = String(formData.get("githubUrl") ?? "").trim() || null;
  const liveUrl = String(formData.get("liveUrl") ?? "").trim() || null;
  if (!name) return;

  // Auto-generate the short description from the GitHub/Live URL when the
  // admin left it blank. Scrape the page + summarize into one line.
  if (!blurb) {
    const src = liveUrl || githubUrl;
    if (src) {
      try {
        const r = await extractLink(src);
        blurb =
          (r.summary || "").split(/(?<=\.)\s/)[0]?.slice(0, 200).trim() ||
          `${name} — see the link.`;
      } catch {
        blurb = `${name} — see the link.`;
      }
    } else {
      blurb = name;
    }
  }

  let imageUrl: string | null = null;
  const file = formData.get("image");
  if (isUpload(file) && file.size > 0) {
    imageUrl = `/api/uploads/${await saveUpload(file)}`;
  }

  const created = await prisma.project.create({
    data: {
      name,
      blurb,
      githubUrl,
      liveUrl,
      imageUrl,
      order: Number(formData.get("order") ?? 0) || 0,
    },
  });
  await reindex(`project ${created.id}`, () => indexProject(created.id));
  revalidateAll();
}

/**
 * Save hand-edits to a project card. Tags arrive as a comma-separated string.
 * Editing bumps updatedAt, so a GitHub re-import only overwrites this card if
 * the repo is pushed to again after the edit.
 */
export async function updateProject(formData: FormData) {
  await requireAuth();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) return;

  const tags = String(formData.get("tags") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 8);

  await prisma.project.update({
    where: { id },
    data: {
      name,
      blurb: String(formData.get("blurb") ?? "").trim(),
      detail: String(formData.get("detail") ?? "").trim() || null,
      tags: JSON.stringify(tags),
      githubUrl: String(formData.get("githubUrl") ?? "").trim() || null,
      liveUrl: String(formData.get("liveUrl") ?? "").trim() || null,
      order: Number(formData.get("order") ?? 0) || 0,
    },
  });
  await reindex(`project ${id}`, () => indexProject(id));
  revalidateAll();
}

export async function deleteProject(formData: FormData) {
  await requireAuth();
  const id = String(formData.get("id") ?? "");
  if (id) {
    await prisma.project.delete({ where: { id } }).catch(() => {});
    await reindex(`project ${id}`, () => dropOrigin("project", id));
  }
  revalidateAll();
}

// ── Photos (vision auto-caption) ──
export async function uploadPhoto(formData: FormData) {
  await requireAuth();
  const file = formData.get("file");
  if (!isUpload(file) || file.size === 0) return;

  const bytes = Buffer.from(await file.arrayBuffer());
  const filename = await saveBytes(bytes, file.type);

  // Ask Claude vision for a one-paragraph description (best-effort).
  const ext = path.extname(filename);
  const description = await describeImage(bytes, ext);

  const photo = await prisma.photo.create({
    data: {
      filename,
      description,
      caption: String(formData.get("caption") ?? ""),
      kind: String(formData.get("kind") ?? "gallery"),
      order: Number(formData.get("order") ?? 0) || 0,
    },
  });
  await reindex(`photo ${photo.id}`, () => indexPhoto(photo.id));
  revalidateAll();
}

export async function updatePhoto(formData: FormData) {
  await requireAuth();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.photo.update({
    where: { id },
    data: {
      description: String(formData.get("description") ?? ""),
      caption: String(formData.get("caption") ?? ""),
    },
  });
  await reindex(`photo ${id}`, () => indexPhoto(id));
  revalidateAll();
}

export async function deletePhoto(formData: FormData) {
  await requireAuth();
  const id = String(formData.get("id") ?? "");
  if (id) {
    await prisma.photo.delete({ where: { id } }).catch(() => {});
    await reindex(`photo ${id}`, () => dropOrigin("photo", id));
  }
  revalidateAll();
}

// ── Contacts (submissions from the in-chat contact form) ──
export async function toggleContactHandled(formData: FormData) {
  await requireAuth();
  const id = String(formData.get("id") ?? "");
  const handled = String(formData.get("handled") ?? "") === "true";
  if (id) await prisma.contact.update({ where: { id }, data: { handled: !handled } }).catch(() => {});
  revalidatePath("/admin/dashboard");
}

export async function deleteContact(formData: FormData) {
  await requireAuth();
  const id = String(formData.get("id") ?? "");
  if (id) await prisma.contact.delete({ where: { id } }).catch(() => {});
  revalidatePath("/admin/dashboard");
}

/**
 * Booking availability. Hours arrive as one "09:00-12:00, 13:00-17:00" string
 * per weekday — parsed here and stored as the structured JSON the slot grid
 * reads, so a typo becomes "no availability that day" rather than a runtime
 * error on the public card.
 */
export async function saveBookingSettings(formData: FormData) {
  await requireAuth();
  await getProfile();

  const hours: WeeklyHours = {};
  for (let weekday = 0; weekday < 7; weekday++) {
    const windows = parseDayWindows(String(formData.get(`hours_${weekday}`) ?? ""));
    if (windows.length) hours[weekday] = windows;
  }

  await prisma.profile.update({
    where: { id: 1 },
    data: {
      bookingEnabled: formData.get("bookingEnabled") === "on",
      bookingTz: String(formData.get("bookingTz") ?? "UTC").trim() || "UTC",
      bookingTitle: String(formData.get("bookingTitle") ?? "").trim() || "Intro call",
      bookingMinutes: clampInt(formData.get("bookingMinutes"), 15, 5, 480),
      bookingLeadHours: clampInt(formData.get("bookingLeadHours"), 12, 0, 720),
      bookingDays: clampInt(formData.get("bookingDays"), 14, 1, 120),
      bookingBufferMinutes: clampInt(formData.get("bookingBufferMinutes"), 0, 0, 240),
      bookingHours: JSON.stringify(formatWeeklyHours(hours)),
    },
  });
  revalidateAll();
}

/**
 * Hand the calendar grant back. Connecting is a redirect flow and so lives in
 * app/api/admin/google/*; disconnecting needs no round trip, so it is a plain
 * server action next to the rest of the Booking tab's saves.
 */
export async function disconnectGoogle() {
  await requireAuth();
  await disconnectGoogleCalendar();
  revalidateAll();
}

/** "09:00-12:00, 13:00-17:00" → [[540,720],[780,1020]]. Junk is dropped. */
function parseDayWindows(raw: string): [number, number][] {
  const out: [number, number][] = [];
  for (const part of raw.split(",")) {
    const m = /^\s*(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})\s*$/.exec(part);
    if (!m) continue;
    const from = clockMinutes(m[1]);
    const to = clockMinutes(m[2]);
    if (from === null || to === null || to <= from) continue;
    out.push([from, to]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

function clockMinutes(hhmm: string): number | null {
  const [h, m] = hhmm.split(":").map(Number);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

function clampInt(raw: FormDataEntryValue | null, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * Remove a booking record. This does NOT cancel the Google event — the calendar
 * is the source of truth and cancelling belongs there, where the guest gets
 * told. Deleting here only drops Blake's copy, which also frees the slot to be
 * booked again, so it is the right move only after cancelling in Google.
 */
export async function deleteBooking(formData: FormData) {
  await requireAuth();
  const id = String(formData.get("id") ?? "");
  if (id) await prisma.booking.delete({ where: { id } }).catch(() => {});
  revalidatePath("/admin/dashboard");
}

/** Delete one recorded conversation (messages cascade). */
export async function deleteChatSession(formData: FormData) {
  await requireAuth();
  const id = String(formData.get("id") ?? "");
  if (!id) return revalidatePath("/admin/dashboard");

  // Any approved answers in this conversation were indexed as knowledge;
  // chunks don't cascade off ChatMessage, so drop them before the rows go.
  const approved = await prisma.chatMessage.findMany({
    where: { sessionId: id, role: "assistant", rating: "up" },
    select: { id: true },
  });
  await prisma.chatSession.delete({ where: { id } }).catch(() => {});
  for (const m of approved) {
    await reindex(`activity ${m.id}`, () => dropOrigin("activity", m.id));
  }
  revalidatePath("/admin/dashboard");
}

/**
 * Save Blake's feedback on one bot answer from the Activity tab: a rating
 * (up/down) and an optional correction note. A "down" + note is injected into
 * future system prompts so the bot doesn't repeat the mistake.
 *
 * A 👍 also promotes the answer into the knowledge index. This rating is the
 * ONLY path by which chat content becomes knowledge — visitors type into the
 * public chat box, so nothing they produce is indexed until Blake vouches for
 * it here. Clearing or flipping the rating drops it again.
 */
export async function saveChatFeedback(formData: FormData) {
  await requireAuth();
  const id = String(formData.get("id") ?? "");
  const ratingRaw = String(formData.get("rating") ?? "");
  const rating = ratingRaw === "up" || ratingRaw === "down" ? ratingRaw : null;
  const noteRaw = String(formData.get("note") ?? "").trim();
  const note = noteRaw ? noteRaw.slice(0, 2000) : null;
  if (id) {
    await prisma.chatMessage
      .update({ where: { id }, data: { rating, note } })
      .catch(() => {});
    await reindex(`activity ${id}`, () => indexApprovedAnswer(id));
  }
  revalidatePath("/admin/dashboard");
}

// ── Knowledge graph (Graph tab) ──
// Thin auth + revalidate wrappers; the repair logic lives in lib/retrieval/graph.

/** Rename/retype an entity. A name that collides merges the two entities. */
export async function saveEntity(formData: FormData) {
  await requireAuth();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "");
  const type = String(formData.get("type") ?? "other");
  if (id && name.trim()) await renameEntity(id, name, type);
  revalidatePath("/admin/dashboard");
}

export async function removeEntity(formData: FormData) {
  await requireAuth();
  const id = String(formData.get("id") ?? "");
  if (id) await deleteEntity(id);
  revalidatePath("/admin/dashboard");
}

export async function createEntityEdge(formData: FormData) {
  await requireAuth();
  await addEdge(
    String(formData.get("fromId") ?? ""),
    String(formData.get("toId") ?? ""),
    String(formData.get("relation") ?? ""),
  );
  revalidatePath("/admin/dashboard");
}

export async function removeEntityEdge(formData: FormData) {
  await requireAuth();
  const id = String(formData.get("id") ?? "");
  if (id) await deleteEdge(id);
  revalidatePath("/admin/dashboard");
}

// ── helpers ──
function toData(r: {
  title: string | null;
  rawText: string;
  imageUrl: string | null;
  summary: string;
  tags: string[];
  kind: string;
}) {
  return {
    title: r.title,
    rawText: r.rawText,
    imageUrl: r.imageUrl,
    summary: r.summary,
    tags: JSON.stringify(r.tags),
    kind: r.kind,
  };
}

// ── Canned answers ──────────────────────────────────────────────────────────
// Thin auth wrappers; the logic lives in lib/canned.ts so it stays testable.

export async function saveCanned(formData: FormData) {
  await requireAuth();
  await saveCannedAnswer({
    id: String(formData.get("id") ?? "").trim() || undefined,
    question: String(formData.get("question") ?? ""),
    answer: String(formData.get("answer") ?? ""),
    cardTool: String(formData.get("cardTool") ?? "") || null,
    cardInput: String(formData.get("cardInput") ?? "") || null,
    enabled: formData.get("enabled") === "on",
    order: Number(formData.get("order") ?? 0) || 0,
  });
  revalidatePath("/admin/dashboard");
}

export async function deleteCanned(formData: FormData) {
  await requireAuth();
  const id = String(formData.get("id") ?? "").trim();
  if (id) await deleteCannedAnswer(id);
  revalidatePath("/admin/dashboard");
}

/**
 * Throw away a row's text and write a fresh draft. Best-effort like the
 * indexing wrappers above: a provider failure leaves the existing text in place
 * and logs, rather than throwing an error page over the whole dashboard.
 */
export async function redraftCanned(formData: FormData) {
  await requireAuth();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  try {
    await redraftAnswer(id);
  } catch (e) {
    console.error(`redraftCanned(${id}) failed:`, e);
  }
  revalidatePath("/admin/dashboard");
}

function err(e: unknown): string {
  return e instanceof Error ? e.message : "operation failed";
}
