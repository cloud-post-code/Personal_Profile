/**
 * Primary proof for graph-delete-provenance (see PROOF.md).
 * Run: npx tsx docs/features/graph-delete-provenance/proof.ts
 *
 * Seeds a throwaway source and project (ids prefixed "gdpproof") whose extracted
 * graphs deliberately overlap, then drives the real indexing / dropOrigin /
 * retrieval path against the local dev Postgres and asserts that deleting an
 * origin retracts exactly its own claims. Entity extraction is stubbed so the
 * proof doesn't depend on live Claude.
 *
 * Cleanup is scoped by the "gdpproof" id prefix and by entity key — never by
 * originKind, which would delete the developer's real indexed content and make
 * the baseline assertion pass vacuously.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../../..");
for (const line of readFileSync(path.join(root, ".env"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) {
    process.env[m[1]] = m[2].trim().replace(/^(["'])(.*)\1$/, "$2");
  }
}

let failures = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) console.log(`  PASS  ${name}`);
  else {
    failures++;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function para(marker: string, n: number): string {
  const filler =
    "Some additional context follows here describing the work, the people " +
    "involved, and what was learned along the way over several months. ";
  return `${marker} appears in paragraph ${n}. ${filler.repeat(5)}`;
}

const SOURCE_TEXT = [1, 2]
  .map((n) => para("Riverbend Collective and the Halcyon Index", n))
  .join("\n\n");
const PROJECT_DETAIL = para("Riverbend Collective partnership", 1);

const SOURCE_TITLE = "Riverbend writeup";
const PROJECT_LABEL = "Project: Gdpproof Renderer";

/**
 * Every entity this proof creates must be one the real graph would never hold.
 * `cleanup()` deletes these keys, and deleting an Entity cascades its edges and
 * mentions — so naming a real node here (e.g. "Blake") would silently destroy
 * the developer's graph and make the baseline assertions pass vacuously.
 */
const KEYS = {
  riverbend: "riverbend collective",
  halcyon: "halcyon index",
  anchor: "marrowgate partners",
  // Used only by the merge scenario at the end.
  kestrel: "kestrel group",
  thistledown: "thistledown labs",
  ashgrove: "ashgrove trust",
};

/** Second source, seeded only for the entity-merge scenario. */
const MERGE_TITLE = "Kestrel writeup";
const MERGE_TEXT = [1, 2]
  .map((n) => para("Kestrel Group, Thistledown Labs and Ashgrove Trust", n))
  .join("\n\n");

/** Lowercase on purpose — `retrieve()` seeds on `query.toLowerCase()`. */
const QUERY = "what is the halcyon index";

const SHARED_RELATION = "works with";
const SOLE_RELATION = "built";
const MANUAL_RELATION = "collaborates with";

