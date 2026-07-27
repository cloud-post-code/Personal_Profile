import { createBooking, type BookInput } from "@/lib/booking/service";
import { underWriteLimit } from "@/lib/booking/guard";
import { clientIp } from "@/lib/util";

export const runtime = "nodejs";

/**
 * Claims a slot from the in-chat booking card: writes the event to Blake's
 * Google Calendar and emails the visitor an invite.
 *
 * This endpoint has real-world side effects, so it is rate limited per IP. The
 * submitted start time is not trusted — `createBooking` recomputes the open
 * slots and refuses anything that isn't currently on that list.
 */
export async function POST(req: Request) {
  if (!underWriteLimit(clientIp(req.headers))) {
    return Response.json(
      { ok: false, error: "Too many booking attempts. Try again later." },
      { status: 429 },
    );
  }

  let body: Partial<BookInput>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Bad request" }, { status: 400 });
  }

  const result = await createBooking({
    name: String(body.name ?? ""),
    email: String(body.email ?? ""),
    note: String(body.note ?? ""),
    start: String(body.start ?? ""),
    guestTz: String(body.guestTz ?? ""),
  });

  if (!result.ok) {
    // "unavailable" is a lost race, not a malformed request: 409 tells the card
    // to refresh its slots rather than ask the visitor to fix their input.
    const status = result.code === "unavailable" ? 409 : result.code === "failed" ? 502 : 400;
    return Response.json({ ok: false, error: result.error }, { status });
  }

  return Response.json(result);
}
