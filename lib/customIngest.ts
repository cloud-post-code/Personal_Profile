import { prisma } from "@/lib/db";
import { getIngestionSource } from "@/lib/ingestionSources";
import { ingestMark } from "@/lib/ingestedItems";
import { extractText, extractLink, extractDocument } from "@/lib/scrape";
import { describeImage } from "@/lib/vision";
import { saveBytes } from "@/lib/uploads";
import { indexSource, dropOrigin } from "@/lib/retrieval/indexer";
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

// ── The split pass ─────────────────────────────────────────────────────
// Splitting is a BEHAVIOR OF THE PIPELINE, not something a source's prompt
// has to ask for: every text ingest (document, URL, paste) is offered to the
// splitter, and the source's systemPrompt is only the LENS — it defines what
// counts as one item and which details each should carry. Caps and the
// single-row fallback are universal.

/** Most items one document may split into — a spend and noise cap. */
export const MAX_SPLIT_ITEMS = 20;

/** How much of a document the splitter reads. */
const SPLIT_INPUT_CHARS = 24_000;

export type SplitItem = { title: string; text: string };

/** Minimal client surface, injectable so proofs run zero model calls. */
export type SplitClient = {
  messages: {
    create(req: {
      model: string;
      max_tokens: number;
      system: string;
      messages: Array<{ role: "user"; content: string }>;
    }): Promise<{ content: unknown[] }>;
  };
};

const DEFAULT_LENS =
  "Each item is one distinct, self-contained point from the document — a " +
  "fact, project, claim, or event that stands on its own.";

/**
 * One model call: raw text in, discrete items out. Returns null on ANY
 * failure or on a 0–1 item result — the caller falls back to the plain
 * single-row ingest, so an outage can never lose an upload.
 */
export async function splitIntoItems(
  rawText: string,
  lens: string,
  client?: SplitClient,
): Promise<SplitItem[] | null> {
  try {
    const { claude, claudeModel } = await import("@/lib/claude");
    const c = client ?? (claude() as unknown as SplitClient);
    const res = await c.messages.create({
      model: claudeModel(),
      max_tokens: 4000,
      system:
        "You split an ingested document into discrete knowledge items for a " +
        "retrieval system. Reply with ONLY a JSON array of objects " +
        `{"title": "...", "text": "..."} — at most ${MAX_SPLIT_ITEMS} items. ` +
        "Every item must be understandable alone (repeat names/context rather " +
        "than writing \"it\" or \"this project\"). What counts as one item:\n" +
        (lens.trim() || DEFAULT_LENS),
      messages: [{ role: "user", content: rawText.slice(0, SPLIT_INPUT_CHARS) }],
    });
    const raw = res.content
      .map((b) => {
        const block = b as { type?: string; text?: string };
        return block?.type === "text" && typeof block.text === "string" ? block.text : "";
      })
      .join("");
    const jsonText = raw.match(/\[[\s\S]*\]/)?.[0];
    if (!jsonText) return null;
    const parsed = JSON.parse(jsonText);
    if (!Array.isArray(parsed)) return null;
    const items = parsed
      .map((v) => {
        const d = v as { title?: unknown; text?: unknown };
        const title = typeof d?.title === "string" ? d.title.trim() : "";
        const text = typeof d?.text === "string" ? d.text.trim() : "";
        return title && text ? { title, text } : null;
      })
      .filter((v): v is SplitItem => v !== null)
      .slice(0, MAX_SPLIT_ITEMS);
    // One point isn't a split — the plain row already says it.
    return items.length >= 2 ? items : null;
  } catch {
    return null;
  }
}

/** The provenance tag linking an item row back to its parent document. */
const docTag = (label: string) => `doc:${label}`;

/**
 * Store one row per split item, marked and tagged, each indexed
 * best-effort. Returns the created row count.
 */
async function writeSplitItems(
  sourceKey: string,
  parentLabel: string,
  items: SplitItem[],
): Promise<number> {
  const mark = ingestMark(sourceKey);
  for (const item of items) {
    const row = await prisma.source.create({
      data: {
        type: "text",
        kind: mark,
        title: item.title,
        rawText: item.text,
        summary: item.text,
        tags: JSON.stringify([docTag(parentLabel)]),
        status: "scanned",
      },
    });
    try {
      await indexSource(row.id);
    } catch (e) {
      console.error(`index split item ${row.id} failed:`, e);
    }
  }
  return items.length;
}

/**
 * Try the split for an extracted ingest. On success the parent blob row is
 * replaced by the item rows; on failure the caller keeps the plain row.
 */
async function splitAndReplace(
  sourceKey: string,
  parentId: string,
  parentLabel: string,
  rawText: string | null | undefined,
  client?: SplitClient,
): Promise<boolean> {
  if (!rawText?.trim()) return false;
  const source = await getIngestionSource(sourceKey);
  const items = await splitIntoItems(rawText, source?.systemPrompt ?? "", client);
  if (!items) return false;
  await writeSplitItems(sourceKey, parentLabel, items);
  // Safe without dropOrigin: on the text/file paths the parent row is
  // deleted before it is ever indexed, so it owns no chunks or edges.
  await prisma.source.delete({ where: { id: parentId } }).catch(() => {});
  return true;
}

/** Ingest pasted text into a custom source. Returns an error string or null. */
export async function ingestCustomText(
  sourceKey: string,
  input: { title: string; text: string },
  extract: TextExtract = extractText,
  splitClient?: SplitClient,
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
  if (await splitAndReplace(sourceKey, src.id, title ?? "note", text, splitClient)) {
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
  splitClient?: SplitClient,
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
  // A re-scan REPLACES the url's items: drop the previous set only once the
  // fresh split has actually produced items, then retire the blob row.
  {
    const fresh = await prisma.source.findUnique({ where: { id: src.id } });
    const source = await getIngestionSource(sourceKey);
    const items = fresh?.rawText?.trim()
      ? await splitIntoItems(fresh.rawText, source?.systemPrompt ?? "", splitClient)
      : null;
    if (items) {
      // Exact tag only: the JSON-quoted form ("doc:<url>", closing quote
      // included) cannot prefix-match a sibling page's tag the way a raw
      // substring would (doc:https://x.com/page vs …/page/2).
      const exactTag = JSON.stringify(docTag(clean));
      const stale = await prisma.source.findMany({
        where: { kind: mark, tags: { contains: exactTag }, NOT: { id: src.id } },
        select: { id: true },
      });
      // Deleting a Source cascades its chunks but NOT its graph-edge
      // ownership — retract each origin first (same rule as deleteSource),
      // or relations from the old scan persist as fact forever.
      for (const row of [...stale, { id: src.id }]) {
        try {
          await dropOrigin("source", row.id);
        } catch (e) {
          console.error(`dropOrigin(source ${row.id}) failed:`, e);
        }
      }
      await prisma.source.deleteMany({ where: { id: { in: stale.map((r) => r.id) } } });
      await writeSplitItems(sourceKey, clean, items);
      await prisma.source.delete({ where: { id: src.id } }).catch(() => {});
      return null;
    }
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
  splitClient?: SplitClient,
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
  {
    const fresh = await prisma.source.findUnique({ where: { id: src.id } });
    if (await splitAndReplace(sourceKey, src.id, filename, fresh?.rawText, splitClient)) {
      return null;
    }
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
