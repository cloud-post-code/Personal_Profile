import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma, getProfile } from "@/lib/db";
import { googleOAuthApp, revokeRefreshToken, type GoogleConfig } from "@/lib/google";

/**
 * Where the Google refresh token lives, and which one wins.
 *
 * The token used to be an environment variable pasted in by hand after running
 * a CLI script. It is now granted from the Booking tab's Connect button, which
 * means it has to be *written* at runtime — and an environment variable cannot
 * be. So it goes in the database, on the Profile singleton.
 *
 * That raises a bar the env var cleared for free: a database backup is a much
 * more casual artifact than a secrets store, and this token can write to Blake's
 * calendar and email his contacts. So it is encrypted at rest with a key derived
 * from AUTH_SECRET — which the deployment already has and the database does not.
 * Rotating AUTH_SECRET therefore invalidates the connection; that is a click to
 * fix, and is much the better failure of the two.
 *
 * Precedence is environment first. A deploy that already sets
 * GOOGLE_REFRESH_TOKEN keeps behaving exactly as it did, and the variable stays
 * an escape hatch when the browser flow can't be reached.
 */

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
/** Versioned so the format can change without silently misreading old rows. */
const PREFIX = "v1";

function key(): Buffer {
  // AUTH_SECRET is an arbitrary-length string; AES-256 needs exactly 32 bytes.
  return createHash("sha256").update(process.env.AUTH_SECRET || "dev-insecure-secret-change-me").digest();
}

/** `v1.<iv>.<authTag>.<ciphertext>`, all base64url. */
export function encryptToken(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [PREFIX, iv, cipher.getAuthTag(), ct].map(b64).join(".");
}

/**
 * The plaintext, or null for anything that isn't ours: empty, malformed, an
 * older format, tampered with, or encrypted under a different AUTH_SECRET.
 * Never throws — an unreadable token means "not connected", and the caller
 * treats that exactly like never having connected at all.
 */
export function decryptToken(stored: string): string | null {
  const parts = stored.split(".");
  if (parts.length !== 4 || parts[0] !== PREFIX) return null;
  try {
    const decipher = createDecipheriv(ALGORITHM, key(), unb64(parts[1]));
    decipher.setAuthTag(unb64(parts[2]));
    const out = Buffer.concat([decipher.update(unb64(parts[3])), decipher.final()]);
    return out.toString("utf8") || null;
  } catch {
    // GCM authentication failed: wrong key, or the ciphertext was edited.
    return null;
  }
}

function b64(v: Buffer | string): string {
  return typeof v === "string" ? v : v.toString("base64url");
}

function unb64(v: string): Buffer {
  return Buffer.from(v, "base64url");
}

/**
 * The credentials booking should use, or null when it cannot book at all.
 * Null covers every missing piece — no OAuth app, no grant, an unreadable
 * stored token — because callers must fail closed on all of them identically.
 */
export async function googleConnection(): Promise<GoogleConfig | null> {
  const app = googleOAuthApp();
  if (!app) return null;

  const fromEnv = (process.env.GOOGLE_REFRESH_TOKEN ?? "").trim();
  const refreshToken = fromEnv || (await storedRefreshToken());
  if (!refreshToken) return null;

  return { ...app, refreshToken };
}

export async function googleConnected(): Promise<boolean> {
  return (await googleConnection()) !== null;
}

/** What the Booking tab needs to render its connection panel. */
export type ConnectionStatus = {
  /** Client id and secret are present, so the Connect button can work. */
  appConfigured: boolean;
  connected: boolean;
  /** True when the token comes from the environment: nothing to disconnect. */
  fromEnvironment: boolean;
  connectedAt: Date | null;
};

export async function connectionStatus(): Promise<ConnectionStatus> {
  const app = googleOAuthApp();
  const fromEnv = !!(process.env.GOOGLE_REFRESH_TOKEN ?? "").trim();
  const profile = await getProfile();
  const stored = decryptToken(profile.googleRefreshToken);
  return {
    appConfigured: app !== null,
    connected: app !== null && (fromEnv || !!stored),
    fromEnvironment: fromEnv,
    connectedAt: stored ? profile.googleConnectedAt : null,
  };
}

async function storedRefreshToken(): Promise<string | null> {
  const profile = await getProfile();
  return decryptToken(profile.googleRefreshToken);
}

/** Persist a freshly granted token. Called only from the OAuth callback. */
export async function saveGoogleRefreshToken(refreshToken: string, now = new Date()): Promise<void> {
  await getProfile();
  await prisma.profile.update({
    where: { id: 1 },
    data: { googleRefreshToken: encryptToken(refreshToken), googleConnectedAt: now },
  });
}

/**
 * Forget the token here and hand the grant back to Google. Local first: if the
 * revoke call fails, Blake is still disconnected, which is what he asked for.
 */
export async function disconnectGoogleCalendar(): Promise<void> {
  const token = await storedRefreshToken();
  await getProfile();
  await prisma.profile.update({
    where: { id: 1 },
    data: { googleRefreshToken: "", googleConnectedAt: null },
  });
  if (!token) return;
  try {
    await revokeRefreshToken(token);
  } catch {
    // Already revoked, or Google is unreachable. Either way we're done here.
  }
}

/**
 * The CSRF nonce for one consent round trip. Issued into an httpOnly cookie
 * before the redirect and required to come back unchanged, so a callback URL
 * someone else got Blake's browser to visit cannot plant a token.
 */
export function newOAuthState(): string {
  return randomBytes(24).toString("base64url");
}

export function oAuthStateMatches(issued: string | undefined, returned: string | null): boolean {
  if (!issued || !returned) return false;
  const a = Buffer.from(issued);
  const b = Buffer.from(returned);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** What the callback should do about one inbound request. */
export type CallbackDecision =
  | { action: "signin" }
  | { action: "refuse"; reason: string }
  | { action: "exchange"; code: string };

/**
 * Every gate the callback applies, as one pure function.
 *
 * This is the security-critical half of the flow — the half that decides
 * whether a request that reached a public URL gets to write a calendar
 * credential — and inside a route handler it would only be reachable through a
 * live authenticated HTTP session. Kept separate, it is exercised directly, and
 * the route below it does nothing but carry out the verdict.
 */
export function decideCallback(input: {
  authed: boolean;
  appConfigured: boolean;
  issuedState: string | undefined;
  params: URLSearchParams;
}): CallbackDecision {
  if (!input.authed) return { action: "signin" };

  // Blake pressed Cancel, or Google refused. Its word for why is worth keeping.
  const denied = input.params.get("error");
  if (denied) return { action: "refuse", reason: denied };

  if (!oAuthStateMatches(input.issuedState, input.params.get("state"))) {
    return { action: "refuse", reason: "state-mismatch" };
  }

  if (!input.appConfigured) return { action: "refuse", reason: "no-client-credentials" };

  const code = input.params.get("code");
  if (!code) return { action: "refuse", reason: "no-code" };

  return { action: "exchange", code };
}
