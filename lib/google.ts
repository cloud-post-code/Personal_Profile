import type { Interval } from "@/lib/booking/slots";

/**
 * The Google Calendar boundary: three HTTP calls behind one small interface.
 *
 * No `googleapis` dependency. That package is enormous and exists to wrap
 * hundreds of APIs; this needs a token exchange, a free/busy query and an event
 * insert. The repo already speaks to a REST API with bare `fetch`
 * (lib/github.ts), and this follows it.
 *
 * Authentication is a long-lived **refresh token**, granted by Blake from the
 * Booking tab's Connect button (or, as an escape hatch, by running
 * `node scripts/google-auth.mjs`). Where that token is kept and how it is
 * resolved is lib/googleConnection.ts; this file only knows how to obtain one,
 * spend one, and hand one back. A service account was not an option: the
 * calendar is a personal @gmail.com account, where a robot identity can only be
 * granted access by an explicit share and still could not send invitations as
 * its owner.
 *
 * The scopes are deliberately the two narrowest that do the job. `freebusy`
 * reveals *when* the owner is busy and nothing else — not titles, not guests,
 * not descriptions — and `events` writes. Reading the calendar's contents was
 * never needed, so a leaked token exposes a shape rather than a life.
 */

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.freebusy",
  "https://www.googleapis.com/auth/calendar.events",
] as const;

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const API = "https://www.googleapis.com/calendar/v3";

/**
 * Where Google sends the owner back after consent. Registering a redirect URI
 * is a manual step in the Cloud Console, so this is a constant the admin can
 * display verbatim rather than something derived per environment.
 */
export const GOOGLE_CALLBACK_PATH = "/api/admin/google/callback";

/** Refresh a minute early rather than discover expiry mid-booking. */
const EXPIRY_MARGIN_MS = 60_000;

export type EventDraft = {
  summary: string;
  description: string;
  /** Slot bounds as instants. */
  start: number;
  end: number;
  /** IANA zone written onto the event, so it reads correctly in the owner's UI. */
  timeZone: string;
  guestName: string;
  guestEmail: string;
};

export type BookedEvent = { id: string; meetUrl: string | null };

/**
 * What the booking service needs from Google. The service depends on this and
 * not on the fetch below, so the proof can drive every failure mode — expired
 * token, quota error, per-calendar error, failed insert — without a network.
 */
export type CalendarClient = {
  freeBusy(timeMin: number, timeMax: number): Promise<Interval[]>;
  insertEvent(draft: EventDraft): Promise<BookedEvent>;
};

export type GoogleConfig = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  calendarId: string;
};

/** The OAuth *application* — everything except which account granted access. */
export type GoogleOAuthApp = {
  clientId: string;
  clientSecret: string;
  calendarId: string;
};

/**
 * The client id and secret, from the environment. These identify the app
 * registered in the Cloud Console, not the account: no button can obtain them,
 * so unlike the refresh token they stay environment variables.
 */
export function googleOAuthApp(): GoogleOAuthApp | null {
  const clientId = (process.env.GOOGLE_CLIENT_ID ?? "").trim();
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET ?? "").trim();
  if (!clientId || !clientSecret) return null;
  return {
    clientId,
    clientSecret,
    calendarId: (process.env.GOOGLE_CALENDAR_ID ?? "primary").trim() || "primary",
  };
}

/** The redirect URI to register in the Cloud Console, for a given site origin. */
export function googleRedirectUri(origin: string): string {
  return `${origin.replace(/\/+$/, "")}${GOOGLE_CALLBACK_PATH}`;
}

/**
 * The consent URL. `state` is the CSRF nonce the callback must see come back;
 * it is optional only so the standalone CLI script, which owns its own
 * short-lived loopback listener, can omit it.
 */
export function authorizationUrl(clientId: string, redirectUri: string, state?: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    // Without both of these Google returns an access token and no refresh
    // token, and the refresh token is the entire point of the round trip.
    access_type: "offline",
    prompt: "consent",
  });
  if (state) params.set("state", state);
  return `${AUTH_URL}?${params.toString()}`;
}

/**
 * Trade the callback's one-time code for a refresh token.
 *
 * A grant that carries no refresh token is treated as a failure rather than a
 * quiet success. Google omits it when it already has a live grant for this
 * client, and storing an empty string while telling Blake "connected" would
 * leave booking dead in a way nothing else would ever explain.
 */
export async function exchangeCode(
  app: GoogleOAuthApp,
  code: string,
  redirectUri: string,
): Promise<{ refreshToken: string; scope: string }> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: app.clientId,
      client_secret: app.clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const body = (await res.json().catch(() => ({}))) as {
    refresh_token?: string;
    scope?: string;
    error?: string;
    error_description?: string;
  };

  if (!res.ok) {
    throw new Error(
      `Google rejected the authorization code (${res.status}): ` +
        `${body.error_description ?? body.error ?? "no detail"}`,
    );
  }
  if (!body.refresh_token) {
    throw new Error(
      "Google returned no refresh token. It already has a grant for this app — " +
        "remove it at https://myaccount.google.com/permissions and connect again.",
    );
  }
  return { refreshToken: body.refresh_token, scope: body.scope ?? "" };
}

