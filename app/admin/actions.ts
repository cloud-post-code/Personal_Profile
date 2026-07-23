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
import { extractLink, extractDocument, extractText, writeBioFromText, writeExperienceFromText, fileToText } from "@/lib/scrape";
import { safeExperience } from "@/lib/knowledge";
import { saveUpload, saveBytes } from "@/lib/uploads";
import { describeImage } from "@/lib/vision";
import path from "node:path";

async function requireAuth() {
  if (!(await isAuthed())) redirect("/admin");
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

// ── Bio (manual text) ──
export async function saveBio(formData: FormData) {
  await requireAuth();
  await getProfile();
  await prisma.profile.update({
    where: { id: 1 },
    data: { bio: String(formData.get("bio") ?? "") },
  });
  revalidateAll();
}

// ── Details: identity + contact + socials (bio & experience save separately) ──
export async function saveProfileBasics(formData: FormData) {
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

// ── Experience (manual edits from the ExperienceEditor) ──
export async function saveExperience(formData: FormData) {
  await requireAuth();
  await getProfile();
  const experience = safeExperience(String(formData.get("experience") ?? "[]"));
  await prisma.profile.update({
    where: { id: 1 },
    data: { experience: JSON.stringify(experience) },
  });
  revalidateAll();
}

/** Bio via file upload: PDF, DOCX, CSV, or text/markdown -> Claude writes a bio. */
export async function uploadBioFile(formData: FormData) {
  await requireAuth();
  const file = formData.get("file");
  if (!isUpload(file) || file.size === 0) return;
  // Read the file's text, handling pdf / docx / csv / txt / md.
  const bytes = Buffer.from(await file.arrayBuffer());
  const { text } = await fileToText(bytes, file.name);
  const bio = await writeBioFromText(text);
  if (bio) {
    await getProfile();
    await prisma.profile.update({ where: { id: 1 }, data: { bio } });
  }
  revalidateAll();
}

/**
 * Experience via file upload: PDF, DOCX, CSV, or text -> Claude extracts
 * role/company/dates/description entries and APPENDS them to the existing list.
 */
export async function uploadExperienceFile(formData: FormData) {
  await requireAuth();
  const file = formData.get("file");
  if (!isUpload(file) || file.size === 0) return;
  const bytes = Buffer.from(await file.arrayBuffer());
  const { text } = await fileToText(bytes, file.name);
  const extracted = await writeExperienceFromText(text);
  if (extracted.length) {
    const profile = await getProfile();
    const existing = safeExperience(profile.experience);
    await prisma.profile.update({
      where: { id: 1 },
      data: { experience: JSON.stringify([...existing, ...extracted]) },
    });
  }
  revalidateAll();
}

// ── Persona & brand/theme ──
export async function savePersona(formData: FormData) {
  await requireAuth();
  await getProfile();

  // Full color set — every role the design panel exposes.
  const colors = {
    bg: String(formData.get("color_bg") ?? "").trim(),
    surface: String(formData.get("color_surface") ?? "").trim(),
    border: String(formData.get("color_border") ?? "").trim(),
    text: String(formData.get("color_text") ?? "").trim(),
    textMuted: String(formData.get("color_textMuted") ?? "").trim(),
    primary: String(formData.get("color_primary") ?? "").trim(),
    accent: String(formData.get("color_accent") ?? "").trim(),
  };

  await prisma.profile.update({
    where: { id: 1 },
    data: {
      tagline: String(formData.get("tagline") ?? ""),
      persona: String(formData.get("persona") ?? ""),
      overview: String(formData.get("overview") ?? ""),
      values: String(formData.get("values") ?? ""),
      aesthetic: String(formData.get("aesthetic") ?? ""),
      tone: String(formData.get("tone") ?? ""),
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
  revalidateAll();
}

export async function deleteSource(formData: FormData) {
  await requireAuth();
  const id = String(formData.get("id") ?? "");
  if (id) await prisma.source.delete({ where: { id } }).catch(() => {});
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

  await prisma.project.create({
    data: {
      name,
      blurb,
      githubUrl,
      liveUrl,
      imageUrl,
      order: Number(formData.get("order") ?? 0) || 0,
    },
  });
  revalidateAll();
}

export async function deleteProject(formData: FormData) {
  await requireAuth();
  const id = String(formData.get("id") ?? "");
  if (id) await prisma.project.delete({ where: { id } }).catch(() => {});
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

  await prisma.photo.create({
    data: {
      filename,
      description,
      caption: String(formData.get("caption") ?? ""),
      kind: String(formData.get("kind") ?? "gallery"),
      order: Number(formData.get("order") ?? 0) || 0,
    },
  });
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
  revalidateAll();
}

export async function deletePhoto(formData: FormData) {
  await requireAuth();
  const id = String(formData.get("id") ?? "");
  if (id) await prisma.photo.delete({ where: { id } }).catch(() => {});
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

function err(e: unknown): string {
  return e instanceof Error ? e.message : "operation failed";
}
