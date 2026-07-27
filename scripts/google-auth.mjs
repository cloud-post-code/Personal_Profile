#!/usr/bin/env node
/**
 * One-time Google Calendar authorization.
 *
 *   node scripts/google-auth.mjs
 *
 * Prints a GOOGLE_REFRESH_TOKEN to paste into .env (and into Railway). Run it
 * again only if the token is revoked or you change scopes.
 *
 * Before running, in https://console.cloud.google.com:
 *   1. Create a project and enable the Google Calendar API.
 *   2. OAuth consent screen: External. Add your own Google account as a test
 *      user. IMPORTANT: while the app is in "Testing", Google expires refresh
 *      tokens after 7 days — publish the app (it stays unverified, which is
 *      fine for a single user) to get a token that lasts.
 *   3. Credentials -> OAuth client ID -> Web application, with the redirect URI
 *      http://localhost:5858/callback
 *   4. Put the client id and secret in .env as GOOGLE_CLIENT_ID /
 *      GOOGLE_CLIENT_SECRET.
 *
 * The scopes requested are the two narrowest that work: freebusy (when you are
 * busy, not what you are doing) and events (write the booking). This never asks
 * for permission to read your meetings.
 */

import { createServer } from "node:http";
import { readFileSync } from "node:fs";

const PORT = 5858;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const SCOPES = [
  "https://www.googleapis.com/auth/calendar.freebusy",
  "https://www.googleapis.com/auth/calendar.events",
].join(" ");

loadEnv();

const clientId = (process.env.GOOGLE_CLIENT_ID ?? "").trim();
const clientSecret = (process.env.GOOGLE_CLIENT_SECRET ?? "").trim();

if (!clientId || !clientSecret) {
  console.error(
    "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env first (see the header of this file).",
  );
  process.exit(1);
}

const authUrl =
  "https://accounts.google.com/o/oauth2/v2/auth?" +
  new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: SCOPES,
    // Both are required to be handed a refresh token at all, and prompt=consent
    // is what makes a *re*-authorization return one instead of just an access token.
    access_type: "offline",
    prompt: "consent",
  });

console.log("\nOpen this URL, sign in as the calendar's owner, and approve:\n");
console.log(authUrl);
console.log(`\nWaiting on ${REDIRECT_URI} …\n`);

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname !== "/callback") {
    res.writeHead(404).end();
    return;
  }

  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  if (error || !code) {
    respond(res, `Authorization failed: ${error ?? "no code returned"}`);
    console.error(`\nFailed: ${error ?? "no code returned"}`);
    server.close();
    process.exit(1);
  }

  try {
    const token = await exchange(code);
    respond(res, "Authorized. You can close this tab and go back to the terminal.");
    console.log("\nAdd this to .env (and to your Railway variables):\n");
    console.log(`GOOGLE_REFRESH_TOKEN="${token.refresh_token}"`);
    console.log(`\nGranted scopes: ${token.scope}`);
    console.log(
      "\nIf refresh_token is missing above, Google already had a grant for this " +
        "client — revoke it at https://myaccount.google.com/permissions and re-run.\n",
    );
  } catch (e) {
    respond(res, "Token exchange failed — see the terminal.");
    console.error(`\n${e instanceof Error ? e.message : e}`);
    server.close();
    process.exit(1);
  }
  server.close();
  process.exit(0);
});

server.listen(PORT);

async function exchange(code) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Token exchange failed (${res.status}): ${JSON.stringify(body)}`);
  return body;
}

function respond(res, message) {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(`<!doctype html><meta charset="utf-8"><body style="font:16px system-ui;padding:40px">${message}</body>`);
}

/** Minimal .env reader — this script runs outside Next, which normally loads it. */
function loadEnv() {
  let raw;
  try {
    raw = readFileSync(new URL("../.env", import.meta.url), "utf8");
  } catch {
    return;
  }
  for (const line of raw.split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    const value = m[2].trim().replace(/^["'](.*)["']$/s, "$1");
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}
