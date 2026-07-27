import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { isAuthed } from "@/lib/auth";
import { exchangeCode, googleOAuthApp, googleRedirectUri } from "@/lib/google";
import { decideCallback, saveGoogleRefreshToken } from "@/lib/googleConnection";
import { siteOrigin } from "@/lib/util";
import { OAUTH_STATE_COOKIE, backToBooking } from "../shared";

/**
 * Step two: Google sends Blake back here with a one-time code.
 *
 * This URL is reachable by anyone who can make a browser follow a link, so
 * nothing is written until `decideCallback` says so — he must be signed in as
 * admin, and the `state` must be the one this site issued moments ago. This
 * handler only carries out the verdict; the gates themselves are pure and are
 * driven directly by the proof.
 */
export async function GET(req: Request) {
  const origin = siteOrigin(req.headers);
  const app = googleOAuthApp();

  const decision = decideCallback({
    authed: await isAuthed(),
    appConfigured: app !== null,
    issuedState: (await cookies()).get(OAUTH_STATE_COOKIE)?.value,
    params: new URL(req.url).searchParams,
  });

  if (decision.action === "signin") return NextResponse.redirect(new URL("/admin", origin));
  if (decision.action === "refuse") return backToBooking(req, "error", decision.reason);

  try {
    const { refreshToken } = await exchangeCode(app!, decision.code, googleRedirectUri(origin));
    await saveGoogleRefreshToken(refreshToken);
  } catch (e) {
    console.error("Google connect failed:", e);
    return backToBooking(req, "error", "exchange-failed");
  }

  // The chat's system prompt and the booking card both key off "connected", and
  // both are rendered from cached server output.
  revalidatePath("/", "layout");
  return backToBooking(req, "connected");
}
