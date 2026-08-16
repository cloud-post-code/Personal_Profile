import { isAuthed } from "@/lib/auth";
import { gmailConfigured, gmailConsentUrl } from "@/lib/gmail/client";
import { issueState } from "@/lib/gmail/state";

export const runtime = "nodejs";

/**
 * Step one of connecting Gmail: send the admin to Google's consent screen.
 *
 * Admin-only, and it carries a signed `state` nonce that the callback
 * verifies — without one, a crafted callback URL could write someone else's
 * grant into the database.
 *
 * The redirect URI is built from this request's own origin so localhost and
 * the deployed domain both work, as long as both are registered on the OAuth
 * client.
 */
export async function GET(req: Request) {
  if (!(await isAuthed())) return new Response("Unauthorized", { status: 401 });

  if (!gmailConfigured()) {
    return Response.redirect(
      new URL(
        "/admin/dashboard?tab=contacts&gmail=" +
          encodeURIComponent(
            "Set GOOGLE_GMAIL_CLIENT_ID and GOOGLE_GMAIL_CLIENT_SECRET first.",
          ),
        req.url,
      ),
      303,
    );
  }

  const origin = new URL(req.url).origin;
  return Response.redirect(gmailConsentUrl(origin, issueState()), 303);
}
