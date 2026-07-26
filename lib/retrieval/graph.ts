import { prisma } from "../db";
import { entityKey } from "./entities";

/**
 * Read + repair layer for the extracted knowledge graph.
 *
 * The graph is written by an LLM extraction pass at ingest time
 * (`indexer.ts`), so it carries the usual extraction faults: the same thing
 * named two ways, entities nobody mentions, relations that were never stated.
 * Those faults are invisible in chat and quietly weaken one-hop expansion in
 * `search.ts`, so the admin needs to see and correct them.
 *
 * Everything here is plain data access with no request/auth context, so the
 * admin server actions stay thin wrappers and this logic stays testable.
 */

export type GraphStats = {
  sources: number;
  chunks: number;
  entities: number;
  edges: number;
  /// Chunks whose embedding failed — invisible to vector scoring.
  chunksWithoutEmbedding: number;
  /// Chunks per embedding model. More than one entry means the index is mixed
  /// and cosine is skipped across the boundary (see `search.ts`).
  embedModels: { model: string; count: number }[];
  /// Chunks per admin surface — shows at a glance whether the graph is being
  /// fed by everything or by one lopsided origin.
  origins: { kind: string; count: number }[];
  orphanEntities: number;
};

export type GraphEntity = {
  id: string;
  name: string;
  type: string;
  /// How many chunks mention it. Zero = unreachable by retrieval.
  mentions: number;
  /// Titles of the sources those chunks came from.
  sources: string[];
  edges: number;
};

export type GraphEdge = {
  id: string;
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  relation: string;
};

export async function graphStats(): Promise<GraphStats> {
  const [sources, chunks, entities, edges, models, originRows, orphanEntities] = await Promise.all([
    prisma.source.count(),
    prisma.chunk.count(),
    prisma.entity.count(),
    prisma.entityEdge.count(),
    prisma.chunk.groupBy({ by: ["embedModel"], _count: { _all: true } }),
    prisma.chunk.groupBy({ by: ["originKind"], _count: { _all: true } }),
    prisma.entity.count({ where: { mentions: { none: {} } } }),
  ]);

  const origins = originRows
    .map((o) => ({ kind: o.originKind, count: o._count._all }))
    .sort((a, b) => b.count - a.count);

  let chunksWithoutEmbedding = 0;
  const embedModels: { model: string; count: number }[] = [];
  for (const m of models) {
    if (m.embedModel) embedModels.push({ model: m.embedModel, count: m._count._all });
    else chunksWithoutEmbedding += m._count._all;
  }
  embedModels.sort((a, b) => b.count - a.count);

  return {
    sources, chunks, entities, edges,
    chunksWithoutEmbedding, embedModels, origins, orphanEntities,
  };
}

export async function listEntities(): Promise<GraphEntity[]> {
  const rows = await prisma.entity.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { edgesOut: true, edgesIn: true } },
      mentions: { select: { chunk: { select: { originLabel: true, originKind: true } } } },
    },
  });

  return rows.map((e) => ({
    id: e.id,
    name: e.name,
    type: e.type,
    mentions: e.mentions.length,
    sources: [
      ...new Set(e.mentions.map((m) => m.chunk.originLabel || m.chunk.originKind)),
    ],
    edges: e._count.edgesOut + e._count.edgesIn,
  }));
}

export async function listEdges(): Promise<GraphEdge[]> {
  const rows = await prisma.entityEdge.findMany({
    include: { from: { select: { id: true, name: true } }, to: { select: { id: true, name: true } } },
  });
  return rows
    .map((e) => ({
      id: e.id,
      fromId: e.from.id,
      fromName: e.from.name,
      toId: e.to.id,
      toName: e.to.name,
      relation: e.relation,
    }))
    .sort((a, b) => a.fromName.localeCompare(b.fromName) || a.relation.localeCompare(b.relation));
}

/**
 * Rename and/or retype an entity. When the new name normalizes to a key that
 * another entity already owns, the two are merged into that existing entity
 * rather than colliding on the unique key — this is the main cleanup path, so
 * "Blake" and "Blake Mauri" can be made one node.
 */
export async function renameEntity(
  id: string,
  name: string,
  type: string,
): Promise<{ merged: boolean }> {
  const clean = name.replace(/\s+/g, " ").trim();
  if (!clean) return { merged: false };

  const entity = await prisma.entity.findUnique({ where: { id } });
  if (!entity) return { merged: false };

  const key = entityKey(clean);
  const existing = key === entity.key ? null : await prisma.entity.findUnique({ where: { key } });

  if (!existing) {
    await prisma.entity.update({ where: { id }, data: { name: clean, key, type } });
    return { merged: false };
  }

  await mergeInto(entity.id, existing.id);
  return { merged: true };
}

/**
 * Fold `fromId` into `intoId`: move its mentions and rewire its edges, then
 * delete it (remaining mentions/edges cascade). Duplicate edges collapse and
 * edges whose endpoints become identical are dropped.
 */
async function mergeInto(fromId: string, intoId: string): Promise<void> {
  const mentions = await prisma.entityMention.findMany({ where: { entityId: fromId } });
  if (mentions.length) {
    await prisma.entityMention.createMany({
      data: mentions.map((m) => ({ chunkId: m.chunkId, entityId: intoId })),
      skipDuplicates: true,
    });
  }

  const edges = await prisma.entityEdge.findMany({
    where: { OR: [{ fromId }, { toId: fromId }] },
  });
  for (const e of edges) {
    const a = e.fromId === fromId ? intoId : e.fromId;
    const b = e.toId === fromId ? intoId : e.toId;
    if (a === b) continue; // self-loop — carries no information
    await prisma.entityEdge.upsert({
      where: { fromId_toId_relation: { fromId: a, toId: b, relation: e.relation } },
      update: {},
      create: { fromId: a, toId: b, relation: e.relation },
    });
  }

  await prisma.entity.delete({ where: { id: fromId } });
}

/** Remove an entity. Mentions and edges cascade; chunks and sources are untouched. */
export async function deleteEntity(id: string): Promise<void> {
  await prisma.entity.delete({ where: { id } }).catch(() => {});
}

/**
 * Assert a relation the extractor missed. Returns false for a self-loop or a
 * missing endpoint; repeating the same triple is a no-op.
 */
export async function addEdge(fromId: string, toId: string, relation: string): Promise<boolean> {
  const rel = relation.replace(/\s+/g, " ").trim().slice(0, 60);
  if (!rel || !fromId || !toId || fromId === toId) return false;

  const endpoints = await prisma.entity.count({ where: { id: { in: [fromId, toId] } } });
  if (endpoints !== 2) return false;

  await prisma.entityEdge.upsert({
    where: { fromId_toId_relation: { fromId, toId, relation: rel } },
    update: {},
    create: { fromId, toId, relation: rel },
  });
  return true;
}

export async function deleteEdge(id: string): Promise<void> {
  await prisma.entityEdge.delete({ where: { id } }).catch(() => {});
}
