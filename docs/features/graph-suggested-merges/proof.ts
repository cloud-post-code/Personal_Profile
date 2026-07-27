/**
 * Primary proof for graph-suggested-merges (see PROOF.md).
 * Run: npx tsx docs/features/graph-suggested-merges/proof.ts
 *
 * Seeds throwaway sources (ids prefixed "mergeproof"), exercises the real
 * lib/retrieval/graph.ts suggestedMerges/mergeEntities path against the local
 * dev Postgres, asserts, and cleans up. Entity extraction is stubbed so the
 * proof makes zero Anthropic calls.
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
  "kestrel labs",
  "kestrel laboratories",
  "glimmer foundry",
  "peatlight archive",
  "veylance",
  "fen",
  "fenwick mills",
];

async function main() {
  const { prisma } = await import("../../../lib/db");
  const { indexSource } = await import("../../../lib/retrieval/indexer");
  const { suggestedMerges, mergeEntities, listEntities } = await import(
    "../../../lib/retrieval/graph"
  );

  // ── Clean leftovers from a previous run, then take baselines ──
  await prisma.source.deleteMany({ where: { id: { startsWith: "mergeproof" } } });
  await prisma.entity.deleteMany({ where: { key: { in: KEYS } } });
  const baseChunks = await prisma.chunk.count();
  const baseMentions = await prisma.entityMention.count();

  try {
    // ── Seed two sources ──
    // src1 mentions "Brambleworks" in three paragraphs (many mentions);
    // src2 mentions "Bramble Works Ltd" once (few mentions). The stubs also
    // build the Kestrel neighbor pair, the no-shared-word negative pair
    // (Glimmer Foundry / Peatlight Archive, which DO share 2 neighbors), the
    // unrelated "Veylance", and the sub-4-char containment "Fen" in
    // "Fenwick Mills".
    const src1Text = [1, 2, 3].map((n) => para("Brambleworks WHIRLIGIGX", n)).join("\n\n");
    const src2Text = para("Bramble Works Ltd registry entry", 1);

    await prisma.source.create({
      data: {
        id: "mergeproof-src1", type: "text", title: "Brambleworks notes",
        rawText: src1Text, summary: "Notes on Brambleworks.", status: "scanned",
      },
    });
    await prisma.source.create({
      data: {
        id: "mergeproof-src2", type: "text", title: "Registry writeup",
        rawText: src2Text, summary: "Registry entry.", status: "scanned",
      },
    });

    await indexSource("mergeproof-src1", {
      extract: async () => ({
        entities: [
          { name: "Brambleworks", type: "org" },
          { name: "Kestrel Labs", type: "org" },
          { name: "Veylance", type: "org" },
          { name: "Fen", type: "place" },
          { name: "Fenwick Mills", type: "org" },
        ],
        edges: [
          { from: "Brambleworks", to: "Glimmer Foundry", relation: "supplies" },
          { from: "Kestrel Labs", to: "Glimmer Foundry", relation: "works with" },
          { from: "Kestrel Labs", to: "Peatlight Archive", relation: "works with" },
        ],
      }),
    });
    await indexSource("mergeproof-src2", {
      extract: async () => ({
        entities: [
          { name: "Bramble Works Ltd", type: "org" },
          { name: "Kestrel Laboratories", type: "org" },
        ],
        edges: [
          { from: "Bramble Works Ltd", to: "Glimmer Foundry", relation: "supplies" },
          { from: "Kestrel Laboratories", to: "Glimmer Foundry", relation: "collaborates with" },
          { from: "Kestrel Laboratories", to: "Peatlight Archive", relation: "supplies" },
        ],
      }),
    });

    const entities = await listEntities();
    const byName = (n: string) => entities.find((e) => e.name === n);
    const bramble = byName("Brambleworks")!;
    const brambleDup = byName("Bramble Works Ltd")!;
    const kestrel1 = byName("Kestrel Labs")!;
    const kestrel2 = byName("Kestrel Laboratories")!;
    const foundry = byName("Glimmer Foundry")!;
    const archive = byName("Peatlight Archive")!;
    const veylance = byName("Veylance")!;
    const fen = byName("Fen")!;
    const fenwick = byName("Fenwick Mills")!;

    const suggestions = await suggestedMerges();
    const pair = (aId: string, bId: string) =>
      suggestions.filter(
        (s) =>
          (s.fromId === aId && s.intoId === bId) || (s.fromId === bId && s.intoId === aId),
      );

    // ── 1. Containment pair suggested ──
    const bramblePair = pair(bramble.id, brambleDup.id);
    check("containment pair suggested", bramblePair.length >= 1,
      JSON.stringify(suggestions.map((s) => `${s.fromName}->${s.intoName}`)));

    // ── 2. Shared-neighbor pair suggested ──
    const kestrelPair = pair(kestrel1.id, kestrel2.id);
    check("shared-neighbor pair suggested", kestrelPair.length >= 1,
      JSON.stringify(suggestions.map((s) => `${s.fromName}->${s.intoName}`)));

    // ── 3. Negatives ──
    check("unrelated entity pairs with nothing",
      suggestions.every((s) => s.fromId !== veylance.id && s.intoId !== veylance.id));
    check("sub-4-char containment not suggested", pair(fen.id, fenwick.id).length === 0);
    check("neighbor overlap without a shared word not suggested",
      pair(foundry.id, archive.id).length === 0);

    // ── 4. Direction: survivor is the higher-mention entity ──
    check("fixture premise: Brambleworks has more mentions than its duplicate",
      bramble.mentions > brambleDup.mentions,
      `${bramble.mentions} vs ${brambleDup.mentions}`);
    check("survivor is the higher-mention entity",
      bramblePair.length >= 1 && bramblePair[0].intoId === bramble.id &&
        bramblePair[0].fromId === brambleDup.id,
      JSON.stringify(bramblePair));

    // ── 5. Pair dedup ──
    const keys = suggestions.map((s) => [s.fromId, s.intoId].sort().join("|"));
    check("each unordered pair appears once", new Set(keys).size === keys.length,
      JSON.stringify(keys));

    // ── 6. One-click merge ──
    const dupMentions = brambleDup.mentions;
    const merged = await mergeEntities(brambleDup.id, bramble.id);
    check("mergeEntities reports success", merged === true);
    check("merged-away entity row is gone",
      (await prisma.entity.findUnique({ where: { id: brambleDup.id } })) === null);
    check("mentions moved to the survivor",
      (await prisma.entityMention.count({ where: { entityId: bramble.id } })) >=
        bramble.mentions + dupMentions - 1, // -1 tolerance if a chunk mentioned both
      `survivor now has ${await prisma.entityMention.count({ where: { entityId: bramble.id } })}`);
    // Both asserted "supplies" edges to Glimmer Foundry — they must collapse to one.
    const supplies = await prisma.entityEdge.count({
      where: { fromId: bramble.id, toId: foundry.id, relation: "supplies" },
    });
    check("duplicate edge collapsed on merge", supplies === 1, `got ${supplies}`);
    const after = await suggestedMerges();
    check("merged pair no longer suggested",
      after.every(
        (s) => !(s.fromId === brambleDup.id || s.intoId === brambleDup.id),
      ));

    // ── 7. Fail-soft ──
    check("mergeEntities refuses a missing entity",
      (await mergeEntities("mergeproof-nope", bramble.id)) === false);
    check("mergeEntities refuses from === into",
      (await mergeEntities(bramble.id, bramble.id)) === false);
    check("survivor untouched by refused merges",
      (await prisma.entity.findUnique({ where: { id: bramble.id } })) !== null);
  } finally {
    // ── 8. Cleanup ──
    await prisma.source.deleteMany({ where: { id: { startsWith: "mergeproof" } } });
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
