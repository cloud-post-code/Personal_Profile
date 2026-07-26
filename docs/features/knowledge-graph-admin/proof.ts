/**
 * Primary proof for knowledge-graph-admin (see PROOF.md).
 * Run: npx tsx docs/features/knowledge-graph-admin/proof.ts
 *
 * Seeds throwaway sources (ids prefixed "graphproof"), exercises the real
 * lib/retrieval/graph.ts read + fix code path against the local dev Postgres,
 * asserts, and cleans up. Entity extraction is stubbed so the proof does not
 * depend on live Claude output.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

// Load .env ourselves (tsx doesn't); never override values already set.
const root = path.resolve(__dirname, "../../..");
for (const line of readFileSync(path.join(root, ".env"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) {
    process.env[m[1]] = m[2].trim().replace(/^(["'])(.*)\1$/, "$2");
  }
}

let failures = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** Filler prose so a source spans multiple chunks. */
function para(marker: string, n: number): string {
  const filler =
    "This paragraph covers workshop notes, build logs, and small lessons " +
    "learned while iterating on the rig over several weekends. ";
  return `${marker} appears here in paragraph ${n}. ${filler.repeat(6)}`;
}

const KEYS = [
  "brambleworks",
  "bramble works ltd",
  "harrowgate press",
  "solstice kiln",
  "driftfen collective",
];

