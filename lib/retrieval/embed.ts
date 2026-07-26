import { tokenize } from "./chunking";

/**
 * Embeddings with a provider chain: Voyage (VOYAGE_API_KEY) → OpenAI
 * (OPENAI_API_KEY) → a deterministic local hashed-feature embedding that
 * needs no network. Anthropic has no embeddings endpoint, so with only
 * ANTHROPIC_API_KEY set the local fallback is what runs; hybrid retrieval
 * (lexical + vector) keeps quality acceptable there, and adding a provider
 * key upgrades new chunks transparently.
 *
 * Every chunk stores which model embedded it — cosine similarity is only
 * computed between same-model vectors.
 */

export const LOCAL_EMBED_MODEL = "local-hash-256-v1";
const LOCAL_DIM = 256;
const MAX_EMBED_RETRIES = 4;

export function embedModelName(): string {
  if (process.env.VOYAGE_API_KEY) return "voyage-3.5-lite";
  if (process.env.OPENAI_API_KEY) return "text-embedding-3-small";
  return LOCAL_EMBED_MODEL;
}

export type Embedded = { vectors: (Float32Array | null)[]; model: string };

export async function embedTexts(texts: string[]): Promise<Embedded> {
  const model = embedModelName();
  if (model !== LOCAL_EMBED_MODEL) {
    try {
      return { vectors: await apiEmbed(texts, model), model };
    } catch (e) {
      // Deliberately NOT falling back to local vectors here. Cosine is only
      // computed between same-model vectors, so a provider hiccup mid-reindex
      // would silently split the index in two and leave part of the knowledge
      // base keyword-only — with nothing to show for it. Leaving these chunks
      // unembedded is the honest failure: they stay lexically searchable and
      // the Graph tab reports them as missing an embedding.
      console.error(`embedTexts: ${model} failed after retries —`, e);
      return { vectors: texts.map(() => null), model };
    }
  }
  return { vectors: texts.map(localEmbed), model: LOCAL_EMBED_MODEL };
}

/**
 * Embed via the provider, retrying rate limits and transient server errors.
 * A bulk reindex fires one request per origin back to back, which trips the
 * per-minute limits on entry-level plans; without this the whole run degrades.
 */
async function apiEmbed(texts: string[], model: string, attempt = 0): Promise<Float32Array[]> {
  const voyage = model.startsWith("voyage");
  const res = await fetch(
    voyage ? "https://api.voyageai.com/v1/embeddings" : "https://api.openai.com/v1/embeddings",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${voyage ? process.env.VOYAGE_API_KEY : process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({ model, input: texts }),
      signal: AbortSignal.timeout(20_000),
    },
  );

  if ((res.status === 429 || res.status >= 500) && attempt < MAX_EMBED_RETRIES) {
    // 2s, 4s, 8s, 16s — comfortably clears a per-minute window.
    await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
    return apiEmbed(texts, model, attempt + 1);
  }
  if (!res.ok) throw new Error(`Embeddings API ${res.status}`);
  const json = (await res.json()) as { data: { index: number; embedding: number[] }[] };
  const out: Float32Array[] = new Array(texts.length);
  for (const d of json.data) out[d.index] = normalize(Float32Array.from(d.embedding));
  if (out.some((v) => !v)) throw new Error("Embeddings API returned incomplete data");
  return out;
}

/**
 * Local fallback: signed feature hashing of word tokens + character trigrams,
 * L2-normalized. Deterministic, cheap, and good enough to complement BM25 on
 * a small personal-site corpus.
 */
function localEmbed(text: string): Float32Array {
  const v = new Float32Array(LOCAL_DIM);
  for (const tok of tokenize(text)) {
    addFeature(v, `w:${tok}`);
    const padded = `^${tok}$`;
    for (let i = 0; i + 3 <= padded.length; i++) addFeature(v, `g:${padded.slice(i, i + 3)}`);
  }
  return normalize(v);
}

function addFeature(v: Float32Array, feature: string): void {
  // FNV-1a 32-bit; low bits pick the dimension, one high bit picks the sign.
  let h = 0x811c9dc5;
  for (let i = 0; i < feature.length; i++) {
    h ^= feature.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h >>>= 0;
  v[h % LOCAL_DIM] += h & 0x80000000 ? 1 : -1;
}

function normalize(v: Float32Array): Float32Array {
  let sum = 0;
  for (const x of v) sum += x * x;
  const n = Math.sqrt(sum);
  if (n > 0) for (let i = 0; i < v.length; i++) v[i] /= n;
  return v;
}

/** Dot product of two normalized vectors = cosine similarity. */
export function cosine(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

export function vecToBytes(v: Float32Array): Uint8Array<ArrayBuffer> {
  const buf = new ArrayBuffer(v.byteLength);
  new Float32Array(buf).set(v);
  return new Uint8Array(buf);
}

export function bytesToVec(b: Uint8Array): Float32Array {
  const copy = new Uint8Array(b); // ensure 4-byte alignment
  return new Float32Array(copy.buffer, 0, Math.floor(copy.byteLength / 4));
}
