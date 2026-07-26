/**
 * Primary proof for retrieval-engine-v1 (see PROOF.md).
 * Run: npx tsx docs/features/retrieval-engine-v1/proof.ts
 *
 * Seeds throwaway sources (ids prefixed "prooftest"), runs the real
 * chunk/embed/index/retrieve/prompt pipeline against the local dev Postgres,
 * asserts, and cleans up. Entity extraction is injected as a deterministic
 * stub; everything else is the real code path.
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
    "This paragraph talks about day to day engineering habits, notes from the " +
    "workshop, and small lessons learned while iterating on side projects. ";
  return `${marker} appears here in paragraph ${n}. ${filler.repeat(6)}`;
}

async function main() {
  const { prisma } = await import("../../../lib/db");
  const { indexSource } = await import("../../../lib/retrieval/indexer");
  const { retrieve, formatContext } = await import("../../../lib/retrieval/search");
  const { buildSystemPrompt } = await import("../../../lib/knowledge");

  const ENTITY_KEYS = ["zephyrwind", "aeolus labs", "kilnglaze studio"];

  // ── Clean any leftovers from a previous run, then take baselines ──
  await prisma.source.deleteMany({ where: { id: { startsWith: "prooftest" } } });
  await prisma.entity.deleteMany({ where: { key: { in: ENTITY_KEYS } } });
  const baseChunks = await prisma.chunk.count();
  const baseMentions = await prisma.entityMention.count();

  try {
    // ── Seed three sources ──
    // src1 mentions Zephyrwind (entity A) only; its stub declares edge A→B
    // where B (Aeolus Labs) is only ever mentioned in src2's text.
    const src1Text = [1, 2, 3].map((n) => para("Zephyrwind TELEMETRYRIGALPHA", n)).join("\n\n");
    const src2Text = [1, 2].map((n) => para("Aeolus Labs wind research", n)).join("\n\n");
    const src3Text = [1, 2].map((n) => para("KILNGLAZE pottery ceramics", n)).join("\n\n");

    await prisma.source.create({
      data: {
        id: "prooftest-src1", type: "text", title: "Zephyrwind project notes",
        rawText: src1Text, summary: "Notes on the Zephyrwind rig.", status: "scanned",
      },
    });
    await prisma.source.create({
      data: {
        id: "prooftest-src2", type: "text", title: "Aeolus Labs writeup",
        rawText: src2Text, summary: "About Aeolus Labs.", status: "scanned",
      },
    });
    await prisma.source.create({
      data: {
        id: "prooftest-src3", type: "text", title: "Pottery notes",
        rawText: src3Text, summary: "SUMMARYMARKER-KILN unrelated pottery summary.",
        status: "scanned",
      },
    });

    // ── 1. Indexing (with deterministic stubbed extraction) ──
    await indexSource("prooftest-src1", {
      extract: async () => ({
        entities: [{ name: "Zephyrwind", type: "project" }],
        edges: [{ from: "Zephyrwind", to: "Aeolus Labs", relation: "developed at" }],
      }),
    });
    await indexSource("prooftest-src2", {
      extract: async () => ({
        entities: [{ name: "Aeolus Labs", type: "org" }],
        edges: [],
      }),
    });
    await indexSource("prooftest-src3", {
      extract: async () => ({
        entities: [{ name: "Kilnglaze Studio", type: "org" }],
        edges: [],
      }),
    });

    const c1 = await prisma.chunk.findMany({ where: { sourceId: "prooftest-src1" } });
    check("src1 produced >=2 chunks", c1.length >= 2, `got ${c1.length}`);
    check(
      "chunks have embeddings + model tag",
      c1.every((c) => c.embedding !== null && !!c.embedModel),
    );
    const entA = await prisma.entity.findUnique({ where: { key: "zephyrwind" } });
    const entB = await prisma.entity.findUnique({ where: { key: "aeolus labs" } });
    check("entities upserted", !!entA && !!entB);
    const edge = entA && entB
      ? await prisma.entityEdge.findFirst({ where: { fromId: entA.id, toId: entB.id } })
      : null;
    check("edge A->B persisted", !!edge, "no edge from zephyrwind to aeolus labs");
    const mentionsA = entA
      ? await prisma.entityMention.count({ where: { entityId: entA.id } })
      : 0;
    check("entity A has mentions in src1 chunks", mentionsA > 0);

    // ── 2. Idempotent re-index ──
    await indexSource("prooftest-src1", {
      extract: async () => ({
        entities: [{ name: "Zephyrwind", type: "project" }],
        edges: [{ from: "Zephyrwind", to: "Aeolus Labs", relation: "developed at" }],
      }),
    });
    const c1b = await prisma.chunk.count({ where: { sourceId: "prooftest-src1" } });
    const edges2 = entA && entB
      ? await prisma.entityEdge.count({ where: { fromId: entA.id, toId: entB.id } })
      : 0;
    check("re-index does not duplicate chunks", c1b === c1.length, `${c1.length} -> ${c1b}`);
    check("re-index does not duplicate edges", edges2 === 1, `got ${edges2}`);

    // ── 3. Hybrid retrieval ──
    const r1 = await retrieve("Tell me about the Zephyrwind TELEMETRYRIGALPHA build");
    check(
      "query ranks src1 chunk",
      r1.chunks.some((c) => c.sourceId === "prooftest-src1"),
    );
    const r3 = await retrieve("KILNGLAZE pottery ceramics techniques");
    check(
      "unrelated query ranks src3 top, not src1",
      r3.chunks.length > 0 && r3.chunks[0].sourceId === "prooftest-src3",
      `top: ${r3.chunks[0]?.sourceId}`,
    );

    // ── 4. One-hop graph expansion ──
    check(
      "graph expansion surfaces src2 chunk for src1-only query",
      r1.chunks.some((c) => c.sourceId === "prooftest-src2"),
    );
    check(
      "relation line present",
      r1.relations.some((l) => l.includes("Zephyrwind") && l.includes("Aeolus Labs")),
      JSON.stringify(r1.relations),
    );
    check("formatContext renders chunks", formatContext(r1).includes("TELEMETRYRIGALPHA"));

    // ── 5. Prompt swap ──
    const prompt = await buildSystemPrompt("Tell me about the Zephyrwind TELEMETRYRIGALPHA build");
    check("prompt contains retrieved chunk text", prompt.includes("TELEMETRYRIGALPHA"));
    check(
      "prompt omits unrelated source summary",
      !prompt.includes("SUMMARYMARKER-KILN"),
    );
    const noQuery = await buildSystemPrompt();
    check("no-query prompt still usable", noQuery.length > 200 && noQuery.includes("RULES"));
  } finally {
    // ── 6. Cascade cleanup ──
    await prisma.source.deleteMany({ where: { id: { startsWith: "prooftest" } } });
    await prisma.entity.deleteMany({ where: { key: { in: ENTITY_KEYS } } });
    const endChunks = await prisma.chunk.count();
    const endMentions = await prisma.entityMention.count();
    check("chunks cascade-deleted with sources", endChunks === baseChunks);
    check("mentions cascade-deleted", endMentions === baseMentions);
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
