import { claude, claudeModel } from "@/lib/claude";
import { buildSystemPrompt } from "@/lib/knowledge";

export const runtime = "nodejs";

type Msg = { role: "user" | "assistant"; content: string };

export async function POST(req: Request) {
  let body: { messages?: Msg[] };
  try {
    body = await req.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const incoming = (body.messages ?? [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-20); // cap history

  if (incoming.length === 0) {
    return new Response("No messages", { status: 400 });
  }

  let system: string;
  try {
    system = await buildSystemPrompt();
  } catch {
    return new Response("Knowledge base unavailable", { status: 500 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const s = await claude().messages.stream({
          model: claudeModel(),
          max_tokens: 1024,
          system,
          messages: incoming.map((m) => ({ role: m.role, content: m.content })),
        });
        for await (const event of s) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
      } catch (e) {
        const msg =
          e instanceof Error && e.message.includes("ANTHROPIC_API_KEY")
            ? "The chatbot isn't configured yet (missing API key)."
            : "Something went wrong reaching the model.";
        controller.enqueue(encoder.encode(`\n\n[${msg}]`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
