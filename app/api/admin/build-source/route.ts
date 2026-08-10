import { draftIngestionSource, type BuilderTurn, type SourceDraft } from "@/lib/ingestionBuilder";
import { isAuthed } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Transport for the ingestion-source builder chat: one POST per turn, one
 * JSON response {reply, draft|null}. The builder itself lives in
 * lib/ingestionBuilder.ts. Admin-only: the builder spends real tokens, so an
 * unauthenticated request is refused before any model call.
 */
export async function POST(req: Request) {
  if (!(await isAuthed())) return new Response("Unauthorized", { status: 401 });

  let body: { turns?: unknown; current?: SourceDraft | null };
  try {
    body = await req.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const turns: BuilderTurn[] = (Array.isArray(body.turns) ? body.turns : [])
    .flatMap((t) => {
      const role = (t as { role?: unknown })?.role;
      const content = (t as { content?: unknown })?.content;
      return (role === "user" || role === "assistant") && typeof content === "string"
        ? [{ role: role as BuilderTurn["role"], content: content.slice(0, 4000) }]
        : [];
    })
    .slice(-20);
  if (!turns.length || turns[turns.length - 1].role !== "user") {
    return new Response("Describe the ingestion source first.", { status: 400 });
  }

  const result = await draftIngestionSource(turns, body.current ?? null);
  if ("error" in result) return Response.json(result, { status: 502 });
  return Response.json(result);
}
