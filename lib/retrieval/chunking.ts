/**
 * Split source text into retrieval-sized passages. Sentence/paragraph aware:
 * we accumulate sentences up to ~`target` chars and carry a small tail overlap
 * into the next chunk so facts straddling a boundary stay findable.
 */
export function chunkText(text: string, target = 1100, overlap = 150): string[] {
  const clean = text.replace(/\r/g, "").trim();
  if (!clean) return [];
  if (clean.length <= target * 1.3) return [clean];

  const sentences = clean.split(/(?<=[.!?])\s+|\n{2,}/).filter((s) => s.trim());
  const chunks: string[] = [];
  let cur = "";

  for (const s of sentences) {
    if (cur && cur.length + s.length + 1 > target) {
      chunks.push(cur.trim());
      cur = cur.slice(Math.max(0, cur.length - overlap));
    }
    cur = cur ? `${cur} ${s}` : s;
    // Guard against a single pathological run-on "sentence".
    while (cur.length > target * 2) {
      chunks.push(cur.slice(0, target).trim());
      cur = cur.slice(target - overlap);
    }
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks;
}

/** Lowercased word tokens; shared by lexical scoring and local embeddings. */
export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9][a-z0-9'-]*/g) ?? []).filter(
    (t) => t.length > 1,
  );
}
