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
 * Indexing for one *origin* — any admin surface whose content the chatbot
 * should be able to retrieve: a Source, the Profile, the Persona, a Project, a
 * Photo, or an approved answer (see `origins.ts` for what each contributes).
 *
 * Chunk the text, embed each chunk, extract entities + relations, and persist
 * chunks / entities / mentions / edges. Idempotent — an origin's chunks are
 * replaced wholesale, entities and edges are upserted, so entities named in
 * two different origins converge on one row and the graph links across them.
 *
 * Callers treat this as best-effort: a thrown error must not fail the admin
 * save that triggered it, so call sites wrap it in a catch.
 */

export type IndexOpts = { extract?: EntityExtractor };

export type OriginInput = {
  /// source | profile | persona | project | photo | activity
  kind: string;
  id: string;
  /// Human-readable label used when citing this content in the prompt.
  label: string;
  text: string;
  /// Set for source-derived chunks so they cascade with the Source row.
  sourceId?: string;
};

/**
 * Retract everything an origin contributed: its chunks (mentions cascade with
 * them), its ownership of extracted relations, and any entity left with nothing
 * supporting it. Deleting content is the admin's retraction mechanism, so it has
 * to reach the graph too — a relation whose last owner is gone would otherwise
 * keep being fed to the model as fact long after its source was deleted.
 */
export async function dropOrigin(kind: string, id: string): Promise<void> {
  await prisma.chunk.deleteMany({ where: { originKind: kind, originId: id } });
  await retractEdgeOwnership(kind, id);
  await pruneUnsupportedEntities();
}

/**
 * Drop this origin's claim on every relation it asserted, then delete the ones
 * left with no owner at all.
 *
 * Scoped to edges this origin actually owned: an edge with no ownership rows is
 * either hand-added on the Graph tab or predates provenance, and neither may be
 * swept up here.
 */
async function retractEdgeOwnership(kind: string, id: string): Promise<void> {
  const owned = await prisma.entityEdgeOrigin.findMany({
    where: { originKind: kind, originId: id },
    select: { edgeId: true },
  });
  if (!owned.length) return;

  const edgeIds = [...new Set(owned.map((o) => o.edgeId))];
  await prisma.entityEdgeOrigin.deleteMany({ where: { originKind: kind, originId: id } });
  await prisma.entityEdge.deleteMany({
    where: { id: { in: edgeIds }, origins: { none: {} } },
  });
}

/**
 * Delete entities nothing supports any more — no chunk mentions them and no
 * relation needs them as an endpoint. An entity with no mentions but a live
 * edge is kept on purpose: the extractor creates edge endpoints it never
 * describes, and they still carry the relation.
 */
async function pruneUnsupportedEntities(): Promise<void> {
  await prisma.entity.deleteMany({
    where: { mentions: { none: {} }, edgesOut: { none: {} }, edgesIn: { none: {} } },
  });
}

/**
 * Clear an origin's chunks, including rows written before the origin columns
 * existed. Those legacy rows carry an empty `originId`, so matching on
 * kind+id alone would leave them behind as duplicates of the content we are
 * about to rewrite.
 *
 * Chunks only — graph claims are rewritten by `persistGraph` once extraction
 * has actually returned. Retracting them here instead would mean a flaky
 * extraction call silently deletes relations the origin still asserts.
 */
async function clearOriginChunks(origin: OriginInput): Promise<void> {
  await prisma.chunk.deleteMany({
    where: { originKind: origin.kind, originId: origin.id },
  });
  if (origin.sourceId) {
    await prisma.chunk.deleteMany({ where: { sourceId: origin.sourceId, originId: "" } });
  }
}

export async function indexOrigin(origin: OriginInput, opts: IndexOpts = {}): Promise<void> {
  const text = origin.text.trim();
  // An origin with no text asserts nothing — retract its claims as well as its
  // chunks, the same as if it had been deleted.
  if (!text) {
    await clearOriginChunks(origin);
    return dropOrigin(origin.kind, origin.id);
  }

  const pieces = chunkText(text);
  const { vectors, model } = await embedTexts(pieces);

  // Replace this origin's chunks (mentions cascade away with them).
  await clearOriginChunks(origin);
  const written: { id: string; text: string }[] = [];
  for (let i = 0; i < pieces.length; i++) {
    const v = vectors[i];
    const c = await prisma.chunk.create({
      data: {
        originKind: origin.kind,
        originId: origin.id,
        originLabel: origin.label,
        sourceId: origin.sourceId ?? null,
        seq: i,
        text: pieces[i],
        embedding: v ? vecToBytes(v) : null,
        embedModel: v ? model : null,
      },
      select: { id: true, text: true },
    });
    written.push(c);
  }

  // Entity extraction is the only model call here; keep it best-effort so a
  // flaky extraction never loses the chunks we just wrote.
  let graph: ExtractedGraph;
  try {
    graph = await (opts.extract ?? extractEntities)(text, origin.label);
  } catch {
    return;
  }
  await persistGraph(graph, written, origin);
}

/** Index one Source (the Knowledge tab's links, PDFs and notes). */
export async function indexSource(sourceId: string, opts: IndexOpts = {}): Promise<void> {
  const src = await prisma.source.findUnique({ where: { id: sourceId } });
  if (!src) return dropOrigin("source", sourceId);

  const label = src.title ?? src.url ?? src.filename ?? "source";
  await indexOrigin(
    {
      kind: "source",
      id: sourceId,
      label,
      sourceId,
      text: (src.rawText ?? "").trim() || (src.summary ?? "").trim(),
    },
    opts,
  );
}

async function persistGraph(
  graph: ExtractedGraph,
  chunks: { id: string; text: string }[],
  origin: OriginInput,
): Promise<void> {
  // Ownership this origin held going in. Re-indexing re-asserts what the text
  // still says, so anything it drops has to lose this origin as an owner —
  // captured before the rewrite so the edges can be pruned after it.
  const priorEdgeIds = (
    await prisma.entityEdgeOrigin.findMany({
      where: { originKind: origin.kind, originId: origin.id },
      select: { edgeId: true },
    })
  ).map((o) => o.edgeId);
  await prisma.entityEdgeOrigin.deleteMany({
    where: { originKind: origin.kind, originId: origin.id },
  });

  // Upsert every named entity — including edge endpoints the extractor didn't
  // list (they may be described in another origin; the edge still connects).
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
  // to the first chunk so they stay reachable from this origin.
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
    const edge = await prisma.entityEdge.upsert({
      where: { fromId_toId_relation: { fromId, toId, relation: e.relation } },
      update: {},
      create: { fromId, toId, relation: e.relation },
      select: { id: true },
    });
    // Claim it for this origin. Another origin asserting the same relation
    // keeps its own row, so the edge survives until the last owner is gone.
    await prisma.entityEdgeOrigin.createMany({
      data: [{ edgeId: edge.id, originKind: origin.kind, originId: origin.id }],
      skipDuplicates: true,
    });
  }

  // Relations this origin used to assert and no longer does, now unowned.
  if (priorEdgeIds.length) {
    await prisma.entityEdge.deleteMany({
      where: { id: { in: priorEdgeIds }, origins: { none: {} } },
    });
  }
  await pruneUnsupportedEntities();
}
