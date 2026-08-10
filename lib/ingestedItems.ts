import { prisma } from "@/lib/db";

/**
 * The one uniform read path over everything the ingestion sources have
 * ingested. The tabs store into four different tables (Source, Project,
 * Photo, Profile), but every piece of ingested information is exactly one of
 * two kinds — text or image — and this module is where that rule is real:
 * `listIngestedItems(sourceKey)` returns the same item shape for every
 * source, with `kind === "image"` exactly when `imageUrl` is set.
 *
 * Custom sources (created from the admin) mark their rows with
 * `kind = "ingest:<sourceKey>"` on Source (text) and Photo (image); the
 * built-in readers exclude those marks so custom content never leaks into
 * the Links/Text/Photos tabs.
 *
 * Data only — rendering belongs to the admin pages.
 */

export type IngestedItem = {
  kind: "text" | "image";
  /** "<model>:<rowid>" — unique across the backing tables. */
  id: string;
  sourceKey: string;
  title: string;
  /** The text content, or the image's stored description. */
  text: string;
  /** Non-null exactly when kind === "image". */
  imageUrl: string | null;
  createdAt: Date;
};

/** The mark custom sources put on Source.kind / Photo.kind rows they own. */
export const ingestMark = (sourceKey: string) => `ingest:${sourceKey}`;

const textItem = (
  sourceKey: string,
  id: string,
  title: string,
  text: string,
  createdAt: Date,
): IngestedItem => ({ kind: "text", id, sourceKey, title, text, imageUrl: null, createdAt });

const imageItem = (
  sourceKey: string,
  id: string,
  title: string,
  text: string,
  imageUrl: string,
  createdAt: Date,
): IngestedItem => ({ kind: "image", id, sourceKey, title, text, imageUrl, createdAt });

/** Parse Profile.experience JSON defensively — bad JSON is an empty history. */
export function parseExperienceItems(
  raw: string | null | undefined,
): Array<{ role: string; company: string; dates: string; description: string }> {
  try {
    const v = JSON.parse(raw || "[]");
    if (!Array.isArray(v)) return [];
    return v.filter((e) => e && typeof e === "object");
  } catch {
    return [];
  }
}

function parseSections(raw: string | null | undefined): Record<string, string> {
  try {
    const v = JSON.parse(raw || "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

function sourceRows(rows: Array<{ id: string; title: string | null; url: string | null; summary: string | null; rawText: string | null; createdAt: Date }>, sourceKey: string): IngestedItem[] {
  return rows.map((s) =>
    textItem(
      sourceKey,
      `source:${s.id}`,
      s.title || s.url || "Untitled",
      s.summary || s.rawText || "",
      s.createdAt,
    ),
  );
}

/** Everything a source has ingested, as uniform text/image items. */
export async function listIngestedItems(sourceKey: string): Promise<IngestedItem[]> {
  switch (sourceKey) {
    case "experience": {
      const profile = await prisma.profile.findUnique({ where: { id: 1 } });
      const when = profile?.updatedAt ?? new Date(0);
      return parseExperienceItems(profile?.experience).map((e, i) =>
        textItem(
          sourceKey,
          `experience:${i}`,
          [e.role, e.company].filter(Boolean).join(" — ") || "Role",
          [e.dates, e.description].filter(Boolean).join("\n"),
          when,
        ),
      );
    }
    case "projects": {
      const projects = await prisma.project.findMany({ orderBy: { order: "asc" } });
      return projects.flatMap((p) => {
        const items = [
          textItem(sourceKey, `project:${p.id}`, p.name, p.blurb || p.detail || "", p.createdAt),
        ];
        if (p.imageUrl) {
          items.push(
            imageItem(sourceKey, `project-image:${p.id}`, p.name, p.blurb || "", p.imageUrl, p.createdAt),
          );
        }
        return items;
      });
    }
    case "links": {
      const rows = await prisma.source.findMany({
        where: { type: "link", NOT: { kind: { startsWith: "ingest:" } } },
        orderBy: { createdAt: "desc" },
      });
      return sourceRows(rows, sourceKey);
    }
    case "pdfs": {
      const rows = await prisma.source.findMany({
        where: { type: { in: ["pdf", "doc"] }, NOT: { kind: { startsWith: "ingest:" } } },
        orderBy: { createdAt: "desc" },
      });
      return sourceRows(rows, sourceKey);
    }
    case "text": {
      const rows = await prisma.source.findMany({
        where: { type: "text", NOT: { kind: { startsWith: "ingest:" } } },
        orderBy: { createdAt: "desc" },
      });
      return sourceRows(rows, sourceKey);
    }
    case "photos": {
      const rows = await prisma.photo.findMany({
        where: { NOT: { kind: { startsWith: "ingest:" } } },
        orderBy: { order: "asc" },
      });
      return rows.map((p) =>
        imageItem(
          sourceKey,
          `photo:${p.id}`,
          p.caption || p.filename,
          p.description || p.caption || "",
          `/api/uploads/${p.filename}`,
          p.createdAt,
        ),
      );
    }
    case "persona": {
      const profile = await prisma.profile.findUnique({ where: { id: 1 } });
      const when = profile?.updatedAt ?? new Date(0);
      return Object.entries(parseSections(profile?.personaSections))
        .filter(([, text]) => typeof text === "string" && text.trim())
        .map(([key, text]) => textItem(sourceKey, `persona:${key}`, key, text, when));
    }
    default: {
      // Custom sources own exactly the rows they marked.
      const mark = ingestMark(sourceKey);
      const [texts, photos] = await Promise.all([
        prisma.source.findMany({ where: { kind: mark }, orderBy: { createdAt: "desc" } }),
        prisma.photo.findMany({ where: { kind: mark }, orderBy: { createdAt: "desc" } }),
      ]);
      return [
        ...sourceRows(texts, sourceKey),
        ...photos.map((p) =>
          imageItem(
            sourceKey,
            `photo:${p.id}`,
            p.caption || p.filename,
            p.description || p.caption || "",
            `/api/uploads/${p.filename}`,
            p.createdAt,
          ),
        ),
      ];
    }
  }
}
