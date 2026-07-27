import { NextResponse } from "next/server";
import { siteOrigin } from "@/lib/util";

/** Holds the CSRF nonce for one consent round trip. */
export const OAUTH_STATE_COOKIE = "google_oauth_state";

/**
 * Back to the Booking tab, carrying the outcome. Both legs of the flow end
 * here — success and every refusal — so Blake always lands where he started
 * and reads the result in the panel he clicked from.
 */
export function adminBooking(req: Request, status: "connected" | "error", reason?: string): URL {
  const url = new URL("/admin/dashboard", siteOrigin(req.headers));
  url.searchParams.set("tab", "booking");
  url.searchParams.set("google", status);
  if (reason) url.searchParams.set("reason", reason);
  return url;
}

/** Redirect to the Booking tab and drop the spent state cookie. */
export function backToBooking(
  req: Request,
  status: "connected" | "error",
  reason?: string,
): NextResponse {
  const res = NextResponse.redirect(adminBooking(req, status, reason));
  res.cookies.delete(OAUTH_STATE_COOKIE);
  return res;
}
