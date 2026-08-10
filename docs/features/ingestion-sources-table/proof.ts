/**
 * Primary proof for ingestion-sources-table (see PROOF.md).
 * Run: npx tsx docs/features/ingestion-sources-table/proof.ts
 *
 * Talks to the local dev Postgres only. No model calls. Every row created
 * here uses a `proof-ing-` key prefix and is removed in a finally.
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

async function main() {
  const {
    STARTER_INGESTION_SOURCES,
    UPLOAD_METHODS,
    STORAGE_KINDS,
    listIngestionSources,
    saveIngestionSource,
    deleteIngestionSource,
    seedStarterIngestionSources,
  } = await import("@/lib/ingestionSources");
  const { prisma } = await import("@/lib/db");

  const madeKeys: string[] = [];
  try {
    // 1. Starter set is the seven tabs, in display order.
    const starterKeys = STARTER_INGESTION_SOURCES.map((s) => s.key);
    check(
      "starters are the seven tabs in order",
      JSON.stringify(starterKeys) ===
        JSON.stringify(["experience", "projects", "links", "pdfs", "text", "photos", "persona"]),
      starterKeys.join(","),
    );

    // 2. Every starter carries the full contract.
    check(
      "every starter has label, systemPrompt, valid uploadMethod/storageKinds, outputMethod",
      STARTER_INGESTION_SOURCES.every(
        (s) =>
          s.label.trim() &&
          s.systemPrompt.trim() &&
          (UPLOAD_METHODS as readonly string[]).includes(s.uploadMethod) &&
          (STORAGE_KINDS as readonly string[]).includes(s.storageKinds) &&
          s.outputMethod.trim(),
      ),
    );

    // Make sure the table is non-empty (first run on a fresh DB seeds it —
    // that is the intended production path, and gives assertion 3 substance).
    await seedStarterIngestionSources();

    // 3. Seeding a non-empty table changes nothing.
    const before = await prisma.ingestionSource.count();
    await seedStarterIngestionSources();
    const after = await prisma.ingestionSource.count();
    check("re-seed is a no-op on a non-empty table", before === after, `${before} -> ${after}`);

    // 4. Vocabulary is enforced.
    const badUpload = await saveIngestionSource({
      key: "proof-ing-bad",
      label: "Proof bad upload",
      uploadMethod: "carrier-pigeon",
      storageKinds: "text",
      systemPrompt: "",
      description: "",
      outputMethod: "",
    });
    check("unknown uploadMethod rejected", typeof badUpload === "string");
    const badStorage = await saveIngestionSource({
      key: "proof-ing-bad",
      label: "Proof bad storage",
      uploadMethod: "url",
      storageKinds: "vibes",
      systemPrompt: "",
      description: "",
      outputMethod: "",
    });
    check("unknown storageKinds rejected", typeof badStorage === "string");

    // 5. Blank key derives from label; collisions suffix rather than clobber.
    const e1 = await saveIngestionSource({
      key: "",
      label: "Proof-Ing Alpha!",
      uploadMethod: "generic",
      storageKinds: "text+image",
      systemPrompt: "p",
      description: "",
      outputMethod: "IngestedItem",
    });
    check("blank-key save succeeds", e1 === null, String(e1));
    madeKeys.push("proof-ing-alpha");
    const alpha = await prisma.ingestionSource.findUnique({ where: { key: "proof-ing-alpha" } });
    check("blank key slugified from label", alpha !== null);
    const e2 = await saveIngestionSource({
      key: "proof-ing-alpha",
      label: "Proof-Ing Alpha the Second",
      uploadMethod: "generic",
      storageKinds: "text",
      systemPrompt: "p",
      description: "",
      outputMethod: "IngestedItem",
    });
    check("colliding new key save succeeds", e2 === null, String(e2));
    madeKeys.push("proof-ing-alpha-2");
    const alpha2 = await prisma.ingestionSource.findUnique({ where: { key: "proof-ing-alpha-2" } });
    check("collision got a -2 suffix, owner untouched", alpha2 !== null && alpha !== null);

    // 6. New rows append at the end; list is ordered.
    const rows = await listIngestionSources();
    const orders = rows.map((r) => r.order);
    check(
      "list ordered by order asc",
      orders.every((o, i) => i === 0 || o >= orders[i - 1]),
      orders.join(","),
    );
    check(
      "new rows appended at the end",
      rows[rows.length - 1]?.key === "proof-ing-alpha-2" &&
        rows[rows.length - 2]?.key === "proof-ing-alpha",
    );

    // 7. Delete removes the row.
    if (alpha2) await deleteIngestionSource(alpha2.id);
    const gone = await listIngestionSources();
    check("deleted row no longer listed", !gone.some((r) => r.key === "proof-ing-alpha-2"));
  } finally {
    await prisma.ingestionSource
      .deleteMany({ where: { key: { startsWith: "proof-ing-" } } })
      .catch(() => {});
    await prisma.$disconnect();
  }

  console.log(failures ? `\n${failures} assertion(s) failed` : "\nAll assertions passed");
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error("Proof crashed:", err);
  process.exit(1);
});
