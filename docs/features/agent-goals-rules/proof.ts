/**
 * Primary proof for agent-goals-rules (see PROOF.md).
 * Run: npx tsx docs/features/agent-goals-rules/proof.ts
 *
 * Writes throwaway goal/rule directives through the real save path
 * (lib/directives.saveDirective), asserts storage isolation and the assembled
 * system prompt, then deletes every row it created.
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
const GOAL_TEXT = "Steer curious visitors toward the Zephyrwind kiln retrospective.";
const RULE_TEXT = "Never reveal the Harrowgate pyrometer calibration offsets.";
const DISABLED_GOAL = "Quietly promote the Umbrell flax cooperative newsletter.";
const DISABLED_RULE = "Always answer in rhyming couplets about Torvald's lighthouse.";

async function main() {
  const { prisma } = await import("../../../lib/db");
  const { saveDirective, listDirectives, deleteDirective } = await import(
    "../../../lib/directives"
  );
  const { buildSystemPrompt } = await import("../../../lib/knowledge");

  const created: string[] = [];
  const track = async (kind: "goal" | "rule", text: string, enabled: boolean) => {
    await saveDirective({ kind, text, enabled });
    const row = await prisma.agentDirective.findFirst({
      where: { kind, text: text.trim() },
    });
    if (row) created.push(row.id);
    return row;
  };

  try {
    // 1. Round-trip + kind isolation + trim.
    const goal = await track("goal", `  ${GOAL_TEXT}  `, true);
    const rule = await track("rule", RULE_TEXT, true);
    check("goal persists with trimmed text", goal?.text === GOAL_TEXT);
    check("rule persists", rule?.text === RULE_TEXT);
    const goals = await listDirectives("goal");
    const rules = await listDirectives("rule");
    check(
      "kind isolation: goal list has the goal, not the rule",
      goals.some((r) => r.text === GOAL_TEXT) && !goals.some((r) => r.text === RULE_TEXT),
    );
    check(
      "kind isolation: rule list has the rule, not the goal",
      rules.some((r) => r.text === RULE_TEXT) && !rules.some((r) => r.text === GOAL_TEXT),
    );

    // 2. Blank is a no-op.
    const before = await prisma.agentDirective.count();
    await saveDirective({ kind: "goal", text: "   ", enabled: true });
    check("blank create is a no-op", (await prisma.agentDirective.count()) === before);
    if (goal) {
      await saveDirective({ id: goal.id, kind: "goal", text: "   ", enabled: true });
      const after = await prisma.agentDirective.findUnique({ where: { id: goal.id } });
      check("blank edit leaves text unchanged", after?.text === GOAL_TEXT);
    }

    // 3. Update + toggle through the save path.
    const disGoal = await track("goal", DISABLED_GOAL, true);
    if (disGoal) {
      await saveDirective({ id: disGoal.id, kind: "goal", text: DISABLED_GOAL, enabled: false });
      const after = await prisma.agentDirective.findUnique({ where: { id: disGoal.id } });
      check("save with id toggles enabled off", after?.enabled === false);
    } else {
      check("save with id toggles enabled off", false, "setup row missing");
    }
    await track("rule", DISABLED_RULE, false);

    // 4–6. Prompt render.
    const prompt = await buildSystemPrompt();
    const goalsIdx = prompt.indexOf("GOALS");
    const rulesIdx = prompt.indexOf("RULES:");
    check("prompt has a GOALS heading", goalsIdx >= 0);
    check("GOALS section comes before RULES", goalsIdx >= 0 && rulesIdx > goalsIdx);
    check("enabled goal text is in the prompt", prompt.includes(`- ${GOAL_TEXT}`));
    check(
      "enabled rule is inside the RULES section",
      rulesIdx >= 0 && prompt.indexOf(`- ${RULE_TEXT}`) > rulesIdx,
    );
    check(
      "built-in rules survive",
      prompt.includes("Never invent projects, jobs, dates, or credentials."),
    );
    check("disabled goal is invisible", !prompt.includes(DISABLED_GOAL));
    check("disabled rule is invisible", !prompt.includes(DISABLED_RULE));

    // 7. Empty state: disable our goal (and there may be no others) — the
    // heading must vanish only if NO enabled goals remain, so scope the check.
    for (const id of created) {
      await prisma.agentDirective.update({ where: { id }, data: { enabled: false } });
    }
    const remaining = await prisma.agentDirective.count({
      where: { kind: "goal", enabled: true },
    });
    if (remaining === 0) {
      const emptyPrompt = await buildSystemPrompt();
      check("no enabled goals -> no GOALS heading", !emptyPrompt.includes("GOALS"));
    } else {
      console.log("  SKIP  empty-state check (pre-existing enabled goals present)");
    }
  } finally {
    // 8. Cleanup.
    for (const id of created) {
      await deleteDirective(id).catch(() => {});
    }
    const { prisma } = await import("../../../lib/db");
    const leftover = await prisma.agentDirective.count({
      where: { text: { in: [GOAL_TEXT, RULE_TEXT, DISABLED_GOAL, DISABLED_RULE] } },
    });
    check("cleanup: proof rows deleted", leftover === 0);
    await prisma.$disconnect();
  }

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll assertions passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
