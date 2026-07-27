/**
 * Backfill the retrieval index for existing knowledge sources.
 *   npx tsx scripts/reindex.ts          -> index scanned sources with no chunks
 *   npx tsx scripts/reindex.ts --all    -> re-index every scanned source
 *
 * Each source gets chunked + embedded + entity-extracted (one Claude call per
 * source), same as inline ingestion does for new sources.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

// Load .env (tsx doesn't); never override values already set.
const root = path.resolve(__dirname, "..");
for (const line of readFileSync(path.join(root, ".env"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) {
    process.env[m[1]] = m[2].trim().replace(/^(["'])(.*)\1$/, "$2");
  }
}

async function main() {
  const { prisma } = await import("../lib/db");
  const { indexSource } = await import("../lib/retrieval/indexer");
  const { indexEverything } = await import("../lib/retrieval/origins");

  const all = process.argv.includes("--all");

  // --all also rebuilds the non-Source origins (profile, persona, projects,
  // photos, approved answers); the default pass only fills in unindexed sources.
  if (all) {
    const n = await indexEverything({
      onProgress: (label) => console.log(`  indexed  ${label}`),
    });
    console.log(`${n} non-source origin(s) indexed`);
  }
  const sources = await prisma.source.findMany({
    where: all
      ? { status: "scanned" }
      : { status: "scanned", chunks: { none: {} } },
    select: { id: true, title: true, url: true, filename: true },
    orderBy: { createdAt: "asc" },
  });

  console.log(`${sources.length} source(s) to index${all ? " (--all)" : ""}`);
  const pace = Number(process.env.EMBED_PACE_MS ?? 21_000);
  let ok = 0;
  for (const s of sources) {
    const label = s.title ?? s.url ?? s.filename ?? s.id;
    try {
      // Same per-minute-limit pacing as indexEverything.
      if (ok > 0 && pace > 0) await new Promise((r) => setTimeout(r, pace));
      await indexSource(s.id);
      ok++;
      console.log(`  indexed  ${label}`);
    } catch (e) {
      console.error(`  FAILED   ${label}: ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`Done: ${ok}/${sources.length} indexed`);
  // --all finishes by rebuilding the neighborhood overviews: the graph the
  // clusters are computed from has just been rewritten. One Claude call per
  // cluster (max 6), same spend profile as the Graph tab's Rebuild button.
  if (all) {
    const { buildClusterOverviews } = await import("../lib/retrieval/clusters");
    try {
      const n = await buildClusterOverviews();
      console.log(`${n} overview(s) rebuilt`);
    } catch (e) {
      console.error(`overview rebuild FAILED: ${e instanceof Error ? e.message : e}`);
    }
  }

  await prisma.$disconnect();
  if (ok < sources.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
