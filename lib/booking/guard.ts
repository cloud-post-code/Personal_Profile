/**
 * How often one caller may write to Blake's calendar.
 *
 * The read path is cheap and cached; the write path puts an event on a real
 * calendar and sends a real person an email. Left open, a loop could fill every
 * slot for the next fortnight and spam an inbox doing it, so the budget here is
 * small and measured in hours, not the per-minute allowance the A2A endpoint
 * uses. The read path gets a looser limit purely to blunt scraping.
 *
 * In-memory, like the A2A guard, and for the same reason: it only has to stop a
 * runaway loop, and a shared store would put a database round-trip in front of
 * every request. On a multi-instance deploy each instance limits independently —
 * deliberately accepted, since the unique constraint on `Booking.startsAt` is
 * what actually protects the calendar from double-booking.
 */

const WRITE_WINDOW_MS = 60 * 60_000;
const READ_WINDOW_MS = 60_000;

/** Bookings per IP per hour. `BOOKING_RATE_LIMIT=0` disables the limit. */
function writeLimit(): number {
  const raw = Number.parseInt(process.env.BOOKING_RATE_LIMIT ?? "", 10);
  return Number.isFinite(raw) && raw >= 0 ? raw : 5;
}

const writes = new Map<string, { count: number; resetAt: number }>();
const reads = new Map<string, { count: number; resetAt: number }>();

export function underWriteLimit(ip: string): boolean {
  const limit = writeLimit();
  if (limit === 0) return true;
  return bump(writes, ip, WRITE_WINDOW_MS) <= limit;
}

export function underReadLimit(ip: string): boolean {
  return bump(reads, ip, READ_WINDOW_MS) <= 60;
}

function bump(
  store: Map<string, { count: number; resetAt: number }>,
  key: string,
  windowMs: number,
): number {
  const now = Date.now();
  const entry = store.get(key);
  if (!entry || now >= entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    if (store.size > 5_000) sweep(store, now); // bound it against churning IPs
    return 1;
  }
  entry.count += 1;
  return entry.count;
}

function sweep(store: Map<string, { count: number; resetAt: number }>, now: number): void {
  for (const [key, entry] of store) if (now >= entry.resetAt) store.delete(key);
}

/** Test seam: clears the in-memory counters between proof runs. */
export function resetBookingGuards(): void {
  writes.clear();
  reads.clear();
}