async function main() {
  const { prisma } = await import("../../../lib/db");
  const { indexSource } = await import("../../../lib/retrieval/indexer");
  const { retrieve } = await import("../../../lib/retrieval/search");
  const {
    graphStats,
    listEntities,
    listEdges,
    renameEntity,
    deleteEntity,
    addEdge,
    deleteEdge,
  } = await import("../../../lib/retrieval/graph");

  // ── Clean leftovers from a previous run, then take baselines ──
  await prisma.source.deleteMany({ where: { id: { startsWith: "graphproof" } } });
  await prisma.entity.deleteMany({ where: { key: { in: KEYS } } });
  const baseChunks = await prisma.chunk.count();
  const baseMentions = await prisma.entityMention.count();
  const baseEntities = await prisma.entity.count();

  try {
    // ── Seed two sources ──
    // src1 text mentions "Brambleworks"; src2 text mentions "Harrowgate Press".
    // The stub also declares "Bramble Works Ltd" (a duplicate spelling of the
    // same org, mentioned nowhere) and an orphan "Driftfen Collective".
    const src1Text = [1, 2, 3].map((n) => para("Brambleworks LOOMDRIVEX", n)).join("\n\n");
    const src2Text = [1, 2].map((n) => para("Harrowgate Press letterpress", n)).join("\n\n");

    await prisma.source.create({
      data: {
        id: "graphproof-src1", type: "text", title: "Brambleworks notes",
        rawText: src1Text, summary: "Notes on Brambleworks.", status: "scanned",
      },
    });
    await prisma.source.create({
      data: {
        id: "graphproof-src2", type: "text", title: "Harrowgate writeup",
        rawText: src2Text, summary: "About Harrowgate Press.", status: "scanned",
      },
    });

    await indexSource("graphproof-src1", {
      extract: async () => ({
        entities: [
          { name: "Brambleworks", type: "org" },
          { name: "Driftfen Collective", type: "org" },
        ],
        edges: [{ from: "Brambleworks", to: "Solstice Kiln", relation: "operates" }],
      }),
    });
    await indexSource("graphproof-src2", {
      extract: async () => ({
        entities: [
          { name: "Harrowgate Press", type: "org" },
          { name: "Bramble Works Ltd", type: "org" },
        ],
        edges: [{ from: "Bramble Works Ltd", to: "Solstice Kiln", relation: "operates" }],
      }),
    });

    const byKey = async (key: string) => prisma.entity.findUnique({ where: { key } });

    // ── 1. Stats ──
    const stats = await graphStats();
    const totalChunks = await prisma.chunk.count();
    check("stats count entities", stats.entities >= baseEntities + 5, `got ${stats.entities}`);
    check("stats count chunks", stats.chunks === totalChunks, `got ${stats.chunks}`);
    check("stats count edges", stats.edges >= 2, `got ${stats.edges}`);
    check(
      "embedModels breakdown accounts for every chunk",
      stats.embedModels.reduce((s, m) => s + m.count, 0) + stats.chunksWithoutEmbedding ===
        stats.chunks,
      JSON.stringify(stats.embedModels),
    );

    // ── 2. Entity listing ──
    const entities = await listEntities();
    const bramble = entities.find((e) => e.name === "Brambleworks");
    const renameTarget = entities.find((e) => e.name === "Driftfen Collective");
    const dup = entities.find((e) => e.name === "Bramble Works Ltd");
    // A true orphan is an edge endpoint the extractor never listed as an
    // entity: `persistGraph` upserts it so the edge resolves, but creates no
    // mentions for it, so retrieval can never reach it.
    const orphan = entities.find((e) => e.name === "Solstice Kiln");
    check("listEntities returns mention counts", !!bramble && bramble.mentions > 0,
      `mentions=${bramble?.mentions}`);
    check("listEntities reports source titles", !!bramble?.sources.includes("Brambleworks notes"),
      JSON.stringify(bramble?.sources));
    check("listEntities reports edge counts", !!bramble && bramble.edges >= 1);
    check("orphan entity reported with zero mentions", !!orphan && orphan.mentions === 0,
      `mentions=${orphan?.mentions}`);

    // ── 3. Edge listing ──
    const edgesList = await listEdges();
    check(
      "listEdges renders endpoint names",
      edgesList.some((e) => e.fromName === "Brambleworks" && e.toName === "Solstice Kiln"),
      JSON.stringify(edgesList.slice(0, 4)),
    );

    // ── 4. Rename without collision ──
    const renameId = renameTarget!.id;
    const r1 = await renameEntity(renameId, "Driftfen Guild", "project");
    const renamed = await prisma.entity.findUnique({ where: { id: renameId } });
    check("rename updates name/type/key",
      renamed?.name === "Driftfen Guild" && renamed?.type === "project" &&
      renamed?.key === "driftfen guild",
      JSON.stringify(renamed));
    check("rename without collision reports merged:false", r1.merged === false);

    // ── 5 + 6. Rename into an existing name merges ──
    // "Bramble Works Ltd" -> "Brambleworks". Both have an identical edge to
    // Solstice Kiln, so the rewired edge must collapse, not duplicate.
    const dupId = dup!.id;
    const brambleId = bramble!.id;
    const dupMentions = await prisma.entityMention.count({ where: { entityId: dupId } });
    const r2 = await renameEntity(dupId, "Brambleworks", "org");
    check("merge reports merged:true", r2.merged === true);
    check("merged-away entity row is gone", (await prisma.entity.findUnique({ where: { id: dupId } })) === null);
    check("survivor still exists", (await byKey("brambleworks")) !== null);
    const edgesAfter = await prisma.entityEdge.count({
      where: { fromId: brambleId, relation: "operates" },
    });
    check("duplicate edge collapsed on merge", edgesAfter === 1, `got ${edgesAfter}`);
    check("no dangling mentions for merged entity",
      (await prisma.entityMention.count({ where: { entityId: dupId } })) === 0,
      `had ${dupMentions} before merge`);

    // Self-loop drop: point an edge at the survivor, then merge a third entity
    // into it so the edge's endpoints would collapse to the same entity.
    const kiln = await byKey("solstice kiln");
    await addEdge(brambleId, kiln!.id, "shares staff with");
    const r3 = await renameEntity(kiln!.id, "Brambleworks", "org");
    check("second merge reports merged:true", r3.merged === true);
    const selfLoops = await prisma.entityEdge.count({
      where: { fromId: brambleId, toId: brambleId },
    });
    check("self-loop edges dropped on merge", selfLoops === 0, `got ${selfLoops}`);

    // ── 7. Add edge ──
    const harrow = await byKey("harrowgate press");
    await addEdge(brambleId, harrow!.id, "prints with");
    const added = await prisma.entityEdge.count({
      where: { fromId: brambleId, toId: harrow!.id, relation: "prints with" },
    });
    check("addEdge creates the relation", added === 1, `got ${added}`);
    await addEdge(brambleId, harrow!.id, "prints with");
    check("addEdge is idempotent for the same triple",
      (await prisma.entityEdge.count({
        where: { fromId: brambleId, toId: harrow!.id, relation: "prints with" },
      })) === 1);
    const selfResult = await addEdge(brambleId, brambleId, "is");
    check("addEdge refuses a self-loop", selfResult === false,
      `returned ${selfResult}`);

    // ── 10. Retrieval still reaches src2 via the merged entity's edge ──
    const r = await retrieve("Tell me about the Brambleworks LOOMDRIVEX build");
    check("retrieval reaches the other source via merged entity edge",
      r.chunks.some((c) => c.sourceId === "graphproof-src2"),
      JSON.stringify(r.chunks.map((c) => c.sourceId)));

    // ── 8. Delete edge ──
    const target = await prisma.entityEdge.findFirst({
      where: { fromId: brambleId, toId: harrow!.id, relation: "prints with" },
    });
    const edgeCountBefore = await prisma.entityEdge.count();
    await deleteEdge(target!.id);
    check("deleteEdge removes exactly one relation",
      (await prisma.entityEdge.count()) === edgeCountBefore - 1);

    // ── 9. Delete entity leaves chunks/sources intact ──
    const chunksBefore = await prisma.chunk.count({ where: { sourceId: "graphproof-src2" } });
    await deleteEntity(harrow!.id);
    check("deleteEntity removes the entity",
      (await byKey("harrowgate press")) === null);
    check("deleteEntity leaves chunks intact",
      (await prisma.chunk.count({ where: { sourceId: "graphproof-src2" } })) === chunksBefore,
      `${chunksBefore} -> ${await prisma.chunk.count({ where: { sourceId: "graphproof-src2" } })}`);
    check("deleteEntity leaves the source intact",
      (await prisma.source.findUnique({ where: { id: "graphproof-src2" } })) !== null);
  } finally {
    // ── 11. Cleanup ──
    await prisma.source.deleteMany({ where: { id: { startsWith: "graphproof" } } });
    await prisma.entity.deleteMany({
      where: { key: { in: [...KEYS, "driftfen guild"] } },
    });
    check("chunks cascade-deleted with sources", (await prisma.chunk.count()) === baseChunks);
    check("mentions cascade-deleted", (await prisma.entityMention.count()) === baseMentions);
    await prisma.$disconnect();
  }

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log("\nAll proof assertions passed");
}

main().catch((e) => {
  console.error("Proof run errored:", e);
  process.exit(1);
});
