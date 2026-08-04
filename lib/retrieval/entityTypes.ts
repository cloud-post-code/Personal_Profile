/**
 * The entity ontology, kept free of server-only imports.
 *
 * Split out of entities.ts because the admin Graph canvas is a client
 * component that needs this list: importing it from entities.ts pulled the
 * Anthropic SDK (and, through it, node:path) into the browser bundle and
 * broke the build. Anything a client component needs belongs here; the
 * extraction call itself stays in entities.ts.
 */

export const ENTITY_TYPES_LIST = [
  "person", "org", "project", "skill", "place", "topic", "event", "other",
] as const;

export const ENTITY_TYPES = new Set<string>(ENTITY_TYPES_LIST);

/** Normalized lookup key for an entity name. */
export function entityKey(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}
