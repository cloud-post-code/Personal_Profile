import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { authorizationUrl, googleOAuthApp, googleRedirectUri } from "@/lib/google";
import { newOAuthState } from "@/lib/googleConnection";
import { siteOrigin } from "@/lib/util";
import { OAUTH_STATE_COOKIE, adminBooking } from "../shared";

/**
 * Step one of connecting the calendar: send Blake to Google's consent screen.
 *
 * A GET that only redirects, so it can be a plain link in the admin — but it
 * still issues the CSRF nonce, which is why it is a route and not an href
 * straight to Google.
 */
export async function GET(req: Request) {
  if (!(await isAuthed())) return NextResponse.redirect(new URL("/admin", siteOrigin(req.headers)));

  const app = googleOAuthApp();
  if (!app) {
    // The Booking tab hides the button in this state; someone hit the URL
    // directly, so say what is missing rather than bouncing them to Google.
    return NextResponse.redirect(adminBooking(req, "error", "no-client-credentials"));
  }

  const state = newOAuthState();
  const res = NextResponse.redirect(
    authorizationUrl(app.clientId, googleRedirectUri(siteOrigin(req.headers)), state),
  );
  res.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // Google's redirect back is a top-level GET from another site, so "strict"
    // would drop the cookie exactly when the callback needs to read it.
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });
  return res;
}
