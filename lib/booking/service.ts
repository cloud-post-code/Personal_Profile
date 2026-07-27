import { prisma, getProfile } from "@/lib/db";
import { safeJson } from "@/lib/util";
import {
  googleCalendarClient,
  googleConfig,
  type CalendarClient,
} from "@/lib/google";
import {
  openSlots,
  parseWeeklyHours,
  type Availability,
  type Interval,
} from "@/lib/booking/slots";

/**
 * Booking, end to end: what is open, and claiming one of it.
 *
 * Everything here fails closed. Booking off, Google not configured, the token
 * rejected, free/busy erroring, the network down — each yields *no slots*. The
 * one outcome this feature must never produce is offering a time Blake is
 * already busy, and the easiest way to produce it is to treat a failure as an
 * empty busy list. So there is no `catch { return grid }` anywhere below.
 */

export type SlotView = { start: string; end: string };

export type SlotsResult = {
  /** Blake switched it on. */
  enabled: boolean;
  /** Google credentials are present and answered. */
  connected: boolean;
  /** Blake's IANA zone, so the card can say whose morning this is. */
  timezone: string;
  minutes: number;
  slots: SlotView[];
};

export type BookInput = {
  name: string;
  email: string;
  note?: string;
  /** ISO-8601 instant of the chosen slot's start. */
  start: string;
  /** The visitor's IANA zone, recorded so Blake can read their local time. */
  guestTz?: string;
};

export type BookResult =
  | { ok: true; start: string; end: string; meetUrl: string | null; timezone: string }
  | { ok: false; error: string; code: "invalid" | "unavailable" | "unconfigured" | "failed" };

export type BookingDeps = {
  /** Injected in tests; the real client is built from env when absent. */
  client?: CalendarClient;
  now?: number;
};

type Settings = Availability & { enabled: boolean; title: string };

async function settings(): Promise<Settings> {
  const p = await getProfile();
  return {
    enabled: p.bookingEnabled,
    title: p.bookingTitle || "Intro call",
    tz: p.bookingTz || "UTC",
    minutes: p.bookingMinutes,
    hours: parseWeeklyHours(safeJson<unknown>(p.bookingHours, {})),
    leadHours: p.bookingLeadHours,
    days: p.bookingDays,
    bufferMinutes: p.bookingBufferMinutes,
  };
}

/**
 * Free/busy, cached briefly for the READ path only. A card that renders on
 * every "can we talk?" would otherwise put a Google round-trip in front of
 * every visitor and eventually meet a quota, and a minute of staleness is
 * invisible when picking a slot next week.
 *
 * The write path passes `fresh` and always asks Google. Serving a cached
 * answer there would mean a meeting created in Google within the last minute
 * is invisible, and its slot would be handed out and double-booked — the
 * unique constraint below only guards against this site's own bookings, not
 * against events that arrived from somewhere else. One extra API call per
 * booking is a trivial price for that not happening.
 */
const FREEBUSY_TTL_MS = 60_000;
let busyCache: { key: string; at: number; busy: Interval[] } | null = null;

async function busyFor(
  client: CalendarClient,
  from: number,
  to: number,
  now: number,
  fresh: boolean,
): Promise<Interval[]> {
  // The window is quantized to the TTL so successive callers share a key
  // instead of each minting their own and missing the cache every time.
  const key = `${Math.floor(from / FREEBUSY_TTL_MS)}:${Math.floor(to / FREEBUSY_TTL_MS)}`;
  if (!fresh && busyCache && busyCache.key === key && now - busyCache.at < FREEBUSY_TTL_MS) {
    return busyCache.busy;
  }
  const busy = await client.freeBusy(from, to);
  busyCache = { key, at: now, busy };
  return busy;
}

/** Test seam: drops the cached free/busy window between proof runs. */
export function resetBookingCache(): void {
  busyCache = null;
}

/**
 * Whether the booking card can actually book: switched on AND connected. The
 * model is not told the tool exists unless both hold, because a card that
 * cannot produce a single slot is worse than never offering to meet at all.
 */
export async function bookingLive(): Promise<boolean> {
  const p = await getProfile();
  return p.bookingEnabled && googleConfig() !== null;
}

/**
 * The open slots as instants. Also used by the write path, so what is accepted
 * is by construction what was offered — the two can't drift into disagreement.
 * `fresh` forces a live free/busy call; see `busyFor`.
 */
