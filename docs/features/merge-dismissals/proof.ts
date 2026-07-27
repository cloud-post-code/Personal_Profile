/**
 * Primary proof for merge-dismissals (see PROOF.md).
 * Run: npx tsx docs/features/merge-dismissals/proof.ts
 *
 * Seeds throwaway entities, exercises the real suggestedMerges/dismissMerge
 * path against the local dev Postgres, asserts, and cleans up. Zero Anthropic
 * calls, zero embeddings.
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

// Containment pair (condensed "brackenvale" ⊂ "brackenvalecollective") and a
// second, unrelated containment pair as the control.
const PAIR = ["Brackenvale", "Brackenvale Collective"] as const;
const CONTROL = ["Mistwharf", "Mistwharf Harbor Trust"] as const;
const KEYS = [...PAIR, ...CONTROL].map((n) => n.toLowerCase());

type Suggested = { fromId: string; intoId: string; fromName: string; intoName: string };
const hasPair = (list: Suggested[], a: string, b: string) =>
  list.some(
    (s) =>
      (s.fromName === a && s.intoName === b) || (s.fromName === b && s.intoName === a),
  );

async function main() {
  const { prisma } = await import("../../../lib/db");
  const { suggestedMerges, dismissMerge } = await import("../../../lib/retrieval/graph");

  // ── Clean leftovers from a previous run, then take baselines ──
  await prisma.entity.deleteMany({ where: { key: { in: KEYS } } });
  await prisma.mergeDismissal.deleteMany({
    where: { OR: [{ keyA: { in: KEYS } }, { keyB: { in: KEYS } }] },
  });
  const baseEntities = await prisma.entity.count();
  const baseDismissals = await prisma.mergeDismissal.count();

  const create = async (name: string) =>
    prisma.entity.create({
      data: { name, key: name.toLowerCase(), type: "org" },
      select: { id: true },
    });

  try {
    let a = await create(PAIR[0]);
    let b = await create(PAIR[1]);
    await create(CONTROL[0]);
    await create(CONTROL[1]);

    // 1. Baseline: both containment pairs suggested.
    let sugg = await suggestedMerges();
    check("1a. seeded pair is suggested", hasPair(sugg, PAIR[0], PAIR[1]));
    check("1b. control pair is suggested", hasPair(sugg, CONTROL[0], CONTROL[1]));

    // 2. Dismissal hides the pair in both directions; control unaffected.
    const ok = await dismissMerge(a.id, b.id);
    check("2a. dismissMerge returns true", ok);
    sugg = await suggestedMerges();
    check("2b. dismissed pair no longer suggested", !hasPair(sugg, PAIR[0], PAIR[1]));
    check("2c. control pair still suggested", hasPair(sugg, CONTROL[0], CONTROL[1]));

    // 3. Idempotent + fail-soft.
    const again = await dismissMerge(b.id, a.id); // reversed direction
    const rows = await prisma.mergeDismissal.count({
      where: { OR: [{ keyA: { in: KEYS } }, { keyB: { in: KEYS } }] },
    });
    check("3a. repeat (reversed) dismissal is a no-op returning true", again && rows === 1,
      `rows=${rows}`);
    const missing = await dismissMerge(a.id, "nope-not-an-id");
    const self = await dismissMerge(a.id, a.id);
    const rowsAfter = await prisma.mergeDismissal.count({
      where: { OR: [{ keyA: { in: KEYS } }, { keyB: { in: KEYS } }] },
    });
    check("3b. missing id / self pair fail soft", !missing && !self && rowsAfter === 1,
      `missing=${missing} self=${self} rows=${rowsAfter}`);

    // 4. Survives id churn: same names, new ids, still dismissed.
    await prisma.entity.deleteMany({ where: { id: { in: [a.id, b.id] } } });
    a = await create(PAIR[0]);
    b = await create(PAIR[1]);
    sugg = await suggestedMerges();
    check("4. dismissal survives entity delete + recreate", !hasPair(sugg, PAIR[0], PAIR[1]));
  } finally {
    await prisma.entity.deleteMany({ where: { key: { in: KEYS } } });
    await prisma.mergeDismissal.deleteMany({
      where: { OR: [{ keyA: { in: KEYS } }, { keyB: { in: KEYS } }] },
    });
    const endEntities = await prisma.entity.count();
    const endDismissals = await prisma.mergeDismissal.count();
    check(
      "5. cleanup returns counts to baseline",
      endEntities === baseEntities && endDismissals === baseDismissals,
      `entities ${baseEntities}→${endEntities}, dismissals ${baseDismissals}→${endDismissals}`,
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
