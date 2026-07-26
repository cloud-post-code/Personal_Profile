import { prisma } from "./db";

/**
 * ── PERSONA SECTIONS · single source of truth ─────────────────────────
 *
 * The admin's Persona tab, the save action, and the chatbot's system prompt
 * are all generated from this catalogue. Each section is one labeled textarea
 * in the admin and one labeled block in the prompt.
 *
 * Two groups, mirroring the two templates this was built from:
 *   persona   — High-Fidelity Persona Template (who the persona is)
 *   behaviors — Agent Behaviors Template (how the persona behaves)
 *
 * `hint` is the template's own sub-prompts; it's shown as the textarea
 * placeholder so the box tells you what belongs in it.
 *
 * To add a section: add it here. Nothing else needs to change.
 */

export type PersonaSection = {
  /** Stable storage + form-field key. Never rename without a data migration. */
  key: string;
  label: string;
  hint: string;
  rows: number;
};

export type PersonaGroup = {
  key: "persona" | "behaviors";
  title: string;
  blurb: string;
  sections: PersonaSection[];
};

export const PERSONA_GROUPS: PersonaGroup[] = [
  {
    key: "persona",
    title: "Persona",
    blurb: "Who the persona is — identity, drives, and how it reads to others.",
    sections: [
      {
        key: "core_profile",
        label: "Core profile",
        hint:
          "Role / title\nOrganization or context\nArchetype (a concise label for the personality type)",
        rows: 4,
      },
      {
        key: "context_identity",
        label: "Context & identity",
        hint:
          "Background — education, career history, formative experiences\n" +
          "Current situation — role, primary challenges, immediate environment\n" +
          "Core responsibilities\n" +
          "Motivations / values — the internal drivers and beliefs behind the actions",
        rows: 6,
      },
      {
        key: "cognitive_frame",
        label: "Cognitive frame (jobs-to-be-done)",
        hint:
          "Functional jobs — practical tasks being accomplished\n" +
          "Emotional jobs — how they want to feel, or avoid feeling\n" +
          "Social jobs — how they want to be perceived",
        rows: 5,
      },
      {
        key: "decision_dynamics",
        label: "Behavioral & decision dynamics",
        hint:
          "Push factors — frustrations driving them from the status quo\n" +
          "Pull factors — what draws them to a new solution\n" +
          "Anxieties / barriers — what stops them acting\n" +
          "Habits / heuristics — rules of thumb and recurring questions",
        rows: 6,
      },
      {
        key: "operating_model",
        label: "Operating / interaction model",
        hint:
          "Mode of work — collaborative, solo, analytical, intuitive\n" +
          "Tools & environment — software, methods, frameworks, settings\n" +
          "Focus areas / domains of expertise",
        rows: 5,
      },
      {
        key: "evidence_triggers",
        label: "Evidence, beliefs, and triggers",
        hint:
          "Information they trust — data, intuition, peer review\n" +
          "Decision triggers — what forces a choice\n" +
          "Red flags — what makes them disengage or turn skeptical",
        rows: 5,
      },
      {
        key: "communication_style",
        label: "Communication & interaction style",
        hint:
          "Tone & voice — direct, empathetic, formal, skeptical\n" +
          "Communication methods — how feedback is given and preferred\n" +
          "Conflict resolution — how disagreement is handled",
        rows: 5,
      },
      {
        key: "goals_outcomes",
        label: "Goals & outcomes",
        hint: "One goal per line — what success looks like.",
        rows: 4,
      },
      {
        key: "meta_attributes",
        label: "Meta attributes",
        hint:
          "Identity markers — objects, books, phrases they're known for\n" +
          "Archetypal energy — the vibe (The Mentor, The Disruptor, The Guardian)\n" +
          "Narrative arc — the journey from a project's start to its end\n" +
          "Signature quote — one sentence holding the whole philosophy",
        rows: 6,
      },
    ],
  },
  {
    key: "behaviors",
    title: "Agent behaviors",
    blurb: "How the persona actually acts — patterns, reactions, and tells.",
    sections: [
      {
        key: "daily_workflow",
        label: "Daily workflow",
        hint:
          "Morning — first thing checked, how priorities get set, time spent\n" +
          "Core work time — main activities, task-switching, focus duration\n" +
          "End of day — wrap-up, prep for tomorrow, handoffs",
        rows: 6,
      },
      {
        key: "decision_making",
        label: "Decision making",
        hint:
          "Research style — quick and dirty, thorough, delegated, intuitive\n" +
          "Sources consulted — internal, external, peers, online\n" +
          "Time to decision — simple, complex, purchase\n" +
          "Evaluation criteria, ranked — cost, features, ease, integration, reputation, support, security",
        rows: 6,
      },
      {
        key: "technology_adoption",
        label: "Technology adoption",
        hint:
          "Learning style — docs, video, live training, trial and error, peers\n" +
          "Onboarding tolerance — max setup time, training budget, time to value\n" +
          "Adoption curve and which features get used, occasionally used, ignored",
        rows: 5,
      },
      {
        key: "problem_solving",
        label: "Problem solving",
        hint:
          "First response when something breaks — fix it, ask, search, escalate, work around\n" +
          "Persistence — time before asking for help, attempts before giving up\n" +
          "Error tolerance — minor, major, critical\n" +
          "Recovery expectations — acceptable downtime, data loss, support response",
        rows: 6,
      },
      {
        key: "communication_behavior",
        label: "Communication behavior",
        hint:
          "Internal — collaboration channels, how much gets shared and how often\n" +
          "External — preferred channel, expected response time, formality\n" +
          "Feedback style — blunt, diplomatic, conflict-avoidant, data-driven",
        rows: 5,
      },
      {
        key: "stress_response",
        label: "Stress response",
        hint:
          "Under pressure — reaction to time pressure, scarce resources, conflicting priorities, failures\n" +
          "Coping — delegate, work longer, cut corners, ask for help, simplify\n" +
          "Crisis mode — what becomes the priority, what gets dropped, impact on others",
        rows: 6,
      },
      {
        key: "purchasing_behavior",
        label: "Purchasing behavior",
        hint:
          "Research — features, pricing, references, demos\n" +
          "Influencers — internal, external, online\n" +
          "Approval — decides alone up to $X, needs consensus, needs an exec\n" +
          "Risk mitigation — pilot, guarantee, references, proof of concept",
        rows: 5,
      },
      {
        key: "change_management",
        label: "Change management",
        hint:
          "Initial reaction to change — enthusiastic, cautious, skeptical, resistant\n" +
          "Adaptation speed — learning curve, time to full adoption\n" +
          "Role in change — champion, early adopter, majority, laggard; who influences them",
        rows: 5,
      },
      {
        key: "scenarios",
        label: "Scenario behaviors",
        hint:
          "New tool introduced — what they do, and the first three questions they ask\n" +
          "Current tool fails — immediate action and contingency\n" +
          "Budget cut 30% — what gets protected and what gets traded away",
        rows: 6,
      },
      {
        key: "behavioral_indicators",
        label: "Behavioral indicators",
        hint:
          "Success signals — what satisfaction sounds like, what they do, what improves\n" +
          "Advocacy triggers — what makes them recommend it, and to whom\n" +
          "Warning signs — early dissatisfaction, escalation points, abandonment triggers",
        rows: 6,
      },
      {
        key: "behavioral_summary",
        label: "Behavioral summary",
        hint:
          "Three words that describe them\n" +
          "Archetype — Optimizer, Collaborator, Innovator, Stabilizer, Achiever\n" +
          "Key behavioral insight — one sentence for the essential pattern",
        rows: 5,
      },
      {
        key: "notes",
        label: "Notes",
        hint: "Anything else worth knowing about how this persona behaves.",
        rows: 4,
      },
    ],
  },
];

/** Every section, flattened — the order sections are saved and prompted in. */
export const PERSONA_SECTIONS: PersonaSection[] = PERSONA_GROUPS.flatMap((g) => g.sections);

export type PersonaSections = Record<string, string>;

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
 * Render the filled sections for the chatbot's system prompt. Empty sections
 * are skipped entirely — a half-filled persona shouldn't pad the prompt with
 * bare headings the model then tries to honor.
 */
export function personaPromptBlock(raw: string | null | undefined): string {
  const sections = safePersonaSections(raw);
  const lines: string[] = [];
  for (const group of PERSONA_GROUPS) {
    const filled = group.sections.filter((s) => sections[s.key]?.trim());
    if (!filled.length) continue;
    lines.push(`## ${group.title}`);
    for (const s of filled) {
      lines.push(`### ${s.label}`, sections[s.key].trim(), "");
    }
  }
  return lines.join("\n").trim();
}
