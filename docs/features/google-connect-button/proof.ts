/**
 * Primary proof for google-connect-button (see PROOF.md).
 * Run: npx tsx docs/features/google-connect-button/proof.ts
 *
 * Zero Google calls. The OAuth boundary runs against a stubbed
 * `globalThis.fetch`, so the exact form fields sent to the token and revoke
 * endpoints are observable and the "no refresh token" case can be forced. The
 * storage and precedence layers run against the real local Postgres, and the
 * seam with booking runs the real service with a fake `CalendarClient`.
 *
 * The Profile singleton's Google columns and booking settings are mutated and
 * restored in `cleanup()`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../../..");
for (const line of readFileSync(path.join(root, ".env"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) {
    process.env[m[1]] = m[2].trim().replace(/^(["'])(.*)\1$/, "$2");
  }
}

// The OAuth app identity for the whole run. No request reaches Google: fetch is
// stubbed for the boundary tests and a client is injected for the service tests.
process.env.GOOGLE_CLIENT_ID = "connproof-client";
process.env.GOOGLE_CLIENT_SECRET = "connproof-secret";
process.env.GOOGLE_CALENDAR_ID = "connproof-calendar";
process.env.GOOGLE_REFRESH_TOKEN = "";
process.env.AUTH_SECRET = "connproof-auth-secret";

import { prisma, getProfile } from "@/lib/db";
import {
  GOOGLE_SCOPES,
  authorizationUrl,
  exchangeCode,
  googleOAuthApp,
  googleRedirectUri,
  resetTokenCache,
  revokeRefreshToken,
  type CalendarClient,
  type EventDraft,
} from "@/lib/google";
import {
  connectionStatus,
  decideCallback,
  decryptToken,
  disconnectGoogleCalendar,
  encryptToken,
  googleConnection,
  newOAuthState,
  oAuthStateMatches,
  saveGoogleRefreshToken,
} from "@/lib/googleConnection";
import { listOpenSlots, bookingLive, resetBookingCache } from "@/lib/booking/service";
import { siteOrigin } from "@/lib/util";
import type { Interval } from "@/lib/booking/slots";

let failures = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) console.log(`  PASS  ${name}`);
  else {
    failures++;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const GRANTED = "connproof-refresh-token";
const REDIRECT = "https://proof.example/api/admin/google/callback";

// ── A stubbed Google token endpoint ──────────────────────────────────────────

type Captured = { url: string; body: URLSearchParams };

/** Swap in a fetch that records the request and answers with `reply`. */
function stubFetch(reply: { status?: number; json: unknown }): {
  calls: Captured[];
  restore: () => void;
} {
  const real = globalThis.fetch;
  const calls: Captured[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      body: new URLSearchParams(String(init?.body ?? "")),
    });
    return new Response(JSON.stringify(reply.json), {
      status: reply.status ?? 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = real; } };
}

// ── A fake calendar, for the booking seam ────────────────────────────────────

function fakeCalendar(busy: Interval[] = []): CalendarClient & { inserted: EventDraft[] } {
  const inserted: EventDraft[] = [];
  return {
    inserted,
    async freeBusy() {
      return busy;
    },
    async insertEvent(draft) {
      inserted.push(draft);
      return { id: "evt", meetUrl: null };
    },
  };
}

/** A fixed Monday, so nothing here depends on the day it is run. */
const NOW = Date.parse("2027-01-11T12:00:00.000Z");

