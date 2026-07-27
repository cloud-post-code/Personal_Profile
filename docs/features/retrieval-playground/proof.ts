/**
 * Primary proof for retrieval-playground (see PROOF.md).
 * Run: npx tsx docs/features/retrieval-playground/proof.ts
 *
 * Seeds throwaway sources (ids prefixed "playproof"), drives the real
 * lib/retrieval/graph.ts retrievalPreview over the live chunk/entity/edge
 * tables, asserts, and cleans up. Extraction is stubbed; zero Anthropic calls.
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

const KEYS = ["thornmere studio", "ashgrove bindery"];

async function main() {
  const { prisma } = await import("../../../lib/db");
  const { indexSource } = await import("../../../lib/retrieval/indexer");
  const { retrievalPreview } = await import("../../../lib/retrieval/graph");
  const { retrieve } = await import("../../../lib/retrieval/search");

  // Pin the deterministic local embedder: with a hosted provider, cosine
  // scores depend on live API output, and max-normalization means a non-empty
  // index never returns zero chunks — assertions must not hinge on either.
  // Deleted AFTER the imports because Prisma re-loads .env on import, which
  // would silently restore the keys.
  delete process.env.VOYAGE_API_KEY;
  delete process.env.OPENAI_API_KEY;

  // ── Clean leftovers, take baselines ──
  await prisma.source.deleteMany({ where: { id: { startsWith: "playproof" } } });
  await prisma.entity.deleteMany({ where: { key: { in: KEYS } } });
  const baseChunks = await prisma.chunk.count();
  const baseMentions = await prisma.entityMention.count();

  try {
    // ── Seed: src1 mentions Thornmere Studio; src2 mentions Ashgrove Bindery.
    // The only path from a Thornmere query to src2's chunk is the edge.
    //
    // Shape matters: src1 carries the marker in EVERY sentence so all of its
    // ~8 chunks outrank everything and fill the 6 seed slots — otherwise the
    // local embedder's hash-collision noise can float src2 into a seed slot
    // and the rank/graph split under test never happens. src2 is one short
    // line so the graph hop still fits retrieve()'s 6000-char budget after
    // the seeds. ──
    const src1Text = Array.from(
      { length: 100 },
      (_, i) =>
        `Thornmere Studio GLINTWHEELX workshop log entry ${i} covering weekend build notes.`,
    ).join(" ");
    const src2Text = "Ashgrove Bindery runs a letterpress workshop in the fens.";

    await prisma.source.create({
      data: {
        id: "playproof-src1", type: "text", title: "Thornmere notes",
        rawText: src1Text, summary: "Notes on Thornmere Studio.", status: "scanned",
      },
    });
    await prisma.source.create({
      data: {
        id: "playproof-src2", type: "text", title: "Ashgrove writeup",
        rawText: src2Text, summary: "About Ashgrove Bindery.", status: "scanned",
      },
    });

    await indexSource("playproof-src1", {
      extract: async () => ({
        entities: [{ name: "Thornmere Studio", type: "org" }],
        edges: [
          { from: "Thornmere Studio", to: "Ashgrove Bindery", relation: "prints with" },
        ],
      }),
    });
    await indexSource("playproof-src2", {
      extract: async () => ({
        entities: [{ name: "Ashgrove Bindery", type: "org" }],
        edges: [],
      }),
    });

    // ── 1–5. A query that hits src1 lexically and src2 only via the edge.
    // Only distinctive tokens: filler words like "build" appear in every
    // seeded source and would hand src2 a lexical seed slot of its own. ──
    const query = "GLINTWHEELX Thornmere Studio";
    const r = await retrievalPreview(query);

    const ranked = r.chunks.filter((c) => c.via === "rank");
    const graphHits = r.chunks.filter((c) => c.via === "graph");

    check("ranked hit returned with positive score",
      ranked.some((c) => c.ref === "Thornmere notes" && c.score > 0),
      JSON.stringify(r.chunks.map((c) => [c.ref, c.via, c.score])));
    check("graph hit reaches the other source through the edge",
      graphHits.some((c) => c.ref === "Ashgrove writeup"),
      JSON.stringify(r.chunks.map((c) => [c.ref, c.via])));
    check("query entity recognized",
      r.queryEntities.includes("Thornmere Studio"),
      JSON.stringify(r.queryEntities));
    check("relations include the seeded edge",
      r.relations.some((line) => line.includes("Thornmere Studio") && line.includes("Ashgrove Bindery")),
      JSON.stringify(r.relations));
    const lastRank = r.chunks.map((c) => c.via).lastIndexOf("rank");
    const firstGraph = r.chunks.map((c) => c.via).indexOf("graph");
    check("every rank chunk precedes every graph chunk",
      firstGraph === -1 || lastRank < firstGraph,
      JSON.stringify(r.chunks.map((c) => c.via)));

    check("index reported non-empty", r.indexEmpty === false);

    // ── 6. Blank query ──
    const blank = await retrievalPreview("   ");
    check("blank query returns empty result",
      blank.chunks.length === 0 && blank.relations.length === 0 && blank.queryEntities.length === 0);

    // ── 7. No second retrieval path: the playground shows exactly what
    // retrieve() returns for the same query ──
    const direct = await retrieve(query);
    check("preview chunks mirror retrieve() exactly",
      JSON.stringify(r.chunks) ===
        JSON.stringify(
          direct.chunks.map((c) => ({
            ref: c.ref,
            originKind: c.originKind,
            text: c.text,
            score: c.score,
            via: c.via,
          })),
        ),
      `preview ${r.chunks.length} vs direct ${direct.chunks.length}`);
    check("preview relations mirror retrieve() exactly",
      JSON.stringify(r.relations) === JSON.stringify(direct.relations));

    // ── 8. Nonsense query never throws (what it returns is retrieve()'s
    // business — with vectors in play a non-empty index can still score) ──
    const miss = await retrievalPreview("zxqvv wprtk fnlmm");
    check("nonsense query does not throw", Array.isArray(miss.chunks));
  } finally {
    // ── 9. Cleanup ──
    await prisma.source.deleteMany({ where: { id: { startsWith: "playproof" } } });
    await prisma.entity.deleteMany({ where: { key: { in: KEYS } } });
    check("chunks back to baseline", (await prisma.chunk.count()) === baseChunks);
    check("mentions back to baseline", (await prisma.entityMention.count()) === baseMentions);
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
