/**
 * Primary proof for known-entities-in-extraction (see PROOF.md).
 * Run: npx tsx docs/features/known-entities-in-extraction/proof.ts
 *
 * Seeds throwaway sources (ids prefixed "knownproof"), exercises the real
 * indexSource → indexOrigin → extractor path with a capturing stub against the
 * local dev Postgres, asserts, and cleans up. Zero Anthropic calls.
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

/** One ~1200-char paragraph so each becomes roughly one chunk. */
function para(lead: string, n: number): string {
  const filler =
    "This paragraph covers workshop notes, build logs, and small lessons " +
    "learned while iterating on the rig over several weekends. ";
  return `${lead} appears here in paragraph ${n}. ${filler.repeat(10)}`;
}

const KEYS = ["kelpgrove studio", "thistledown press"];

async function main() {
  const { prisma } = await import("../../../lib/db");
  const { indexSource } = await import("../../../lib/retrieval/indexer");
  const { buildExtractionPrompt, MAX_KNOWN_IN_PROMPT } = await import(
    "../../../lib/retrieval/entities"
  );

  // ── Prompt builder (pure, no DB) ──
  const bare = buildExtractionPrompt("Some text.", "A title", []);
  check("1. no known-entities block when list is empty", !bare.includes("already in the graph"));

  const withKnown = buildExtractionPrompt("Some text.", "A title", [
    "Kelpgrove Studio",
    "Next.js",
  ]);
  check(
    "2a. known names appear verbatim",
    withKnown.includes("Kelpgrove Studio") && withKnown.includes("Next.js"),
  );
  check(
    "2b. reuse instruction present",
    withKnown.includes("already in the graph") && withKnown.includes("exact name"),
  );

  const many = Array.from({ length: 250 }, (_, i) => `Entity Number ${i + 1}`);
  const capped = buildExtractionPrompt("Some text.", null, many);
  check(
    `3. block caps at ${MAX_KNOWN_IN_PROMPT} names`,
    capped.includes(`Entity Number ${MAX_KNOWN_IN_PROMPT}`) &&
      !capped.includes(`Entity Number ${MAX_KNOWN_IN_PROMPT + 1}`),
    "cap not applied where expected",
  );

  // ── Indexer integration ──
  await prisma.source.deleteMany({ where: { id: { startsWith: "knownproof" } } });
  await prisma.entity.deleteMany({ where: { key: { in: KEYS } } });
  const baseChunks = await prisma.chunk.count();
  const baseEntities = await prisma.entity.count();

  try {
    // src1: "Kelpgrove Studio" in every paragraph (many chunk mentions),
    // "Thistledown Press" only in the last one (few).
    const src1Text = [
      para("Kelpgrove Studio", 1),
      para("Kelpgrove Studio", 2),
      para("Kelpgrove Studio", 3),
      para("Kelpgrove Studio and Thistledown Press", 4),
    ].join("\n\n");

    await prisma.source.create({
      data: {
        id: "knownproof-src1", type: "text", title: "Kelpgrove notes",
        rawText: src1Text, summary: "Notes.", status: "scanned",
      },
    });

    let known1: string[] | undefined;
    await indexSource("knownproof-src1", {
      extract: async (_text, _title, known) => {
        known1 = known;
        return {
          entities: [
            { name: "Kelpgrove Studio", type: "org" },
            { name: "Thistledown Press", type: "org" },
          ],
          edges: [],
        };
      },
    });

    check(
      "6a. first ingest: known list is an array without the not-yet-created names",
      Array.isArray(known1) && !known1!.includes("Kelpgrove Studio"),
      `got ${JSON.stringify(known1)?.slice(0, 120)}`,
    );
    const src1Chunks = await prisma.chunk.count({
      where: { originKind: "source", originId: "knownproof-src1" },
    });
    check("6b. chunks written for src1", src1Chunks > 1, `chunks=${src1Chunks}`);

    // Premise for the ordering assertion: Kelpgrove really has more mentions.
    const [kelp, thistle] = await Promise.all(
      KEYS.map((key) =>
        prisma.entity.findUnique({
          where: { key },
          include: { _count: { select: { mentions: true } } },
        }),
      ),
    );
    check(
      "5a. premise: Kelpgrove has more chunk mentions than Thistledown",
      !!kelp && !!thistle && kelp._count.mentions > thistle._count.mentions,
      `kelp=${kelp?._count.mentions} thistle=${thistle?._count.mentions}`,
    );

    // src2: capture what a later ingest is told.
    await prisma.source.create({
      data: {
        id: "knownproof-src2", type: "text", title: "Later notes",
        rawText: para("A later source", 1), summary: "Later.", status: "scanned",
      },
    });

    let known2: string[] | undefined;
    await indexSource("knownproof-src2", {
      extract: async (_text, _title, known) => {
        known2 = known;
        return { entities: [], edges: [] };
      },
    });

    check(
      "4. later ingest receives existing entity names",
      !!known2 && known2.includes("Kelpgrove Studio") && known2.includes("Thistledown Press"),
      `got ${JSON.stringify(known2)?.slice(0, 200)}`,
    );
    check(
      "5b. more-mentioned entity ordered first",
      !!known2 &&
        known2.indexOf("Kelpgrove Studio") !== -1 &&
        known2.indexOf("Kelpgrove Studio") < known2.indexOf("Thistledown Press"),
      `kelp@${known2?.indexOf("Kelpgrove Studio")} thistle@${known2?.indexOf("Thistledown Press")}`,
    );
  } finally {
    await prisma.source.deleteMany({ where: { id: { startsWith: "knownproof" } } });
    await prisma.entity.deleteMany({ where: { key: { in: KEYS } } });
    const endChunks = await prisma.chunk.count();
    const endEntities = await prisma.entity.count();
    check(
      "7. cleanup returns counts to baseline",
      endChunks === baseChunks && endEntities === baseEntities,
      `chunks ${baseChunks}→${endChunks}, entities ${baseEntities}→${endEntities}`,
    );
    await prisma.$disconnect();
  }

  if (failures) {
    console.error(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log("\nAll assertions passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
