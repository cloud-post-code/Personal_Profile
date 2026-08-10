import { prisma } from "@/lib/db";
import { getIngestionSource } from "@/lib/ingestionSources";
import { ingestMark } from "@/lib/ingestedItems";
import { extractText, extractLink, extractDocument } from "@/lib/scrape";
import { describeImage } from "@/lib/vision";
import { saveBytes } from "@/lib/uploads";
import { indexSource } from "@/lib/retrieval/indexer";
import { indexPhoto } from "@/lib/retrieval/origins";
import path from "node:path";

/**
 * Writes for custom ingestion sources. Everything a custom source ingests is
 * stored uniformly: text becomes a Source row, images become an upload file +
 * Photo row, and both are marked `kind = "ingest:<sourceKey>"` so the source
 * owns exactly its rows and the built-in tabs never show them.
 *
 * The source's storageKinds is enforced HERE, at the write — a text-only
 * source cannot be handed an image through any path.
 *
 * The extractor/describer are injectable so proofs run with zero model
 * calls; indexing is best-effort like every other admin save.
 */

type TextExtract = (
  text: string,
  title: string | null,
) => Promise<{ title?: string | null; rawText?: string | null; summary?: string | null; tags?: string[] }>;

type ImageDescribe = (bytes: Buffer, ext: string) => Promise<string>;

async function allows(sourceKey: string, kind: "text" | "image"): Promise<string | null> {
  const source = await getIngestionSource(sourceKey);
  if (!source) return `No ingestion source "${sourceKey}".`;
  if (!source.storageKinds.includes(kind)) {
    return `"${source.label}" stores ${source.storageKinds}, not ${kind}.`;
  }
  return null;
}

/** Ingest pasted text into a custom source. Returns an error string or null. */
export async function ingestCustomText(
  sourceKey: string,
  input: { title: string; text: string },
  extract: TextExtract = extractText,
): Promise<string | null> {
  const refusal = await allows(sourceKey, "text");
  if (refusal) return refusal;
  const text = input.text.trim();
  if (text.length < 2) return "Nothing to ingest.";
  const title = input.title.trim() || null;

  const src = await prisma.source.create({
    data: { type: "text", kind: ingestMark(sourceKey), title, status: "pending" },
  });
  try {
    const r = await extract(text, title);
    await prisma.source.update({
      where: { id: src.id },
      data: {
        title: r.title ?? title,
        rawText: r.rawText ?? text,
        summary: r.summary ?? null,
        tags: JSON.stringify(r.tags ?? []),
        // The mark is ownership, not metadata — never let extraction move it.
        kind: ingestMark(sourceKey),
        status: "scanned",
        error: null,
      },
    });
  } catch (e) {
    await prisma.source.update({
      where: { id: src.id },
      data: { status: "failed", error: e instanceof Error ? e.message : String(e) },
    });
    return null;
  }
  try {
    await indexSource(src.id);
  } catch (e) {
    console.error(`index custom source ${src.id} failed:`, e);
  }
  return null;
}

type LinkExtract = (
  url: string,
) => Promise<{ title?: string | null; rawText?: string | null; summary?: string | null; tags?: string[] }>;

type DocExtract = (
  bytes: Buffer,
  filename: string,
) => Promise<{ title?: string | null; rawText?: string | null; summary?: string | null; tags?: string[] }>;

/**
 * Scan a web page into a custom source. Upserts by URL (Source.url is
 * unique) so re-scanning refreshes the row instead of duplicating it —
 * while the ownership mark keeps the row out of the built-in Links tab.
 */
export async function ingestCustomUrl(
  sourceKey: string,
  url: string,
  extract: LinkExtract = extractLink,
): Promise<string | null> {
  const refusal = await allows(sourceKey, "text");
  if (refusal) return refusal;
  const clean = url.trim();
  if (!/^https?:\/\//i.test(clean)) return "That doesn't look like a URL.";

  const mark = ingestMark(sourceKey);
  const src = await prisma.source.upsert({
    where: { url: clean },
    update: { status: "pending", error: null, type: "link", kind: mark },
    create: { url: clean, type: "link", kind: mark, status: "pending" },
  });
  try {
    const r = await extract(clean);
    await prisma.source.update({
      where: { id: src.id },
      data: {
        title: r.title ?? null,
        rawText: r.rawText ?? null,
        summary: r.summary ?? null,
        tags: JSON.stringify(r.tags ?? []),
        kind: mark,
        status: "scanned",
        error: null,
      },
    });
  } catch (e) {
    await prisma.source.update({
      where: { id: src.id },
      data: { status: "failed", error: e instanceof Error ? e.message : String(e) },
    });
    return null;
  }
  try {
    await indexSource(src.id);
  } catch (e) {
    console.error(`index custom source ${src.id} failed:`, e);
  }
  return null;
}

/** Ingest an uploaded document (PDF / Word / text file) into a custom source. */
export async function ingestCustomFile(
  sourceKey: string,
  bytes: Buffer,
  filename: string,
  extract: DocExtract = extractDocument,
): Promise<string | null> {
  const refusal = await allows(sourceKey, "text");
  if (refusal) return refusal;
  if (bytes.length === 0) return "Empty file.";

  const src = await prisma.source.create({
    data: {
      type: /\.docx$/i.test(filename) ? "doc" : "pdf",
      filename,
      kind: ingestMark(sourceKey),
      status: "pending",
    },
  });
  try {
    const r = await extract(bytes, filename);
    await prisma.source.update({
      where: { id: src.id },
      data: {
        title: r.title ?? filename,
        rawText: r.rawText ?? null,
        summary: r.summary ?? null,
        tags: JSON.stringify(r.tags ?? []),
        kind: ingestMark(sourceKey),
        status: "scanned",
        error: null,
      },
    });
  } catch (e) {
    await prisma.source.update({
      where: { id: src.id },
      data: { status: "failed", error: e instanceof Error ? e.message : String(e) },
    });
    return null;
  }
  try {
    await indexSource(src.id);
  } catch (e) {
    console.error(`index custom source ${src.id} failed:`, e);
  }
  return null;
}

/** Ingest an image into a custom source. Returns an error string or null. */
export async function ingestCustomImage(
  sourceKey: string,
  bytes: Buffer,
  contentType: string,
  caption: string,
  describe: ImageDescribe = describeImage,
): Promise<string | null> {
  const refusal = await allows(sourceKey, "image");
  if (refusal) return refusal;
  if (bytes.length === 0) return "Empty image.";

  const filename = await saveBytes(bytes, contentType);
  let description = "";
  try {
    description = await describe(bytes, path.extname(filename));
  } catch {
    // Best-effort, like the Photos tab: an unvisioned image still ingests.
  }
  const photo = await prisma.photo.create({
    data: { filename, description, caption: caption.trim(), kind: ingestMark(sourceKey) },
  });
  try {
    await indexPhoto(photo.id);
  } catch (e) {
    console.error(`index custom photo ${photo.id} failed:`, e);
  }
  return null;
}
