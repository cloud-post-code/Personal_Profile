/**
 * Primary proof for persona-prompt-handoff (see PROOF.md).
 * Run: npx tsx docs/features/persona-prompt-handoff/proof.ts
 *
 * Renders the real Persona-tab block with react-dom/server and asserts what the
 * admin actually sees, plus the contract of the loader that feeds it. No
 * database, no network, no browser: the block is a pure function of the prompt
 * file, so rendering it is the honest test.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

const root = path.resolve(__dirname, "../../..");
process.chdir(root); // personaPrompt.ts resolves against process.cwd()

let failures = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) console.log(`  PASS  ${name}`);
  else {
    failures++;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const PROMPT_FILE = path.join(root, "docs/prompts/persona-extraction.md");
/** A line from deep inside the prompt — proves the WHOLE file is served. */
const DEEP_MARKER = "Choose exactly three words that describe me";

async function main() {
  const { personaExtractionPrompt } = await import("../../../lib/personaPrompt");
  const { PersonaPrompt } = await import("../../../app/admin/PersonaPrompt");

  // ── 1. The prompt file is present and is the document we expect ──
  const raw = readFileSync(PROMPT_FILE, "utf8");
  check("prompt file is non-empty", raw.trim().length > 1000, `${raw.length} chars`);
  check("prompt file is the extraction prompt",
    raw.trimStart().startsWith("# Personal Persona Extraction Prompt"));
  check("prompt file carries its later sections too", raw.includes(DEEP_MARKER));

  // ── 2. The loader serves exactly that file ──
  const prompt = personaExtractionPrompt();
  check("loader serves the file verbatim (trimmed)", prompt === raw.trim());
  check("loader caches rather than re-reading", personaExtractionPrompt() === prompt);

  // ── 3. The collapsed block: explanation + both buttons, prompt hidden ──
  const collapsed = renderToStaticMarkup(React.createElement(PersonaPrompt, { prompt }));
  check("explains where to paste the prompt",
    /ChatGPT, Claude or Gemini/.test(collapsed));
  check("tells you to paste the answer back into the Persona field",
    /paste its answer straight into the\s+Persona field/i.test(collapsed.replace(/\s+/g, " ")));
  check("offers a copy button", collapsed.includes("Copy prompt"));
  check("offers a view button", collapsed.includes("View prompt"));
  check("prompt body is NOT shown until View is pressed",
    !collapsed.includes(DEEP_MARKER),
    "the whole prompt rendered while collapsed");

  // ── 4. Nothing about this block reaches the network ──
  const source = readFileSync(path.join(root, "app/admin/PersonaPrompt.tsx"), "utf8");
  check("the block makes no network calls",
    !/\bfetch\(|XMLHttpRequest|axios/.test(source));

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
