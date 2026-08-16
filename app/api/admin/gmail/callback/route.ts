import { isAuthed } from "@/lib/auth";
import { exchangeAndStore } from "@/lib/gmail/client";
import { verifyState } from "@/lib/gmail/state";

export const runtime = "nodejs";

/**
 * Step two: Google sends the admin back here with a one-time code. Verify the
 * state nonce, exchange the code for a refresh token, store it, and return to
 * the Contacts tab with a message.
 *
 * The state check happens BEFORE the exchange — a callback we did not issue
 * never gets to spend a code or write a row.
 */
function back(req: Request, message: string): Response {
  return Response.redirect(
    new URL(`/admin/dashboard?tab=contacts&gmail=${encodeURIComponent(message)}`, req.url),
    303,
  );
}

export async function GET(req: Request) {
  if (!(await isAuthed())) return new Response("Unauthorized", { status: 401 });

  const url = new URL(req.url);
  const error = url.searchParams.get("error");
  if (error) return back(req, `Google refused the authorization: ${error}`);

  if (!verifyState(url.searchParams.get("state"))) {
    return back(req, "That sign-in link was not one this site issued, or it expired. Try again.");
  }

  const code = url.searchParams.get("code");
  if (!code) return back(req, "Google returned no authorization code.");

  try {
    const problem = await exchangeAndStore(code, url.origin);
    return back(req, problem ?? "Gmail connected.");
  } catch (e) {
    return back(req, e instanceof Error ? e.message : "Token exchange failed.");
  }
}
