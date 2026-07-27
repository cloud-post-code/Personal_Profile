import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * The persona-extraction prompt Blake copies into ChatGPT, Claude or Gemini to
 * have it write his persona from everything it already knows about him.
 *
 * It lives as a Markdown file rather than a string in here so it can be edited
 * as prose — it IS a document, and a 900-line template literal would have to
 * escape every backtick it contains. Read once at module load: it ships with
 * the app and never changes at runtime, so re-reading per request would buy
 * nothing.
 */

const PROMPT_PATH = path.join(process.cwd(), "docs", "prompts", "persona-extraction.md");

let cached: string | null = null;

/**
 * The prompt text. Throws if the file is missing rather than serving an empty
 * box — a Copy button that silently copies nothing is worse than a visible
 * failure, and the proof asserts this file is readable.
 */
export function personaExtractionPrompt(): string {
  if (cached !== null) return cached;
  const text = readFileSync(PROMPT_PATH, "utf8").trim();
  if (!text) throw new Error(`Persona prompt at ${PROMPT_PATH} is empty`);
  cached = text;
  return cached;
}
