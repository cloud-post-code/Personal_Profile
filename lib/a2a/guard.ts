import { a2aApiKey } from "./card";

/**
 * The two things that stand between a public A2A endpoint and a surprise
 * Anthropic bill.
 *
 * Publishing an Agent Card is an invitation: any agent that finds the card is
 * meant to be able to call the endpoint, and every call it makes spends model
 * credits. So the endpoint is open by default (that's the point) but rate
 * limited always, and can be closed entirely with one env var.
 */

/** Requests allowed per IP per minute. `A2A_RATE_LIMIT=0` disables the limit. */
function limitPerMinute(): number {
  const raw = Number.parseInt(process.env.A2A_RATE_LIMIT ?? "", 10);
  return Number.isFinite(raw) && raw >= 0 ? raw : 30;
}

const WINDOW_MS = 60_000;
const hits = new Map<string, { count: number; resetAt: number }>();

/**
 * In-memory because it only has to be good enough to stop a runaway loop, and
 * because a shared store would put a database round-trip in front of every
 * request to save a fraction of a cent. On a multi-instance deploy each
 * instance limits independently — deliberately accepted.
 */
export function underRateLimit(ip: string): boolean {
  const limit = limitPerMinute();
  if (limit === 0) return true;

  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now >= entry.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    if (hits.size > 5_000) sweep(now); // bound the map against churning IPs
    return true;
  }
  entry.count += 1;
  return entry.count <= limit;
}

function sweep(now: number): void {
  for (const [key, entry] of hits) if (now >= entry.resetAt) hits.delete(key);
}

export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}

/**
 * True when the caller may proceed. With no `A2A_API_KEY` configured the agent
 * is public and everyone may; with one configured, the bearer token must match
 * the scheme the Agent Card advertises.
 */
export function isAuthorized(headers: Headers): boolean {
  const key = a2aApiKey();
  if (!key) return true;
  const header = headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token === key;
}
