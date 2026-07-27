import { listOpenSlots } from "@/lib/booking/service";
import { underReadLimit } from "@/lib/booking/guard";
import { clientIp } from "@/lib/util";

export const runtime = "nodejs";
// Free/busy is live data with its own short cache in the service; letting Next
// cache the route on top of that would serve yesterday's availability.
export const dynamic = "force-dynamic";

/** The open slots the in-chat booking card offers. */
export async function GET(req: Request) {
  if (!underReadLimit(clientIp(req.headers))) {
    return Response.json({ ok: false, error: "Too many requests." }, { status: 429 });
  }

  const result = await listOpenSlots();
  return Response.json({ ok: true, ...result });
}