/**
 * Hand the grant back. Best-effort by design: the caller is disconnecting, and
 * a revoke that fails must not stop the token being forgotten locally.
 */
export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  await fetch(REVOKE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: refreshToken }),
  });
}

/**
 * Access tokens last an hour, so exchanging the refresh token on every request
 * would triple the latency of the card and burn quota for nothing. Cached per
 * process; a redeploy just refreshes early.
 */
let cached: { token: string; expiresAt: number; forRefreshToken: string } | null = null;

export async function accessToken(cfg: GoogleConfig, now = Date.now()): Promise<string> {
  if (cached && cached.forRefreshToken === cfg.refreshToken && now < cached.expiresAt) {
    return cached.token;
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      refresh_token: cfg.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const body = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!res.ok || !body.access_token) {
    // A revoked or expired refresh token is the failure Blake will actually
    // hit (Google expires them for unpublished consent screens), so say so.
    throw new Error(
      `Google token exchange failed (${res.status}): ${body.error_description ?? body.error ?? "no access_token"}. ` +
        `Reconnect Google Calendar from the admin's Booking tab.`,
    );
  }

  const ttl = (body.expires_in ?? 3600) * 1000;
  cached = {
    token: body.access_token,
    expiresAt: now + Math.max(0, ttl - EXPIRY_MARGIN_MS),
    forRefreshToken: cfg.refreshToken,
  };
  return body.access_token;
}

/** Test seam: drops the cached access token between proof runs. */
export function resetTokenCache(): void {
  cached = null;
}

/** The real client. Every method throws on failure — callers must fail closed. */
export function googleCalendarClient(cfg: GoogleConfig): CalendarClient {
  return {
    async freeBusy(timeMin, timeMax) {
      const body = await call<FreeBusyResponse>(cfg, "POST", "/freeBusy", {
        timeMin: new Date(timeMin).toISOString(),
        timeMax: new Date(timeMax).toISOString(),
        items: [{ id: cfg.calendarId }],
      });

      const cal = body.calendars?.[cfg.calendarId];
      // Google reports a bad calendar id or a missing scope *inside* a 200: the
      // response carries an errors array and an empty busy list. Reading that as
      // "free all week" is the single worst thing this feature could do, so it
      // is an exception, not an empty array.
      if (!cal || cal.errors?.length) {
        const reason = cal?.errors?.map((e) => e.reason).join(", ") ?? "calendar missing from response";
        throw new Error(`Google free/busy failed for "${cfg.calendarId}": ${reason}`);
      }

      return (cal.busy ?? [])
        .map((b) => ({ start: Date.parse(b.start), end: Date.parse(b.end) }))
        .filter((b) => Number.isFinite(b.start) && Number.isFinite(b.end) && b.end > b.start);
    },

    async insertEvent(draft) {
      const path =
        `/calendars/${encodeURIComponent(cfg.calendarId)}/events` +
        // sendUpdates=all is what actually emails the visitor an invitation;
        // conferenceDataVersion=1 is what lets the Meet request be honoured.
        `?sendUpdates=all&conferenceDataVersion=1`;

      const body = await call<EventResponse>(cfg, "POST", path, {
        summary: draft.summary,
        description: draft.description,
        start: { dateTime: new Date(draft.start).toISOString(), timeZone: draft.timeZone },
        end: { dateTime: new Date(draft.end).toISOString(), timeZone: draft.timeZone },
        attendees: [{ email: draft.guestEmail, displayName: draft.guestName }],
        conferenceData: {
          createRequest: {
            requestId: crypto.randomUUID(),
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        },
      });

      return { id: body.id ?? "", meetUrl: meetUrlOf(body) };
    },
  };
}

async function call<T>(
  cfg: GoogleConfig,
  method: string,
  path: string,
  payload: unknown,
): Promise<T> {
  const token = await accessToken(cfg);
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Google ${method} ${path} failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

/**
 * The Meet link, if Google issued one. Absence is not fatal: conferencing can be
 * disabled on the account, and a booked meeting without a video link is still a
 * booked meeting.
 */
function meetUrlOf(body: EventResponse): string | null {
  const entry = body.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video");
  return entry?.uri ?? body.hangoutLink ?? null;
}

type FreeBusyResponse = {
  calendars?: Record<string, { busy?: { start: string; end: string }[]; errors?: { reason: string }[] }>;
};

type EventResponse = {
  id?: string;
  hangoutLink?: string;
  conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
};