async function computeOpen(
  s: Settings,
  deps: BookingDeps,
  fresh = false,
): Promise<{ slots: Interval[]; connected: boolean }> {
  const now = deps.now ?? Date.now();
  const cfg = googleConfig();
  const client = deps.client ?? (cfg ? googleCalendarClient(cfg) : null);
  if (!client) return { slots: [], connected: false };

  const horizon = now + Math.max(0, s.days) * 24 * 60 * 60_000;

  // Google's busy blocks, plus what this site has already promised. The second
  // is belt-and-braces: a booking written moments ago may not be in a cached
  // free/busy answer yet, and double-booking is the failure that matters.
  const [busy, booked] = await Promise.all([
    busyFor(client, now, horizon, now, fresh),
    prisma.booking.findMany({
      where: { endsAt: { gt: new Date(now) } },
      select: { startsAt: true, endsAt: true },
    }),
  ]);

  const taken = booked.map((b) => ({ start: b.startsAt.getTime(), end: b.endsAt.getTime() }));
  return { slots: openSlots(now, s, [...busy, ...taken]), connected: true };
}

/** What the card asks for when it opens. */
export async function listOpenSlots(deps: BookingDeps = {}): Promise<SlotsResult> {
  const s = await settings();
  const base = { enabled: s.enabled, timezone: s.tz, minutes: s.minutes };

  if (!s.enabled) return { ...base, connected: googleConfig() !== null, slots: [] };

  try {
    const { slots, connected } = await computeOpen(s, deps);
    return { ...base, connected, slots: slots.map(toView) };
  } catch {
    // Fail closed: an unreachable or angry Google means "no times", never
    // "every time". The card renders the same as a fully-booked week.
    return { ...base, connected: false, slots: [] };
  }
}

function toView(i: Interval): SlotView {
  return { start: new Date(i.start).toISOString(), end: new Date(i.end).toISOString() };
}

/** Claim a slot: write the calendar event, invite the visitor, record the row. */
export async function createBooking(
  input: BookInput,
  deps: BookingDeps = {},
): Promise<BookResult> {
  const name = String(input.name ?? "").trim().slice(0, 200);
  const email = String(input.email ?? "").trim().slice(0, 200);
  const note = String(input.note ?? "").trim().slice(0, 2000);
  const guestTz = String(input.guestTz ?? "").trim().slice(0, 64);
  const start = Date.parse(String(input.start ?? ""));

  if (!name || !email) return bad("Your name and email are both required.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return bad("That email doesn't look right.");
  if (!Number.isFinite(start)) return bad("That time couldn't be read.");

  const s = await settings();
  if (!s.enabled) {
    return { ok: false, code: "unconfigured", error: "Booking isn't open right now." };
  }

  let open: Interval[];
  let client: CalendarClient | null;
  try {
    const cfg = googleConfig();
    client = deps.client ?? (cfg ? googleCalendarClient(cfg) : null);
    if (!client) {
      return { ok: false, code: "unconfigured", error: "Booking isn't open right now." };
    }
    // `fresh`: never let a cached answer decide whether a slot is free.
    open = (await computeOpen(s, deps, true)).slots;
  } catch {
    return { ok: false, code: "failed", error: "Couldn't reach the calendar. Try again shortly." };
  }

  // Never trust the submitted time. Being on the wire does not make a slot
  // bookable: it has to be on the grid the rules generate *and* currently free.
  const slot = open.find((o) => o.start === start);
  if (!slot) {
    return { ok: false, code: "unavailable", error: "That time just went. Pick another." };
  }

  // Claim the slot in our own table first. `startsAt` is unique, so of two
  // visitors racing for the same minute exactly one gets past this line — the
  // constraint decides it, not a re-read that could interleave just as badly.
  let bookingId: string;
  try {
    const row = await prisma.booking.create({
      data: {
        name,
        email,
        note,
        guestTz,
        startsAt: new Date(slot.start),
        endsAt: new Date(slot.end),
      },
    });
    bookingId = row.id;
  } catch {
    return { ok: false, code: "unavailable", error: "That time just went. Pick another." };
  }

  try {
    const event = await client.insertEvent({
      summary: `${s.title} — ${name}`,
      description: buildDescription(name, email, note),
      start: slot.start,
      end: slot.end,
      timeZone: s.tz,
      guestName: name,
      guestEmail: email,
    });
    const saved = await prisma.booking.update({
      where: { id: bookingId },
      data: { googleEventId: event.id || null, meetUrl: event.meetUrl },
    });
    // A fresh booking invalidates the cached window immediately, so the next
    // visitor isn't offered the minute that was just taken.
    resetBookingCache();
    return {
      ok: true,
      start: saved.startsAt.toISOString(),
      end: saved.endsAt.toISOString(),
      meetUrl: saved.meetUrl,
      timezone: s.tz,
    };
  } catch {
    // The calendar is the source of truth. If the event didn't land, this row
    // is a lie that would also block the slot forever — release the claim.
    await prisma.booking.delete({ where: { id: bookingId } }).catch(() => {});
    return { ok: false, code: "failed", error: "Couldn't confirm with the calendar. Try again." };
  }
}

function bad(error: string): BookResult {
  return { ok: false, code: "invalid", error };
}

function buildDescription(name: string, email: string, note: string): string {
  const lines = [`Booked from the website chat.`, ``, `${name} <${email}>`];
  if (note) lines.push(``, note);
  return lines.join("\n");
}
