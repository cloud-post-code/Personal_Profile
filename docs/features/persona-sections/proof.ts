/**
 * Primary proof for persona-sections (see PROOF.md).
 * Run: npx tsx docs/features/persona-sections/proof.ts
 *
 * Snapshots the real Profile row, writes throwaway section text through the
 * real save path (lib/persona.writePersonaSections), asserts the catalogue,
 * the round-trip, and the assembled system prompt, then restores the snapshot.
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

// Distinctive strings so a match in the prompt can only come from this proof.
const CORE_TEXT = "Role: Zephyrwind kiln operator, archetype The Quiet Tinkerer.";
const STRESS_TEXT = "Under pressure they shorten the firing cycle and ask Harrowgate for help.";

async function main() {
  const { prisma, getProfile } = await import("../../../lib/db");
  const {
    PERSONA_GROUPS,
    PERSONA_SECTIONS,
    safePersonaSections,
    writePersonaSections,
  } = await import("../../../lib/persona");
  const { buildSystemPrompt } = await import("../../../lib/knowledge");

  const before = await getProfile();
  const snapshot = before.personaSections;

  try {
    // 1 ── Catalogue integrity.
    const groupKeys = PERSONA_GROUPS.map((g) => g.key);
    const keys = PERSONA_SECTIONS.map((s) => s.key);
    check("catalogue covers both templates", groupKeys.join(",") === "persona,behaviors", groupKeys.join(","));
    check("section keys are unique", new Set(keys).size === keys.length);
    check(
      "section keys are form-safe",
      keys.every((k) => /^[a-z0-9_]+$/.test(k)),
      keys.filter((k) => !/^[a-z0-9_]+$/.test(k)).join(","),
    );
    check(
      "flattened catalogue matches the groups",
      keys.length === PERSONA_GROUPS.reduce((n, g) => n + g.sections.length, 0),
    );
    check(
      "every section has a label, hint, and size",
      PERSONA_SECTIONS.every((s) => !!s.label && !!s.hint && s.rows > 0),
    );

    // 2 ── Round-trip through the real save path.
    await writePersonaSections({
      core_profile: CORE_TEXT,
      stress_response: STRESS_TEXT,
      not_a_section: "should be dropped",
    });
    const stored = safePersonaSections((await getProfile()).personaSections);
    check("filled sections round-trip", stored.core_profile === CORE_TEXT && stored.stress_response === STRESS_TEXT);
    check("unfilled sections read as empty", stored.goals_outcomes === "" && stored.notes === "");
    check("every catalogue key is present", keys.every((k) => k in stored));
    check("unknown keys are dropped", !("not_a_section" in stored));

    // 3 ── Malformed storage never throws.
    for (const bad of ["", "not json", "[1,2]", "null"]) {
      const m = safePersonaSections(bad);
      check(
        `malformed storage (${JSON.stringify(bad)}) reads all-empty`,
        Object.keys(m).length === keys.length && Object.values(m).every((v) => v === ""),
      );
    }

    // 4 ── Prompt render.
    const prompt = await buildSystemPrompt();
    const core = PERSONA_SECTIONS.find((s) => s.key === "core_profile")!;
    const stress = PERSONA_SECTIONS.find((s) => s.key === "stress_response")!;
    check("prompt carries the filled section text", prompt.includes(CORE_TEXT) && prompt.includes(STRESS_TEXT));
    check(
      "prompt labels the filled sections",
      prompt.includes(`### ${core.label}`) && prompt.includes(`### ${stress.label}`),
    );
    check("prompt groups the sections", prompt.includes("## Persona") && prompt.includes("## Agent behaviors"));

    // 5 ── Empty sections omitted; the retired heading is gone.
    const leaked = PERSONA_SECTIONS.filter(
      (s) => !stored[s.key] && prompt.includes(`### ${s.label}`),
    ).map((s) => s.key);
    check("empty sections are omitted from the prompt", leaked.length === 0, leaked.join(","));
    check("retired VOICE & WORLDVIEW block is gone", !prompt.includes("VOICE & WORLDVIEW"));
  } finally {
    // 6 ── Restore.
    await prisma.profile.update({ where: { id: 1 }, data: { personaSections: snapshot } });
    const restored = (await getProfile()).personaSections;
    check("profile restored to its pre-proof state", restored === snapshot);
    await prisma.$disconnect();
  }

  console.log(failures ? `\n${failures} check(s) failed.` : "\nAll checks passed.");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
