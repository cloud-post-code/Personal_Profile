import { prisma } from "../db";
import { chunkText } from "./chunking";
import { embedTexts, vecToBytes } from "./embed";
import {
  extractEntities,
  entityKey,
  type EntityExtractor,
  type ExtractedGraph,
} from "./entities";

/**
 * Index one Source for retrieval: chunk its raw text (falling back to the
 * summary), embed each chunk, extract entities + relations, and persist
 * chunks / entities / mentions / edges. Idempotent — chunks are replaced
 * wholesale, entities and edges are upserted.
 *
 * Callers treat this as best-effort: a thrown error must not un-scan the
 * source, so ingestion wraps it in a catch.
 */
export async function indexSource(
  sourceId: string,
  opts: { extract?: EntityExtractor } = {},
): Promise<void> {
  const src = await prisma.source.findUnique({ where: { id: sourceId } });
  if (!src) return;

  const text = (src.rawText ?? "").trim() || (src.summary ?? "").trim();
  if (!text) {
    await prisma.chunk.deleteMany({ where: { sourceId } });
    return;
  }

  const pieces = chunkText(text);
  const { vectors, model } = await embedTexts(pieces);

  // Replace this source's chunks (mentions cascade away with them).
  await prisma.chunk.deleteMany({ where: { sourceId } });
  const chunkIds: { id: string; text: string }[] = [];
  for (let i = 0; i < pieces.length; i++) {
    const v = vectors[i];
    const c = await prisma.chunk.create({
      data: {
        sourceId,
        seq: i,
        text: pieces[i],
        embedding: v ? vecToBytes(v) : null,
        embedModel: v ? model : null,
      },
      select: { id: true, text: true },
    });
    chunkIds.push(c);
  }

  // Entity extraction is the only model call here; keep it best-effort so a
  // flaky extraction never loses the chunks we just wrote.
  let graph: ExtractedGraph;
  try {
    graph = await (opts.extract ?? extractEntities)(text, src.title);
  } catch {
    return;
  }
  await persistGraph(graph, chunkIds);
}

async function persistGraph(
  graph: ExtractedGraph,
  chunks: { id: string; text: string }[],
): Promise<void> {
  // Upsert every named entity — including edge endpoints the extractor didn't
  // list (they may be described in another source; the edge still connects).
  const wanted = new Map<string, { name: string; type: string }>();
  for (const e of graph.entities) wanted.set(entityKey(e.name), e);
  for (const e of graph.edges) {
    for (const name of [e.from, e.to]) {
      if (!wanted.has(entityKey(name))) wanted.set(entityKey(name), { name, type: "other" });
    }
  }

  const idByKey = new Map<string, string>();
  for (const [key, e] of wanted) {
    const row = await prisma.entity.upsert({
      where: { key },
      update: {},
      create: { key, name: e.name, type: e.type },
      select: { id: true },
    });
    idByKey.set(key, row.id);
  }

  // Mentions: an entity is "in" every chunk whose text contains its name
  // (case-insensitive). Extractor-listed entities that match nowhere attach
  // to the first chunk so they stay reachable from this source.
  const mentions: { chunkId: string; entityId: string }[] = [];
  for (const e of graph.entities) {
    const key = entityKey(e.name);
    const entityId = idByKey.get(key)!;
    const hits = chunks.filter((c) => c.text.toLowerCase().includes(key));
    for (const c of hits.length ? hits : chunks.slice(0, 1)) {
      mentions.push({ chunkId: c.id, entityId });
    }
  }
  if (mentions.length) {
    await prisma.entityMention.createMany({ data: mentions, skipDuplicates: true });
  }

  for (const e of graph.edges) {
    const fromId = idByKey.get(entityKey(e.from))!;
    const toId = idByKey.get(entityKey(e.to))!;
    await prisma.entityEdge.upsert({
      where: { fromId_toId_relation: { fromId, toId, relation: e.relation } },
      update: {},
      create: { fromId, toId, relation: e.relation },
    });
  }
}
