import { siteOrigin } from "@/lib/a2a/card";
import { agentFacts } from "@/lib/a2a/facts";

/** Extension-less alias of ../agent-facts.json — see that file for why both. */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const facts = await agentFacts(siteOrigin(req.headers));
  return new Response(JSON.stringify(facts, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=300, must-revalidate",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
