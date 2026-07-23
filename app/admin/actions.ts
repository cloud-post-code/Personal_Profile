"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma, getProfile } from "@/lib/db";
import { checkPassword, createSession, destroySession, isAuthed } from "@/lib/auth";
import { scanLink } from "@/lib/scrape";
import { saveUpload } from "@/lib/uploads";

async function requireAuth() {
  if (!(await isAuthed())) redirect("/admin");
}

// ── Auth ──
export async function login(formData: FormData) {
  const pw = String(formData.get("password") ?? "");
  if (!checkPassword(pw)) {
    redirect("/admin?error=1");
  }
  await createSession();
  redirect("/admin/dashboard");
}

export async function logout() {
  await destroySession();
  redirect("/admin");
}

// ── Profile / persona ──
export async function saveProfile(formData: FormData) {
  await requireAuth();
  await getProfile(); // ensure row exists
  await prisma.profile.update({
    where: { id: 1 },
    data: {
      name: String(formData.get("name") ?? "Blake"),
      tagline: String(formData.get("tagline") ?? ""),
      bio: String(formData.get("bio") ?? ""),
      persona: String(formData.get("persona") ?? ""),
      email: String(formData.get("email") ?? ""),
      linkedin: String(formData.get("linkedin") ?? ""),
      github: String(formData.get("github") ?? ""),
    },
  });
  revalidatePath("/admin/dashboard");
  revalidatePath("/");
}

// ── Projects ──
export async function addProject(formData: FormData) {
  await requireAuth();
  const name = String(formData.get("name") ?? "").trim();
  const blurb = String(formData.get("blurb") ?? "").trim();
  if (!name || !blurb) return;
  await prisma.project.create({
    data: {
      name,
      blurb,
      url: String(formData.get("url") ?? "").trim() || null,
      order: Number(formData.get("order") ?? 0) || 0,
    },
  });
  revalidatePath("/admin/dashboard");
  revalidatePath("/projects");
}

export async function deleteProject(formData: FormData) {
  await requireAuth();
  const id = String(formData.get("id") ?? "");
  if (id) await prisma.project.delete({ where: { id } }).catch(() => {});
  revalidatePath("/admin/dashboard");
  revalidatePath("/projects");
}

// ── Links (scanned) ──
export async function addLink(formData: FormData) {
  await requireAuth();
  const url = String(formData.get("url") ?? "").trim();
  if (!url || !/^https?:\/\//i.test(url)) return;

  // Create as pending, then scan. We scan inline so the admin sees the result;
  // for slow pages this takes a few seconds.
  const link = await prisma.link.upsert({
    where: { url },
    update: { status: "pending", error: null },
    create: { url, status: "pending" },
  });

  try {
    const r = await scanLink(url);
    await prisma.link.update({
      where: { id: link.id },
      data: {
        title: r.title,
        rawText: r.rawText,
        summary: r.summary,
        tags: JSON.stringify(r.tags),
        kind: r.kind,
        imageUrl: r.imageUrl,
        status: "scanned",
        error: null,
      },
    });
  } catch (e) {
    await prisma.link.update({
      where: { id: link.id },
      data: { status: "failed", error: e instanceof Error ? e.message : "scan failed" },
    });
  }

  revalidatePath("/admin/dashboard");
  revalidatePath("/projects");
  revalidatePath("/");
}

export async function rescanLink(formData: FormData) {
  await requireAuth();
  const id = String(formData.get("id") ?? "");
  const link = await prisma.link.findUnique({ where: { id } });
  if (!link) return;
  await addLink(new FormDataFrom({ url: link.url }));
}

export async function updateLinkSummary(formData: FormData) {
  await requireAuth();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.link.update({
    where: { id },
    data: {
      summary: String(formData.get("summary") ?? ""),
      status: "scanned",
    },
  });
  revalidatePath("/admin/dashboard");
  revalidatePath("/");
}

export async function deleteLink(formData: FormData) {
  await requireAuth();
  const id = String(formData.get("id") ?? "");
  if (id) await prisma.link.delete({ where: { id } }).catch(() => {});
  revalidatePath("/admin/dashboard");
  revalidatePath("/projects");
  revalidatePath("/");
}

// ── Photos ──
export async function uploadPhoto(formData: FormData) {
  await requireAuth();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return;
  const filename = await saveUpload(file);
  await prisma.photo.create({
    data: {
      filename,
      caption: String(formData.get("caption") ?? ""),
      kind: String(formData.get("kind") ?? "gallery"),
    },
  });
  revalidatePath("/admin/dashboard");
  revalidatePath("/projects");
}

export async function deletePhoto(formData: FormData) {
  await requireAuth();
  const id = String(formData.get("id") ?? "");
  if (id) await prisma.photo.delete({ where: { id } }).catch(() => {});
  revalidatePath("/admin/dashboard");
  revalidatePath("/projects");
}

/** Tiny helper to build a FormData from an object (for rescan reuse). */
class FormDataFrom extends FormData {
  constructor(obj: Record<string, string>) {
    super();
    for (const [k, v] of Object.entries(obj)) this.set(k, v);
  }
}
