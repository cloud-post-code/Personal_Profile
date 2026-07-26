import type Anthropic from "@anthropic-ai/sdk";
import { claude, claudeModel } from "../claude";

/**
 * One Claude call per ingested source: pull out the named things the text
 * talks about and how they relate. The result feeds the entity/edge tables
 * that power one-hop graph expansion at retrieval time.
 */

export type ExtractedGraph = {
  entities: { name: string; type: string }[];
  edges: { from: string; to: string; relation: string }[];
};

export type EntityExtractor = (
  text: string,
  title: string | null,
) => Promise<ExtractedGraph>;

export const ENTITY_TYPES_LIST = [
  "person", "org", "project", "skill", "place", "topic", "event", "other",
] as const;

const ENTITY_TYPES = new Set<string>(ENTITY_TYPES_LIST);

/** Normalized lookup key for an entity name. */
export function entityKey(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

export const extractEntities: EntityExtractor = async (text, title) => {
  const prompt =
    `Extract a small knowledge graph from this source about Blake (a personal ` +
    `website's owner). Return STRICT JSON with keys:\n` +
    `- "entities": array of {"name", "type"} — the distinct named things the ` +
    `text is actually about (people, companies/orgs, projects, skills, places, ` +
    `topics, events). 3-12 items, proper names or short noun phrases, no ` +
    `duplicates, type one of: person, org, project, skill, place, topic, ` +
    `event, other.\n` +
    `- "edges": array of {"from", "to", "relation"} — factual relations stated ` +
    `in the text between those entities (or Blake), relation a short verb ` +
    `phrase like "works at", "built", "uses", "located in". 0-15 items. Use ` +
    `entity names exactly as listed in "entities" (adding "Blake" is allowed).\n` +
    `No prose outside the JSON.\n\n` +
    `Title: ${title ?? "(none)"}\n\nTEXT:\n${text.slice(0, 12000)}`;

  const msg = await claude().messages.create({
    model: claudeModel(),
    max_tokens: 1000,
    messages: [{ role: "user", content: prompt }],
  });
  const raw = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  try {
    const json = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
    return sanitizeGraph(json);
  } catch {
    return { entities: [], edges: [] };
  }
}

function sanitizeGraph(json: unknown): ExtractedGraph {
  const j = json as { entities?: unknown; edges?: unknown };
  const entities = (Array.isArray(j.entities) ? j.entities : [])
    .map((e: Record<string, unknown>) => ({
      name: String(e?.name ?? "").replace(/\s+/g, " ").trim(),
      type: ENTITY_TYPES.has(String(e?.type)) ? String(e.type) : "other",
    }))
    .filter((e) => e.name.length > 1 && e.name.length <= 80)
    .slice(0, 15);
  const edges = (Array.isArray(j.edges) ? j.edges : [])
    .map((e: Record<string, unknown>) => ({
      from: String(e?.from ?? "").replace(/\s+/g, " ").trim(),
      to: String(e?.to ?? "").replace(/\s+/g, " ").trim(),
      relation: String(e?.relation ?? "").replace(/\s+/g, " ").trim().slice(0, 60),
    }))
    .filter((e) => e.from && e.to && e.relation && entityKey(e.from) !== entityKey(e.to))
    .slice(0, 20);
  return { entities, edges };
}
