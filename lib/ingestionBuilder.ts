import { claude, cardBuilderModel } from "@/lib/claude";
import {
  UPLOAD_METHODS,
  STORAGE_KINDS,
  type UploadMethod,
  type StorageKinds,
} from "@/lib/ingestionSources";

/**
 * The model exchange behind the ingestion-source builder chat: the admin
 * describes the source they want, the model replies conversationally AND
 * proposes a draft config the sample pane renders live. Data in, data out —
 * the split page and its test mode belong to app/admin/SourceBuilder.tsx.
 *
 * Parsing is defensive throughout: the model's output is admin-facing
 * suggestion, not trusted config. Non-JSON becomes a plain reply, fields
 * outside the closed vocabularies coerce to the safe defaults a custom
 * source wants (generic + text), and a draft without a label is no draft.
 * The final save still goes through saveIngestionSource's own validation.
 */

export type SourceDraft = {
  label: string;
  key: string;
  description: string;
  systemPrompt: string;
  uploadMethod: UploadMethod;
  storageKinds: StorageKinds;
  outputMethod: string;
};

export type BuilderTurn = { role: "user" | "assistant"; content: string };

/** Minimal client surface, injectable for proofs (same pattern as cardBuilder). */
export type SourceBuilderClient = {
  messages: {
    create(req: {
      model: string;
      max_tokens: number;
      system: string;
      messages: BuilderTurn[];
    }): Promise<{ content: unknown[] }>;
  };
};

const SYSTEM = `You help the admin of a personal site design a new INGESTION SOURCE:
a Content tab that ingests information for the site's chatbot. A source has:
- label: the tab's human name
- key: a short kebab-case slug derived from the label
- description: one line on what it ingests
- systemPrompt: how ingested content should be read/extracted/summarized
- uploadMethod: one of ${UPLOAD_METHODS.join(", ")} — pick what fits how the
  content arrives: "url" scans web pages, "file" uploads PDF/Word documents,
  "textarea" is a paste-text form, "image" uploads photos, and "generic"
  offers paste + image together. ("resume"/"github"/"form" exist for the
  built-in tabs; avoid them for custom sources.)
- storageKinds: one of ${STORAGE_KINDS.join(", ")} — every ingested piece is
  stored as text or as an image; default "text" unless images are wanted
- outputMethod: where the data lands; custom sources use
  "Source/Photo rows, read back as unified text/image items"

Answer EVERY turn as a single JSON object, nothing else:
{"reply": "<short conversational answer or question>",
 "draft": {<the full current config>} }
Refine the draft across turns from the whole conversation. If you still need
information before proposing anything, set "draft": null and ask in "reply".`;

function textOf(content: unknown[]): string {
  return content
    .map((b) => {
      const block = b as { type?: string; text?: string };
      return block?.type === "text" && typeof block.text === "string" ? block.text : "";
    })
    .join("");
}

function validateDraft(v: unknown): SourceDraft | null {
  if (!v || typeof v !== "object") return null;
  const d = v as Record<string, unknown>;
  const str = (x: unknown) => (typeof x === "string" ? x.trim() : "");
  const label = str(d.label);
  if (!label) return null;
  const uploadMethod = (UPLOAD_METHODS as readonly string[]).includes(str(d.uploadMethod))
    ? (str(d.uploadMethod) as UploadMethod)
    : "generic";
  const storageKinds = (STORAGE_KINDS as readonly string[]).includes(str(d.storageKinds))
    ? (str(d.storageKinds) as StorageKinds)
    : "text";
  return {
    label,
    key: str(d.key),
    description: str(d.description),
    systemPrompt: str(d.systemPrompt),
    uploadMethod,
    storageKinds,
    outputMethod:
      str(d.outputMethod) || "Source/Photo rows, read back as unified text/image items",
  };
}

/** One builder turn: the whole conversation in, a reply and draft out. */
export async function draftIngestionSource(
  turns: BuilderTurn[],
  current: SourceDraft | null,
  deps: { client?: SourceBuilderClient } = {},
): Promise<{ reply: string; draft: SourceDraft | null } | { error: string }> {
  const client = deps.client ?? claude();
  const messages: BuilderTurn[] = current
    ? [
        ...turns.slice(0, -1),
        {
          role: "user" as const,
          content: `(current draft: ${JSON.stringify(current)})\n${turns[turns.length - 1]?.content ?? ""}`,
        },
      ]
    : turns;
  let raw: string;
  try {
    const res = await client.messages.create({
      model: cardBuilderModel(),
      max_tokens: 1500,
      system: SYSTEM,
      messages,
    });
    raw = textOf(res.content).trim();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "The builder call failed." };
  }

  // The model was asked for pure JSON, but a stray sentence must degrade to
  // "just a chat reply", never a crash or a junk draft.
  const jsonText = raw.match(/\{[\s\S]*\}/)?.[0];
  if (jsonText) {
    try {
      const parsed = JSON.parse(jsonText) as { reply?: unknown; draft?: unknown };
      const reply = typeof parsed.reply === "string" && parsed.reply.trim() ? parsed.reply.trim() : raw;
      return { reply, draft: validateDraft(parsed.draft) };
    } catch {
      // fall through to plain-reply
    }
  }
  return { reply: raw || "…", draft: null };
}
