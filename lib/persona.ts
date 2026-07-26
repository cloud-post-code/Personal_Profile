import { prisma } from "./db";

/**
 * ── PERSONA · single source of truth ──────────────────────────────────
 *
 * The admin's Persona tab, the save action, and the chatbot's system prompt
 * are all generated from this catalogue.
 *
 * This used to be 21 labeled boxes drawn from two buyer-persona templates.
 * It's now one free-prose field: the templates asked for a lot of detail that
 * either isn't knowable about a real person or reads as padding in a prompt,
 * and a short true paragraph beats a long structured one. The catalogue shape
 * is kept so the storage format, the form, and the prompt stay driven from
 * one place — and so a second field can be added later without touching the
 * save path.
 */

export type PersonaSection = {
  /** Stable storage + form-field key. Never rename without a data migration. */
  key: string;
  label: string;
  /** Shown as the textarea placeholder, so the empty box says what belongs. */
  hint: string;
  rows: number;
};

/** The one-paragraph brief shown above the field in the admin. */
export const PERSONA_BLURB =
  "This is who the chatbot is, in one paragraph. Cover what you'd want a " +
  "stranger to know before talking to you: who you are and what you're " +
  "working on now, what drives you, what you're good at, how you think and " +
  "decide, what makes you skeptical, how you sound when you talk to people, " +
  "and what you're aiming at. Write it as prose in your own voice rather " +
  "than a list of traits — the text goes into the chatbot's prompt exactly " +
  "as you write it, so a short, true paragraph beats a long, padded one. " +
  "Leave it blank and the persona is left out of the prompt entirely.";

/** The storage key for the single persona field. */
const PERSONA_KEY = "persona";

export const PERSONA_SECTIONS: PersonaSection[] = [
  {
    key: PERSONA_KEY,
    label: "Persona",
    hint:
      "Who you are, what you're building, what you care about, how you work, " +
      "and how you come across — in your own words.",
    rows: 12,
  },
];

export type PersonaSections = Record<string, string>;

/**
 * The 21-section catalogue this field replaced. Kept only so persona text
 * written under the old shape folds forward into the single field the first
 * time it's read, instead of silently vanishing from the admin and the
 * prompt. Safe to delete once the live Profile row has been saved again.
 */
const LEGACY_SECTIONS: { key: string; label: string }[] = [
  { key: "core_profile", label: "Core profile" },
  { key: "context_identity", label: "Context & identity" },
  { key: "cognitive_frame", label: "Cognitive frame" },
  { key: "decision_dynamics", label: "Behavioral & decision dynamics" },
  { key: "operating_model", label: "Operating / interaction model" },
  { key: "evidence_triggers", label: "Evidence, beliefs, and triggers" },
  { key: "communication_style", label: "Communication & interaction style" },
  { key: "goals_outcomes", label: "Goals & outcomes" },
  { key: "meta_attributes", label: "Meta attributes" },
  { key: "daily_workflow", label: "Daily workflow" },
  { key: "decision_making", label: "Decision making" },
  { key: "technology_adoption", label: "Technology adoption" },
  { key: "problem_solving", label: "Problem solving" },
  { key: "communication_behavior", label: "Communication behavior" },
  { key: "stress_response", label: "Stress response" },
  { key: "purchasing_behavior", label: "Purchasing behavior" },
  { key: "change_management", label: "Change management" },
  { key: "scenarios", label: "Scenario behaviors" },
  { key: "behavioral_indicators", label: "Behavioral indicators" },
  { key: "behavioral_summary", label: "Behavioral summary" },
  { key: "notes", label: "Notes" },
];

/** Join whatever the old catalogue held into one editable block of prose. */
function foldLegacy(stored: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const { key, label } of LEGACY_SECTIONS) {
    const v = stored[key];
    if (typeof v === "string" && v.trim()) parts.push(`${label}\n${v.trim()}`);
  }
  return parts.join("\n\n");
}

/**
 * Parse the stored JSON map into a complete `key -> text` map: every catalogue
 * key is present (missing ones as ""), and anything stored under a key that's
 * no longer in the catalogue is dropped. Malformed JSON reads as all-empty so
 * a bad row can never break the admin or the chat prompt.
 */
export function safePersonaSections(raw: string | null | undefined): PersonaSections {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw || "{}");
  } catch {
    parsed = {};
  }
  const stored =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};

  const out: PersonaSections = {};
  for (const s of PERSONA_SECTIONS) {
    const v = stored[s.key];
    out[s.key] = typeof v === "string" ? v : "";
  }
  // Nothing in the new field yet — carry the old sections forward.
  if (!out[PERSONA_KEY].trim()) out[PERSONA_KEY] = foldLegacy(stored);
  return out;
}

/** Persist the section map, keeping only catalogue keys and trimmed text. */
export async function writePersonaSections(sections: PersonaSections): Promise<void> {
  const clean: PersonaSections = {};
  for (const s of PERSONA_SECTIONS) {
    const v = (sections[s.key] ?? "").trim();
    if (v) clean[s.key] = v;
  }
  await prisma.profile.update({
    where: { id: 1 },
    data: { personaSections: JSON.stringify(clean) },
  });
}

/**
 * Render the persona for the chatbot's system prompt. An empty persona renders
 * as "" so the caller can fall back — a bare heading the model then tries to
 * honor is worse than no heading at all.
 */
export function personaPromptBlock(raw: string | null | undefined): string {
  const sections = safePersonaSections(raw);
  const filled = PERSONA_SECTIONS.filter((s) => sections[s.key]?.trim());
  if (!filled.length) return "";
  // A single field is the block itself; several would each need a heading.
  if (PERSONA_SECTIONS.length === 1) return sections[filled[0].key].trim();
  return filled.map((s) => `### ${s.label}\n${sections[s.key].trim()}`).join("\n\n");
}
