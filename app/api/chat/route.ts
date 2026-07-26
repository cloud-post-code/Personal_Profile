import type Anthropic from "@anthropic-ai/sdk";
import { claude, claudeModel } from "@/lib/claude";
import { buildSystemPrompt } from "@/lib/knowledge";
import { allProjectsBlock, singleProjectBlock, galleryBlock, type UiBlock } from "@/lib/cards";
import { recordTurn } from "@/lib/activity";

export const runtime = "nodejs";

type Msg = { role: "user" | "assistant"; content: string };

/**
 * A2UI chat. Claude can call UI tools (show_projects / show_project /
 * show_gallery) to render rich cards. We stream a tiny line protocol to the
 * client, one JSON object per line:
 *   {"t":"text","v":"..."}      incremental assistant text
 *   {"t":"card","v":{...}}      a hydrated UI block to render
 * The frontend splits on newlines and interprets each.
 */

const TOOLS: Anthropic.Tool[] = [
  {
    name: "show_projects",
    description:
      "Render cards for ALL of Blake's projects. Use when the visitor asks about his projects in general.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "show_project",
    description:
      "Render a single project's card. Use when focused on one specific project. Pass its id from the PROJECTS list.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string", description: "The project id" } },
      required: ["id"],
    },
  },
  {
    name: "show_gallery",
    description:
      "Render Blake's photos as a gallery. layout 'carousel' is a slideshow; 'filmstrip' is a browsable thumbnail strip with a lightbox.",
    input_schema: {
      type: "object",
      properties: {
        layout: { type: "string", enum: ["carousel", "filmstrip"] },
      },
      required: ["layout"],
    },
  },
  {
    name: "show_contact_form",
    description:
      "Render a contact form so the visitor can leave their name, email, and a message for Blake. Use this whenever someone wants to get in touch, connect, reach out, hire, or collaborate. Their submission is recorded for Blake.",
    input_schema: { type: "object", properties: {} },
  },
];

async function hydrate(name: string, input: Record<string, unknown>): Promise<UiBlock | null> {
  switch (name) {
    case "show_projects":
      return allProjectsBlock();
    case "show_project":
      return singleProjectBlock(String(input.id ?? ""));
    case "show_gallery":
      return galleryBlock(input.layout === "carousel" ? "carousel" : "filmstrip");
    case "show_contact_form":
      return { type: "contact" };
    default:
      return null;
  }
}

export async function POST(req: Request) {
  let body: { messages?: Msg[]; sessionId?: string };
  try {
    body = await req.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  const incoming = (body.messages ?? [])
    .filter(
      (m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string",
    )
    .slice(-20);

  if (incoming.length === 0) return new Response("No messages", { status: 400 });

  const lastUser = [...incoming].reverse().find((m) => m.role === "user");

  let system: string;
  try {
    // The visitor's latest question drives retrieval: the prompt carries only
    // the knowledge relevant to it, not the whole source library.
    system = await buildSystemPrompt(lastUser?.content);
  } catch {
    return new Response("Knowledge base unavailable", { status: 500 });
  }

  const encoder = new TextEncoder();
  const line = (obj: unknown) => encoder.encode(JSON.stringify(obj) + "\n");

  const stream = new ReadableStream({
    async start(controller) {
      const convo: Anthropic.MessageParam[] = incoming.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      // Full assistant text across all turns, for the activity log.
      let answer = "";

      try {
        // Loop so we can run tools and let Claude continue speaking after.
        for (let turn = 0; turn < 4; turn++) {
          const stream = await claude().messages.stream({
            model: claudeModel(),
            max_tokens: 1024,
            system,
            tools: TOOLS,
            messages: convo,
          });

          for await (const event of stream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              answer += event.delta.text;
              controller.enqueue(line({ t: "text", v: event.delta.text }));
            }
          }

          const final = await stream.finalMessage();
          const toolUses = final.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
          );

          if (toolUses.length === 0) break; // Claude is done talking.

          // Hydrate each tool call into a UI card and stream it.
          const results: Anthropic.ToolResultBlockParam[] = [];
          for (const tu of toolUses) {
            const block = await hydrate(tu.name, (tu.input ?? {}) as Record<string, unknown>);
            if (block) controller.enqueue(line({ t: "card", v: block }));
            results.push({
              type: "tool_result",
              tool_use_id: tu.id,
              content: block ? "Card rendered to the user." : "No data available.",
            });
          }

          // Feed the tool results back so Claude can add closing words.
          convo.push({ role: "assistant", content: final.content });
          convo.push({ role: "user", content: results });
        }
      } catch (e) {
        const msg =
          e instanceof Error && e.message.includes("ANTHROPIC_API_KEY")
            ? "The chatbot isn't configured yet (missing API key)."
            : "Something went wrong reaching the model.";
        controller.enqueue(line({ t: "text", v: `\n\n[${msg}]` }));
      } finally {
        controller.close();
        // Record this turn for the admin "Activity" tab. Best-effort: never let
        // a logging failure affect the visitor's chat.
        recordTurn({
          sessionId,
          question: lastUser?.content ?? "",
          answer,
        }).catch(() => {});
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache" },
  });
}
