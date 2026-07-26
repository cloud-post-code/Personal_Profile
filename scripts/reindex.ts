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

  const all = process.argv.includes("--all");
  const sources = await prisma.source.findMany({
    where: all
      ? { status: "scanned" }
      : { status: "scanned", chunks: { none: {} } },
    select: { id: true, title: true, url: true, filename: true },
    orderBy: { createdAt: "asc" },
  });

  console.log(`${sources.length} source(s) to index${all ? " (--all)" : ""}`);
  let ok = 0;
  for (const s of sources) {
    const label = s.title ?? s.url ?? s.filename ?? s.id;
    try {
      await indexSource(s.id);
      ok++;
      console.log(`  indexed  ${label}`);
    } catch (e) {
      console.error(`  FAILED   ${label}: ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`Done: ${ok}/${sources.length} indexed`);
  await prisma.$disconnect();
  if (ok < sources.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