async function main() {
  const { prisma } = await import("../../../lib/db");
  const { indexSource, dropOrigin } = await import("../../../lib/retrieval/indexer");
  const { indexProject } = await import("../../../lib/retrieval/origins");
  const { addEdge } = await import("../../../lib/retrieval/graph");
  const { retrieve } = await import("../../../lib/retrieval/search");

  /**
   * Branch on the origin label so the two origins assert an OVERLAPPING graph:
   *   source  -> Riverbend built Halcyon Index      (sole owner)
   *              Marrowgate works with Riverbend    (co-owner)
   *   project -> Marrowgate works with Riverbend    (co-owner)
   * Everything else in the pipeline runs for real.
   */
  const stub = {
    extract: async (_text: string, title: string | null) => {
      if (title === MERGE_TITLE) {
        // A --advises--> B, plus a third entity C to merge A into, so the edge
        // gets rewired onto a new row rather than collapsing to a self-loop.
        return {
          entities: [
            { name: "Kestrel Group", type: "org" },
            { name: "Thistledown Labs", type: "org" },
            { name: "Ashgrove Trust", type: "org" },
          ],
          edges: [{ from: "Kestrel Group", to: "Thistledown Labs", relation: "advises" }],
        };
      }
      if (title === PROJECT_LABEL) {
        return {
          entities: [{ name: "Riverbend Collective", type: "org" }],
          edges: [
            { from: "Marrowgate Partners", to: "Riverbend Collective", relation: SHARED_RELATION },
          ],
        };
      }
      return {
        entities: [
          { name: "Riverbend Collective", type: "org" },
          { name: "Halcyon Index", type: "project" },
        ],
        edges: [
          { from: "Riverbend Collective", to: "Halcyon Index", relation: SOLE_RELATION },
          { from: "Marrowgate Partners", to: "Riverbend Collective", relation: SHARED_RELATION },
        ],
      };
    },
  };

  const entityByKey = (key: string) => prisma.entity.findUnique({ where: { key } });

  /** Does a relation between two entity keys exist right now? */
  async function edgeExists(fromKey: string, toKey: string, relation: string) {
    const [from, to] = await Promise.all([entityByKey(fromKey), entityByKey(toKey)]);
    if (!from || !to) return false;
    const row = await prisma.entityEdge.findUnique({
      where: { fromId_toId_relation: { fromId: from.id, toId: to.id, relation } },
    });
    return !!row;
  }

  const baseChunks = await prisma.chunk.count();
  const baseEntities = await prisma.entity.count();
  const baseEdges = await prisma.entityEdge.count();
  const baseMentions = await prisma.entityMention.count();

  const cleanup = async () => {
    // Scoped by id prefix / key — never by originKind (see file header).
    await prisma.source.deleteMany({ where: { id: { startsWith: "gdpproof" } } });
    await prisma.project.deleteMany({ where: { id: { startsWith: "gdpproof" } } });
    await prisma.chunk.deleteMany({ where: { originId: { startsWith: "gdpproof" } } });
    await prisma.entity.deleteMany({ where: { key: { in: Object.values(KEYS) } } });
  };

  await cleanup();

  try {
    // ── Seed ──
    await prisma.source.create({
      data: {
        id: "gdpproof-src", type: "text", title: SOURCE_TITLE,
        rawText: SOURCE_TEXT, summary: "About Riverbend.", status: "scanned",
      },
    });
    await prisma.project.create({
      data: {
        id: "gdpproof-proj", name: "Gdpproof Renderer", blurb: "A renderer.",
        detail: PROJECT_DETAIL, tags: "[]",
      },
    });

    await indexSource("gdpproof-src", stub);
    await indexProject("gdpproof-proj", stub);

    // ── 1. Both origins index, shared entity is one row across both ──
    const srcChunks = await prisma.chunk.count({ where: { originId: "gdpproof-src" } });
    const projChunks = await prisma.chunk.count({ where: { originId: "gdpproof-proj" } });
    check("source and project both indexed", srcChunks > 0 && projChunks > 0,
      `src=${srcChunks} proj=${projChunks}`);

    const shared = await prisma.entity.findUnique({
      where: { key: KEYS.riverbend },
      include: { mentions: { select: { chunk: { select: { originKind: true } } } } },
    });
    const kinds = new Set(shared?.mentions.map((m) => m.chunk.originKind) ?? []);
    check("shared entity is one row spanning both origins",
      !!shared && kinds.size >= 2, `kinds: ${JSON.stringify([...kinds])}`);

    // ── 2. The sole-origin entity exists while its origin does ──
    check("sole-origin entity present", !!(await entityByKey(KEYS.halcyon)));

    // ── 3. A hand-added relation is accepted ──
    const riverbend = await entityByKey(KEYS.riverbend);
    const anchor = await entityByKey(KEYS.anchor);
    const added = riverbend && anchor
      ? await addEdge(riverbend.id, anchor.id, MANUAL_RELATION)
      : false;
    check("hand-added relation accepted", added);

    // The leak this feature closes, characterized deterministically.
    //
    // `retrieve()` seeds ANY entity whose key appears in the raw query and
    // renders that entity's edges into the prompt as KNOWN RELATIONSHIPS — it
    // never checks whether a chunk still supports them. Asserting on the
    // rendered output instead would be ranking-dependent: search.ts caps
    // relations at 12, so a populated graph can crowd the leaked line out.
    const halcyon = await entityByKey(KEYS.halcyon);
    check("deleted-claim entity is seedable straight from the query",
      !!halcyon && QUERY.includes(halcyon.key), halcyon?.key);
    check("an extracted relation references it",
      await edgeExists(KEYS.riverbend, KEYS.halcyon, SOLE_RELATION));

    // ── 4. Re-indexing one origin preserves the shared relation ──
    await indexProject("gdpproof-proj", stub);
    check("re-index keeps the shared relation",
      await edgeExists(KEYS.anchor, KEYS.riverbend, SHARED_RELATION));

    // ── 5-6. Dropping ONE owner keeps the co-owned relation and entity ──
    await dropOrigin("project", "gdpproof-proj");
    check("co-owned relation survives losing one owner",
      await edgeExists(KEYS.anchor, KEYS.riverbend, SHARED_RELATION));
    check("co-owned entity survives losing one owner",
      !!(await entityByKey(KEYS.riverbend)));

    // ── 7-8. Dropping the LAST owner retracts its claims ──
    await dropOrigin("source", "gdpproof-src");
    check("co-owned relation is removed once its last owner is gone",
      !(await edgeExists(KEYS.anchor, KEYS.riverbend, SHARED_RELATION)));
    check("sole-origin relation is removed",
      !(await edgeExists(KEYS.riverbend, KEYS.halcyon, SOLE_RELATION)));
    check("sole-origin entity is removed", !(await entityByKey(KEYS.halcyon)));

    // ── 9-10. Hand-added relation and its endpoints survive ──
    check("hand-added relation survives both deletes",
      await edgeExists(KEYS.riverbend, KEYS.anchor, MANUAL_RELATION));
    check("endpoints of a surviving relation are kept",
      !!(await entityByKey(KEYS.riverbend)) && !!(await entityByKey(KEYS.anchor)));

    // ── 11. Retrieval no longer cites the deleted claim ──
    const afterRetrieval = await retrieve(QUERY);
    check("retrieval stops citing the deleted claim",
      !afterRetrieval.relations.some((r) => /halcyon/i.test(r)),
      JSON.stringify(afterRetrieval.relations));

    // ── 13. Merging an entity carries ownership onto the rewired relation ──
    // Renaming an entity onto an existing name merges the two and REWIRES its
    // edges onto new rows. Ownership has to travel with them, or the origin
    // that asserted the relation can no longer retract it and the claim
    // outlives its source — the exact bug this feature fixes.
    const { renameEntity } = await import("../../../lib/retrieval/graph");
    await prisma.source.create({
      data: {
        id: "gdpproof-src2", type: "text", title: MERGE_TITLE,
        rawText: MERGE_TEXT, summary: "About Kestrel.", status: "scanned",
      },
    });
    await indexSource("gdpproof-src2", stub);

    const kestrel = await entityByKey(KEYS.kestrel);
    check("merge scenario indexed",
      !!kestrel && (await edgeExists(KEYS.kestrel, KEYS.thistledown, "advises")));

    if (kestrel) await renameEntity(kestrel.id, "Ashgrove Trust", "org");
    check("merge rewired the relation onto the surviving entity",
      await edgeExists(KEYS.ashgrove, KEYS.thistledown, "advises"));

    await dropOrigin("source", "gdpproof-src2");
    check("deleting the origin still retracts the REWIRED relation",
      !(await edgeExists(KEYS.ashgrove, KEYS.thistledown, "advises")));
  } finally {
    await cleanup();
    // ── 12. Baseline restored ──
    check("chunks cleaned up", (await prisma.chunk.count()) === baseChunks,
      `${baseChunks} -> ${await prisma.chunk.count()}`);
    check("entities cleaned up", (await prisma.entity.count()) === baseEntities,
      `${baseEntities} -> ${await prisma.entity.count()}`);
    check("edges cleaned up", (await prisma.entityEdge.count()) === baseEdges,
      `${baseEdges} -> ${await prisma.entityEdge.count()}`);
    check("mentions cleaned up", (await prisma.entityMention.count()) === baseMentions,
      `${baseMentions} -> ${await prisma.entityMention.count()}`);
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
