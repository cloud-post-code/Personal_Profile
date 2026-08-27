import { isAuthed } from "@/lib/auth";
import { gmailConfigured, gmailConsentUrl } from "@/lib/gmail/client";
import { issueState } from "@/lib/gmail/state";
import { siteOrigin } from "@/lib/util";

export const runtime = "nodejs";

/**
 * Step one of connecting Gmail: send the admin to Google's consent screen.
 *
 * Admin-only, and it carries a signed `state` nonce that the callback
 * verifies — without one, a crafted callback URL could write someone else's
 * grant into the database.
 *
 * The redirect URI comes from siteOrigin(), never req.url: behind Railway's
 * proxy, req.url's host is the server's own bind address (localhost:PORT),
 * which Google rejects as a redirect_uri_mismatch.
 */
export async function GET(req: Request) {
  if (!(await isAuthed())) return new Response("Unauthorized", { status: 401 });

  const origin = siteOrigin(req.headers);
  if (!gmailConfigured()) {
    return Response.redirect(
      `${origin}/admin/dashboard?tab=contacts&gmail=` +
        encodeURIComponent("Set GOOGLE_GMAIL_CLIENT_ID and GOOGLE_GMAIL_CLIENT_SECRET first."),
      303,
    );
  }

  return Response.redirect(gmailConsentUrl(origin, issueState()), 303);
}