async function main() {
  const original = await getProfile();

  console.log("\nThe OAuth boundary\n");

  {
    const state = newOAuthState();
    const url = new URL(authorizationUrl("cid", REDIRECT, state));
    const scopes = (url.searchParams.get("scope") ?? "").split(" ").sort();
    check(
      "1. consent URL is least-privilege, offline, forced-consent, state-carrying",
      JSON.stringify(scopes) === JSON.stringify([...GOOGLE_SCOPES].sort()) &&
        url.searchParams.get("access_type") === "offline" &&
        url.searchParams.get("prompt") === "consent" &&
        url.searchParams.get("redirect_uri") === REDIRECT &&
        url.searchParams.get("state") === state,
      url.search,
    );
  }

  {
    const saved = process.env.NEXT_PUBLIC_SITE_URL;
    process.env.NEXT_PUBLIC_SITE_URL = "https://proof.example/";
    const uri = googleRedirectUri(siteOrigin());
    process.env.NEXT_PUBLIC_SITE_URL = saved;
    check("2. redirect URI is the site origin plus the callback path", uri === REDIRECT, uri);
  }

  {
    const stub = stubFetch({ json: { refresh_token: GRANTED, scope: GOOGLE_SCOPES.join(" ") } });
    const app = googleOAuthApp()!;
    const out = await exchangeCode(app, "the-code", REDIRECT);
    stub.restore();

    const sent = stub.calls[0];
    check(
      "3. code exchange posts the authorization-code grant and returns the token",
      out.refreshToken === GRANTED &&
        sent.url === "https://oauth2.googleapis.com/token" &&
        sent.body.get("grant_type") === "authorization_code" &&
        sent.body.get("code") === "the-code" &&
        sent.body.get("redirect_uri") === REDIRECT &&
        sent.body.get("client_id") === "connproof-client" &&
        sent.body.get("client_secret") === "connproof-secret",
      JSON.stringify(sent),
    );
  }

  {
    // Google omits refresh_token when it already holds a grant for this client.
    const stub = stubFetch({ json: { access_token: "only-an-access-token" } });
    let threw = false;
    try {
      await exchangeCode(googleOAuthApp()!, "the-code", REDIRECT);
    } catch {
      threw = true;
    }
    stub.restore();
    check("4. a grant without a refresh token raises rather than storing nothing", threw);
  }

  {
    const stub = stubFetch({ json: {} });
    await revokeRefreshToken(GRANTED);
    stub.restore();
    check(
      "5. revoke posts the token to Google's revoke endpoint",
      stub.calls[0]?.url === "https://oauth2.googleapis.com/revoke" &&
        stub.calls[0]?.body.get("token") === GRANTED,
      JSON.stringify(stub.calls[0]),
    );
  }

  console.log("\nEncrypted storage\n");

  {
    const cipher = encryptToken(GRANTED);
    check("6. an encrypted token round-trips", decryptToken(cipher) === GRANTED, cipher);
  }

  {
    const a = encryptToken(GRANTED);
    const b = encryptToken(GRANTED);
    check(
      "7. the stored value is not the token, and repeats differ (fresh IV)",
      !a.includes(GRANTED) && !b.includes(GRANTED) && a !== b,
    );
  }

  {
    const cipher = encryptToken(GRANTED);
    // Flip a character of the ciphertext body.
    const parts = cipher.split(".");
    parts[3] = (parts[3][0] === "A" ? "B" : "A") + parts[3].slice(1);
    const tampered = decryptToken(parts.join("."));

    const savedSecret = process.env.AUTH_SECRET;
    process.env.AUTH_SECRET = "a-different-secret";
    const foreign = decryptToken(cipher);
    process.env.AUTH_SECRET = savedSecret;

    // And the connection built on top of an unreadable column must be absent,
    // not an exception thrown into the middle of a visitor's chat.
    await prisma.profile.update({ where: { id: 1 }, data: { googleRefreshToken: "not-a-ciphertext" } });
    const conn = await googleConnection();

    check(
      "8. tampered, foreign, and junk stored values all resolve to not-connected",
      tampered === null && foreign === null && conn === null,
      `tampered=${tampered} foreign=${foreign} conn=${conn}`,
    );
  }

  console.log("\nResolution precedence\n");

  await saveGoogleRefreshToken(GRANTED);

  {
    process.env.GOOGLE_REFRESH_TOKEN = "from-the-environment";
    const conn = await googleConnection();
    const status = await connectionStatus();
    process.env.GOOGLE_REFRESH_TOKEN = "";
    check(
      "9. the environment's refresh token wins over the stored one",
      conn?.refreshToken === "from-the-environment" && status.fromEnvironment,
      conn?.refreshToken,
    );
  }

  {
    const conn = await googleConnection();
    check(
      "10. the stored token is used when the environment is blank, with the configured calendar",
      conn?.refreshToken === GRANTED && conn?.calendarId === "connproof-calendar",
      JSON.stringify(conn),
    );
  }

  {
    const savedId = process.env.GOOGLE_CLIENT_ID;
    process.env.GOOGLE_CLIENT_ID = "";
    const conn = await googleConnection();
    const status = await connectionStatus();
    process.env.GOOGLE_CLIENT_ID = savedId;
    check(
      "11. no client credentials means not connected, stored token or not",
      conn === null && !status.connected && !status.appConfigured,
    );
  }

  console.log("\nThe seam with booking\n");

  await prisma.profile.update({
    where: { id: 1 },
    data: {
      bookingEnabled: true,
      bookingTz: "UTC",
      bookingMinutes: 30,
      bookingLeadHours: 0,
      bookingDays: 2,
      bookingBufferMinutes: 0,
      bookingHours: JSON.stringify({ sun: [["09:00", "17:00"]], mon: [["09:00", "17:00"]], tue: [["09:00", "17:00"]] }),
    },
  });

  {
    resetBookingCache();
    resetTokenCache();
    // The client is injected so no request leaves the process; what is being
    // proved is that the *token resolution* now says yes, which is what
    // bookingLive() reports and what the slots depend on.
    const live = await bookingLive();
    const view = await listOpenSlots({ client: fakeCalendar(), now: NOW });
    check(
      "12. a stored token alone makes booking live and offers slots",
      live && view.connected && view.slots.length > 0,
      `live=${live} connected=${view.connected} slots=${view.slots.length}`,
    );
  }

  {
    const stub = stubFetch({ json: {} });
    await disconnectGoogleCalendar();
    stub.restore();
    const profile = await getProfile();
    const conn = await googleConnection();
    check(
      "13. disconnect clears the stored token and revokes the grant",
      conn === null &&
        profile.googleRefreshToken === "" &&
        profile.googleConnectedAt === null &&
        stub.calls[0]?.url === "https://oauth2.googleapis.com/revoke",
      `stored="${profile.googleRefreshToken}"`,
    );
  }

  {
    resetBookingCache();
    resetTokenCache();
    // No client injected this time: with no token to resolve, the service must
    // build none and reach Google not at all. A recording fetch proves it.
    const stub = stubFetch({ json: {} });
    const live = await bookingLive();
    const view = await listOpenSlots({ now: NOW });
    stub.restore();
    check(
      "14. after disconnecting, booking reports not-connected with zero slots and no Google call",
      !live && !view.connected && view.slots.length === 0 && stub.calls.length === 0,
      `live=${live} connected=${view.connected} slots=${view.slots.length} fetches=${stub.calls.length}`,
    );
  }

  console.log("\nCallback safety\n");

  {
    const state = newOAuthState();
    check(
      "15. state must match exactly — mismatched, missing and empty are all refused",
      oAuthStateMatches(state, state) &&
        !oAuthStateMatches(state, newOAuthState()) &&
        !oAuthStateMatches(state, null) &&
        !oAuthStateMatches(undefined, state) &&
        !oAuthStateMatches(state, ""),
    );
  }

  {
    const state = newOAuthState();
    const q = (over: Record<string, string> = {}) =>
      new URLSearchParams({ state, code: "the-code", ...over });
    const decide = (over: Partial<Parameters<typeof decideCallback>[0]> = {}) =>
      decideCallback({ authed: true, appConfigured: true, issuedState: state, params: q(), ...over });

    check(
      "16. a signed-out caller is sent to sign in, and never reaches the exchange",
      decide({ authed: false }).action === "signin",
    );

    check(
      "17. a mismatched, absent, or never-issued state refuses before the code is read",
      decide({ params: q({ state: newOAuthState() }) }).action === "refuse" &&
        decide({ issuedState: undefined }).action === "refuse" &&
        (decide({ params: q({ state: "" }) }) as { reason?: string }).reason === "state-mismatch",
    );

    const denied = decide({ params: q({ error: "access_denied" }) });
    check(
      "18. Google's own refusal is passed through, not swallowed",
      denied.action === "refuse" && (denied as { reason: string }).reason === "access_denied",
      JSON.stringify(denied),
    );

    const noCode = decideCallback({
      authed: true,
      appConfigured: true,
      issuedState: state,
      params: new URLSearchParams({ state }),
    });
    check(
      "19. a callback carrying no code refuses rather than exchanging nothing",
      noCode.action === "refuse" && (noCode as { reason: string }).reason === "no-code",
    );

    const ok = decide();
    check(
      "20. only an authed caller with the issued state and a code reaches the exchange",
      ok.action === "exchange" && (ok as { code: string }).code === "the-code",
      JSON.stringify(ok),
    );
  }

  console.log("\nCleanup\n");

  await cleanup(original);
  const after = await getProfile();
  check(
    "21. the Profile's Google and booking columns are back to their starting values",
    after.googleRefreshToken === original.googleRefreshToken &&
      after.bookingEnabled === original.bookingEnabled &&
      after.bookingHours === original.bookingHours,
  );

  console.log(`\n${failures === 0 ? "ALL ASSERTIONS PASS" : `${failures} ASSERTION(S) FAILED`}\n`);
  await prisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

async function cleanup(original: {
  googleRefreshToken: string;
  googleConnectedAt: Date | null;
  bookingEnabled: boolean;
  bookingTz: string;
  bookingMinutes: number;
  bookingLeadHours: number;
  bookingDays: number;
  bookingBufferMinutes: number;
  bookingHours: string;
}) {
  await prisma.profile.update({
    where: { id: 1 },
    data: {
      googleRefreshToken: original.googleRefreshToken,
      googleConnectedAt: original.googleConnectedAt,
      bookingEnabled: original.bookingEnabled,
      bookingTz: original.bookingTz,
      bookingMinutes: original.bookingMinutes,
      bookingLeadHours: original.bookingLeadHours,
      bookingDays: original.bookingDays,
      bookingBufferMinutes: original.bookingBufferMinutes,
      bookingHours: original.bookingHours,
    },
  });
}

main().catch((e) => {
  console.error("Proof run errored:", e);
  process.exit(1);
});
