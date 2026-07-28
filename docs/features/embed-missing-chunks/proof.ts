/**
 * Primary proof for embed-missing-chunks (see PROOF.md).
 * Run: npx tsx docs/features/embed-missing-chunks/proof.ts
 *
 * Offline integration pass against the local dev Postgres. The deterministic
 * local embedder is pinned, so there are zero network and zero Anthropic
 * calls. Seeds chunks under originKind "embedproof" and removes them again.
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

const KIND = "embedproof";
const SENTINEL_MODEL = "sentinel-model-v0";

const TEXTS = [
  "Thistledown Ferry crosses from Marrowgate to the Cindershoal quay each spring.",
  "The Vellum Orrery in Halloway keeps time with brass gears and one glass bead.",
  "Quillfeather Bindery reprints marginalia from the Saltmarsh archive on request.",
];

async function main() {
  const { prisma } = await import("../../../lib/db");
  const { embedMissingChunks } = await import("../../../lib/retrieval/indexer");
  const { embedTexts, vecToBytes, bytesToVec, cosine, LOCAL_EMBED_MODEL } = await import(
    "../../../lib/retrieval/embed"
  );
  const { graphStats } = await import("../../../lib/retrieval/graph");

  // Pin the deterministic local embedder AFTER imports (Prisma re-loads .env).
  delete process.env.VOYAGE_API_KEY;
  delete process.env.OPENAI_API_KEY;

  await prisma.chunk.deleteMany({ where: { originKind: KIND } }); // leftovers
  const baselineChunks = await prisma.chunk.count();
  const baselineNull = await prisma.chunk.count({ where: { embedding: null } });

  // ── Seed: three chunks with no embedding, one already embedded ──
  const pendingIds: string[] = [];
  for (let i = 0; i < TEXTS.length; i++) {
    const c = await prisma.chunk.create({
      data: {
        originKind: KIND,
        originId: "pending",
        originLabel: "Embed proof",
        seq: i,
        text: TEXTS[i],
        embedding: null,
        embedModel: null,
      },
      select: { id: true },
    });
    pendingIds.push(c.id);
  }

  const keeperText = "A copper sundial on the Ashgrove wall, unchanged since 1904.";
  const keeperVec = (await embedTexts([keeperText])).vectors[0]!;
  const keeperBytes = vecToBytes(keeperVec);
  const keeper = await prisma.chunk.create({
    data: {
      originKind: KIND,
      originId: "keeper",
      originLabel: "Embed proof",
      seq: 0,
      text: keeperText,
      embedding: keeperBytes,
      embedModel: SENTINEL_MODEL,
    },
    select: { id: true },
  });

  // ── 1 + 2. Backfill, forced across batch boundaries ──
  const res = await embedMissingChunks({ batchSize: 2 });
  check(
    "backfill attempts every null-embedding chunk",
    res.attempted === baselineNull + TEXTS.length,
    `attempted=${res.attempted} expected=${baselineNull + TEXTS.length}`,
  );
  check(
    "backfill embeds every chunk it attempted (batchSize 2 over 3 seeded)",
    res.embedded === res.attempted,
    `embedded=${res.embedded} attempted=${res.attempted}`,
  );
  check("backfill reports the current model", res.model === LOCAL_EMBED_MODEL, res.model);

  const filled = await prisma.chunk.findMany({
    where: { id: { in: pendingIds } },
    select: { id: true, text: true, embedding: true, embedModel: true },
    orderBy: { seq: "asc" },
  });
  check(
    "every seeded chunk now has a vector stamped with the current model",
    filled.length === TEXTS.length &&
      filled.every((c) => c.embedding && c.embedModel === LOCAL_EMBED_MODEL),
    filled.map((c) => `${!!c.embedding}/${c.embedModel}`).join(" "),
  );

  // ── 3. Vector fidelity: the right text, on the right row, distinctly ──
  let selfMin = 1;
  for (const c of filled) {
    const fresh = (await embedTexts([c.text])).vectors[0]!;
    selfMin = Math.min(selfMin, cosine(bytesToVec(c.embedding!), fresh));
  }
  check(
    "each stored vector is the embedding of that chunk's own text",
    selfMin > 0.999,
    `min self-cosine=${selfMin.toFixed(6)}`,
  );
  const crossPair = cosine(bytesToVec(filled[0].embedding!), bytesToVec(filled[1].embedding!));
  check(
    "different chunks get different vectors",
    crossPair < 0.999,
    `cosine=${crossPair.toFixed(6)}`,
  );

  // ── 4. An already-embedded chunk is not migrated ──
  const after = await prisma.chunk.findUnique({
    where: { id: keeper.id },
    select: { embedding: true, embedModel: true },
  });
  check("already-embedded chunk keeps its model", after?.embedModel === SENTINEL_MODEL, String(after?.embedModel));
  check(
    "already-embedded chunk keeps its exact bytes",
    !!after?.embedding &&
      Buffer.from(after.embedding).equals(Buffer.from(keeperBytes)),
  );

  // ── 5. What the Graph tab reads ──
  const stats = await graphStats();
  check(
    "graphStats reports no unembedded chunks",
    stats.chunksWithoutEmbedding === 0,
    String(stats.chunksWithoutEmbedding),
  );

  // ── 6. Second run is a no-op ──
  const again = await embedMissingChunks();
  check(
    "re-running finds nothing to do",
    again.attempted === 0 && again.embedded === 0,
    `attempted=${again.attempted} embedded=${again.embedded}`,
  );

  // ── 7. Provider failure: null vectors, reported, not thrown ──
  await prisma.chunk.update({
    where: { id: pendingIds[0] },
    data: { embedding: null, embedModel: null },
  });
  const deadEmbedder = async (texts: string[]) => ({
    vectors: texts.map(() => null),
    model: LOCAL_EMBED_MODEL,
  });
  let threw = false;
  let failRes = { attempted: -1, embedded: -1, model: "" };
  try {
    failRes = await embedMissingChunks({ embed: deadEmbedder });
  } catch {
    threw = true;
  }
  check("a failing provider does not throw", !threw);
  check(
    "a failing provider reports the gap instead of hiding it",
    failRes.attempted === 1 && failRes.embedded === 0,
    `attempted=${failRes.attempted} embedded=${failRes.embedded}`,
  );
  const stillNull = await prisma.chunk.findUnique({
    where: { id: pendingIds[0] },
    select: { embedding: true },
  });
  check("a failing provider leaves the row unembedded", stillNull?.embedding == null);

  // ── 8. Cleanup ──
  await prisma.chunk.deleteMany({ where: { originKind: KIND } });
  const endChunks = await prisma.chunk.count();
  check("seeded chunks removed", endChunks === baselineChunks, `${endChunks} vs ${baselineChunks}`);

  await prisma.$disconnect();
}

main()
  .then(() => {
    console.log(failures === 0 ? "\nALL GREEN" : `\n${failures} FAILURE(S)`);
    process.exit(failures === 0 ? 0 : 1);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
