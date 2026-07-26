import { siteOrigin } from "@/lib/a2a/card";
import { agentFacts } from "@/lib/a2a/facts";

/**
 * The hosted AgentFacts document. The NANDA paper is inconsistent about the
 * path (`/.well-known/agent-facts` in the prose, `/.agent-facts` in a sample),
 * so the `.json` suffix is served here and the extension-less alias in
 * ../agent-facts, and both return the same bytes.
 */

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
