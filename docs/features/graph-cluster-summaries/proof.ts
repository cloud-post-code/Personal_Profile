/**
 * Primary proof for graph-cluster-summaries (see PROOF.md).
 * Run: npx tsx docs/features/graph-cluster-summaries/proof.ts
 *
 * Pure clustering contracts + an offline integration pass against the local
 * dev Postgres. Extractor and summarizer are injected; zero Anthropic calls.
 * Leaves the overview store empty (see PROOF.md — rebuild from the Graph tab).
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

const KEYS = ["glintharbor collective", "wrenfold press", "saltmarsh atelier"];

async function main() {
  const { prisma } = await import("../../../lib/db");
  const { indexSource } = await import("../../../lib/retrieval/indexer");
  const { retrieve } = await import("../../../lib/retrieval/search");
  const { buildSystemPrompt } = await import("../../../lib/knowledge");
  const { computeClusters, buildClusterOverviews, broadOverviews, isBroadQuery } =
    await import("../../../lib/retrieval/clusters");

  // Pin the deterministic local embedder AFTER imports (Prisma re-loads .env).
  delete process.env.VOYAGE_API_KEY;
  delete process.env.OPENAI_API_KEY;

  // ── 1. Pure clustering ──
  const E = (id: string, mentions: number) => ({ id, name: id.toUpperCase(), mentions });
  const hubby = [E("hub", 9), E("a", 5), E("b", 1), E("c", 1), E("d", 7), E("e", 2)];
  const hubbyEdges = [
    { fromId: "hub", toId: "a" }, { fromId: "hub", toId: "b" },
    { fromId: "hub", toId: "c" }, { fromId: "hub", toId: "d" },
    { fromId: "hub", toId: "e" },
    { fromId: "a", toId: "b" }, { fromId: "c", toId: "d" },
  ];
  const clusters = computeClusters(hubby, hubbyEdges);
  check("hub removal splits the blob into two clusters",
    clusters.length === 2, JSON.stringify(clusters));
  check("singleton fragment dropped",
    clusters.every((c) => !c.memberIds.includes("e")));
  check("clusters labelled by top-mention member and ordered by weight",
    clusters[0]?.label === "D" && clusters[1]?.label === "A",
    JSON.stringify(clusters.map((c) => c.label)));
  check("clustering is deterministic",
    JSON.stringify(computeClusters(hubby, hubbyEdges)) === JSON.stringify(clusters));

  // Low-degree top entity is not treated as a hub.
  const chain = [E("x", 1), E("y", 1), E("z", 1)];
  const chainEdges = [{ fromId: "x", toId: "y" }, { fromId: "y", toId: "z" }];
  const chainClusters = computeClusters(chain, chainEdges);
  check("no hub removal below the degree floor",
    chainClusters.length === 1 && chainClusters[0].memberIds.length === 3,
    JSON.stringify(chainClusters));

  // Cap: hub + 7 pair-components -> 6 kept, the lightest dropped.
  const capEnts = [E("hub", 0)];
  const capEdges: { fromId: string; toId: string }[] = [];
  for (let i = 0; i < 7; i++) {
    capEnts.push(E(`p${i}`, i + 1), E(`q${i}`, 0));
    capEdges.push({ fromId: "hub", toId: `p${i}` }, { fromId: `p${i}`, toId: `q${i}` });
  }
  const capped = computeClusters(capEnts, capEdges);
  check("cluster cap keeps the 6 heaviest",
    capped.length === 6 && capped.every((c) => !c.memberIds.includes("p0")),
    JSON.stringify(capped.map((c) => c.label)));

  // ── 2. Pure broad-query predicate ──
  const df = new Map([["glintharborx", 1], ["blake", 40], ["about", 30]]);
  check("rare token is distinctive (not broad)",
    isBroadQuery(["about", "glintharborx"], df, 100, new Set()) === false);
  check("common + unknown tokens are broad",
    isBroadQuery(["about", "blake", "wibbleflap"], df, 100, new Set()) === true);
  check("owner name never counts as distinctive",
    isBroadQuery(["blake"], new Map([["blake", 2]]), 100, new Set(["blake"])) === true);

  // ── Integration: seed a self-contained fictional component ──
  await prisma.source.deleteMany({ where: { id: { startsWith: "clusterproof" } } });
  await prisma.entity.deleteMany({ where: { key: { in: KEYS } } });
  await prisma.chunk.deleteMany({ where: { originKind: "cluster" } });
  const baseChunks = await prisma.chunk.count();
  const baseMentions = await prisma.entityMention.count();
  const baseEntities = await prisma.entity.count();

  try {
    await prisma.source.create({
      data: {
        id: "clusterproof-src1", type: "text", title: "Glintharbor notes",
        rawText:
          "Glintharbor Collective GLINTHARBORX runs a print studio. " +
          "Glintharbor Collective partners with Wrenfold Press on letterpress runs. " +
          "Saltmarsh Atelier supplies Glintharbor Collective with handmade paper.",
        summary: "About the collective.", status: "scanned",
      },
    });
    await indexSource("clusterproof-src1", {
      extract: async () => ({
        entities: [
          { name: "Glintharbor Collective", type: "org" },
          { name: "Wrenfold Press", type: "org" },
          { name: "Saltmarsh Atelier", type: "org" },
        ],
        edges: [
          { from: "Glintharbor Collective", to: "Wrenfold Press", relation: "partners with" },
          { from: "Saltmarsh Atelier", to: "Glintharbor Collective", relation: "supplies" },
        ],
      }),
    });

    const entitiesBefore = await prisma.entity.count();
    const edgesBefore = await prisma.entityEdge.count();

    // ── 3. Build with a stub summarizer ──
    const stub = async (label: string) => `PROOFSUMMARYX overview of ${label}.`;
    const wrote = await buildClusterOverviews({ summarize: stub });
    check("builder reports written overviews", wrote >= 1, `wrote ${wrote}`);

    const overview = await prisma.chunk.findFirst({
      where: { originKind: "cluster", originLabel: "Overview — Glintharbor Collective" },
    });
    check("overview chunk written for the seeded cluster", overview !== null);
    check("overview carries the summarizer's text",
      !!overview?.text.includes("PROOFSUMMARYX"), overview?.text?.slice(0, 80));
    check("overview is embedded", overview?.embedding !== null && overview?.embedModel !== null,
      String(overview?.embedModel));

    // ── 4. No graph pollution ──
    check("rebuild adds no entities", (await prisma.entity.count()) === entitiesBefore);
    check("rebuild adds no edges", (await prisma.entityEdge.count()) === edgesBefore);

    // ── 5. Broad question served the overview block ──
    const broad = await broadOverviews("flibberty gobsmack chortleworth");
    check("broad query returns the overview block",
      !!broad?.includes("PROOFSUMMARYX") && !!broad?.includes("Glintharbor Collective"),
      broad?.slice(0, 120) ?? "null");
    const prompt = await buildSystemPrompt("flibberty gobsmack chortleworth");
    check("system prompt carries overviews for a broad question",
      prompt.includes("PROOFSUMMARYX"));

    // ── 6. Specific question is not broad ──
    check("distinctive-token query is served chunks, not overviews",
      (await broadOverviews("tell me about GLINTHARBORX")) === null);

    // ── 7. retrieve() never returns cluster chunks ──
    const r = await retrieve("PROOFSUMMARYX overview");
    check("retrieval excludes cluster chunks",
      r.chunks.every((c) => c.originKind !== "cluster"),
      JSON.stringify(r.chunks.map((c) => [c.ref, c.originKind])));

    // ── 8. A failing summarizer keeps the previous overview (the sweep must
    // not treat a provider hiccup as a vanished cluster) ──
    await buildClusterOverviews({
      summarize: async () => {
        throw new Error("provider down");
      },
    });
    check("failed summary keeps the previous overview",
      (await prisma.chunk.count({
        where: { originKind: "cluster", originLabel: "Overview — Glintharbor Collective" },
      })) === 1);

    // ── 9. Sweep: cluster gone -> overview gone ──
    await prisma.source.deleteMany({ where: { id: { startsWith: "clusterproof" } } });
    await prisma.entity.deleteMany({ where: { key: { in: KEYS } } });
    await buildClusterOverviews({ summarize: stub });
    check("orphaned overview swept on rebuild",
      (await prisma.chunk.count({
        where: { originKind: "cluster", originLabel: "Overview — Glintharbor Collective" },
      })) === 0);
  } finally {
    // ── 10. Cleanup ──
    await prisma.source.deleteMany({ where: { id: { startsWith: "clusterproof" } } });
    await prisma.entity.deleteMany({ where: { key: { in: KEYS } } });
    await prisma.chunk.deleteMany({ where: { originKind: "cluster" } });
    check("chunks back to baseline", (await prisma.chunk.count()) === baseChunks);
    check("mentions back to baseline", (await prisma.entityMention.count()) === baseMentions);
    check("entities back to baseline", (await prisma.entity.count()) === baseEntities);
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
