/**
 * Slot math for the booking card. Pure: no database, no network, no `Date.now()`
 * that isn't handed in. Everything here is a function of its arguments, which is
 * why it can be tested exhaustively against DST boundaries that would otherwise
 * only be discovered by a visitor booking an hour that doesn't exist.
 *
 * Two representations, never mixed:
 *   - an **instant** is epoch milliseconds (what the API and the database speak);
 *   - a **wall clock** is a year/month/day/hour/minute reading that only means
 *     something alongside an IANA zone (what Blake's working hours are).
 * `zonedToUtc` and `zonedParts` are the only crossings between them.
 */

export type Interval = { start: number; end: number };

/** Minutes-from-midnight window, e.g. 09:00–17:00 is [540, 1020]. */
export type Window = [number, number];

/** Windows per weekday, indexed the way `Date.getUTCDay()` counts: 0 = Sunday. */
export type WeeklyHours = Record<number, Window[]>;

export type Availability = {
  tz: string;
  /** Meeting length in minutes; also the grid step. */
  minutes: number;
  hours: WeeklyHours;
  /** Hours of notice before the earliest offered slot. */
  leadHours: number;
  /** How many days ahead to offer. */
  days: number;
  /** Gap enforced either side of a busy block, in minutes. */
  bufferMinutes: number;
};

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const MINUTE = 60_000;

/**
 * How far `tz` is from UTC at this instant, in ms. Derived by asking `Intl` to
 * render the instant in `tz` and reading the difference back, which is the only
 * way to get at the tz database from stock JS.
 */
function offsetAt(instant: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));

  const f: Record<string, number> = {};
  for (const p of parts) if (p.type !== "literal") f[p.type] = Number(p.value);
  // `hour12: false` renders midnight as 24 in some ICU versions.
  const asUtc = Date.UTC(f.year, f.month - 1, f.day, f.hour % 24, f.minute, f.second);
  return asUtc - instant;
}

/** The wall-clock reading of an instant in `tz`, plus its weekday. */
export function zonedParts(
  instant: number,
  tz: string,
): { year: number; month: number; day: number; hour: number; minute: number; weekday: number } {
  const shifted = instant + offsetAt(instant, tz);
  const d = new Date(shifted);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    weekday: d.getUTCDay(),
  };
}

/**
 * The instant whose wall clock in `tz` reads the given date and time.
 *
 * Two passes, and the second is not decoration: the offset that applies at the
 * answer can differ from the offset at the first guess, which is exactly what
 * happens on the two days a year a DST transition falls between them. Times in
 * the hour that DST skips have no instant; they resolve forward, which is the
 * conventional reading and is unreachable here anyway because such a slot would
 * be inside the gap Google also refuses to schedule in.
 */
export function zonedToUtc(
  tz: string,
  year: number,
  month: number,
  day: number,
  minutesFromMidnight = 0,
): number {
  const wall = Date.UTC(year, month - 1, day) + minutesFromMidnight * MINUTE;
  const first = wall - offsetAt(wall, tz);
  return wall - offsetAt(first, tz);
}

/**
 * Parse the stored `{mon:[["09:00","17:00"]]}` shape. Anything unreadable is
 * dropped rather than guessed at: a malformed window must remove availability,
 * never invent it.
 */
export function parseWeeklyHours(raw: unknown): WeeklyHours {
  const out: WeeklyHours = {};
  if (!raw || typeof raw !== "object") return out;
  const src = raw as Record<string, unknown>;

  for (let weekday = 0; weekday < 7; weekday++) {
    const day = src[DAY_KEYS[weekday]];
    if (!Array.isArray(day)) continue;
    const windows: Window[] = [];
    for (const entry of day) {
      if (!Array.isArray(entry) || entry.length < 2) continue;
      const from = parseClock(entry[0]);
      const to = parseClock(entry[1]);
      if (from === null || to === null || to <= from) continue;
      windows.push([from, to]);
    }
    if (windows.length) out[weekday] = windows.sort((a, b) => a[0] - b[0]);
  }
  return out;
}

/** "09:30" → 570. Null for anything that isn't a real time of day. */
function parseClock(raw: unknown): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(raw ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Serialize back to the stored shape, for the admin form. */
export function formatWeeklyHours(hours: WeeklyHours): Record<string, string[][]> {
  const out: Record<string, string[][]> = {};
  for (let weekday = 0; weekday < 7; weekday++) {
    const windows = hours[weekday];
    if (windows?.length) {
      out[DAY_KEYS[weekday]] = windows.map(([a, b]) => [clockOf(a), clockOf(b)]);
    }
  }
  return out;
}

function clockOf(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/**
 * Every slot the rules allow between `now + leadHours` and `now + days`, before
 * any busy time is taken out. Walks *calendar dates* in `tz` rather than adding
 * 24h at a time, because a DST day is 23 or 25 hours long and stepping by a
 * fixed day would drift the working hours across the transition.
 */
export function slotGrid(now: number, a: Availability): Interval[] {
  const length = a.minutes * MINUTE;
  if (length <= 0 || a.days <= 0) return [];

  const earliest = now + Math.max(0, a.leadHours) * 60 * MINUTE;
  const horizon = now + Math.max(0, a.days) * 24 * 60 * MINUTE;
  if (horizon <= earliest) return [];

  const slots: Interval[] = [];
  const first = zonedParts(earliest, a.tz);
  // One extra date: the horizon can land inside a local day the earliest date
  // does not cover, and a day is cheap to generate and free to filter.
  for (let i = 0; i <= a.days + 1; i++) {
    const date = new Date(Date.UTC(first.year, first.month - 1, first.day + i));
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const day = date.getUTCDate();

    for (const [from, to] of a.hours[date.getUTCDay()] ?? []) {
      const windowStart = zonedToUtc(a.tz, year, month, day, from);
      const windowEnd = zonedToUtc(a.tz, year, month, day, to);
      for (let start = windowStart; start + length <= windowEnd; start += length) {
        if (start < earliest || start + length > horizon) continue;
        slots.push({ start, end: start + length });
      }
    }
  }
  return slots.sort((x, y) => x.start - y.start);
}

/**
 * The slots that survive the busy list. Busy blocks are widened by the buffer on
 * both sides first, so a slot that merely abuts a meeting is removed while a
 * slot separated by real breathing room is kept.
 *
 * Touching is not overlapping: with a zero buffer, a slot ending at exactly the
 * instant a meeting begins is still offered. That is the correct reading of a
 * half-open interval, and getting it backwards would silently delete a usable
 * slot from every working day.
 */
export function subtractBusy(
  slots: Interval[],
  busy: Interval[],
  bufferMinutes = 0,
): Interval[] {
  if (!busy.length) return slots;
  const pad = Math.max(0, bufferMinutes) * MINUTE;
  const blocks = busy
    .map((b) => ({ start: b.start - pad, end: b.end + pad }))
    .filter((b) => b.end > b.start)
    .sort((a, b) => a.start - b.start);

  return slots.filter((slot) => !blocks.some((b) => slot.start < b.end && b.start < slot.end));
}

/** The open slots: the grid, less everything already spoken for. */
export function openSlots(now: number, a: Availability, busy: Interval[]): Interval[] {
  return subtractBusy(slotGrid(now, a), busy, a.bufferMinutes);
}
