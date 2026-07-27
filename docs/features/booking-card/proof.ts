/**
 * Primary proof for booking-card (see PROOF.md).
 * Run: npx tsx docs/features/booking-card/proof.ts
 *
 * Zero Google calls and zero Anthropic calls. Three layers, each driven for
 * real:
 *
 *   - the slot math is pure, so it is exercised directly against fixed instants
 *     including both DST transitions;
 *   - the Google boundary runs against a stubbed `globalThis.fetch`, so the
 *     request it builds and the failure modes it must not swallow are both
 *     observable;
 *   - the service and the brain wiring run against the real local Postgres with
 *     a fake `CalendarClient` injected through the same type the real client
 *     satisfies.
 *
 * The Profile singleton is mutated (it is where booking settings live) and
 * restored in `cleanup()`. Everything else is scoped by the "bookproof" prefix.
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

// Dummy credentials so `googleConfigured()` is true. No request ever reaches
// Google: the boundary tests stub fetch, and the service tests inject a client.
process.env.GOOGLE_CLIENT_ID = "bookproof-client";
process.env.GOOGLE_CLIENT_SECRET = "bookproof-secret";
process.env.GOOGLE_REFRESH_TOKEN = "bookproof-refresh";
process.env.GOOGLE_CALENDAR_ID = "primary";
process.env.BOOKING_RATE_LIMIT = "5";

import { prisma, getProfile } from "@/lib/db";
import {
  slotGrid,
  subtractBusy,
  openSlots,
  zonedToUtc,
  zonedParts,
  parseWeeklyHours,
  type Availability,
  type Interval,
} from "@/lib/booking/slots";
import {
  accessToken,
  authorizationUrl,
  googleCalendarClient,
  resetTokenCache,
  type CalendarClient,
  type EventDraft,
  type GoogleConfig,
} from "@/lib/google";
import {
  listOpenSlots,
  createBooking,
  bookingLive,
  resetBookingCache,
} from "@/lib/booking/service";
import { underWriteLimit, resetBookingGuards } from "@/lib/booking/guard";
import { saveCannedAnswer, deleteCannedAnswer, normalizeQuestion, CARD_TOOLS } from "@/lib/canned";
import { answer, type ModelClient } from "@/lib/brain";
import type { UiBlock } from "@/lib/cards";

let failures = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) console.log(`  PASS  ${name}`);
  else {
    failures++;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const MIN = 60_000;
const HOUR = 60 * MIN;

/** A fixed Monday, so nothing in this proof depends on the day it is run. */
const NOW = Date.parse("2027-01-11T12:00:00.000Z");

const PROOF_EMAIL = "bookproof@example.com";
const PROOF_QUESTION = "bookproof can we talk";
const PROOF_SESSION = "bookproof-session";

// ── Slot-math fixtures ───────────────────────────────────────────────────────

const NINE_TO_FIVE: Availability = {
  tz: "UTC",
  minutes: 30,
  hours: { 0: [[540, 1020]], 1: [[540, 1020]], 2: [[540, 1020]], 3: [[540, 1020]], 4: [[540, 1020]], 5: [[540, 1020]], 6: [[540, 1020]] },
  leadHours: 0,
  days: 2,
  bufferMinutes: 0,
};

function grid(over: Partial<Availability>, now = NOW): Interval[] {
  return slotGrid(now, { ...NINE_TO_FIVE, ...over });
}

// ── A fake Google client ─────────────────────────────────────────────────────

type FakeCalendar = CalendarClient & {
  inserted: EventDraft[];
  busy: Interval[];
  failFreeBusy: boolean;
  failInsert: boolean;
  freeBusyCalls: number;
};

function fakeCalendar(busy: Interval[] = []): FakeCalendar {
  const cal: FakeCalendar = {
    inserted: [],
    busy,
    failFreeBusy: false,
    failInsert: false,
    freeBusyCalls: 0,
    async freeBusy() {
      cal.freeBusyCalls++;
      if (cal.failFreeBusy) throw new Error("free/busy exploded");
      return cal.busy;
    },
    async insertEvent(draft) {
      if (cal.failInsert) throw new Error("insert exploded");
      cal.inserted.push(draft);
      return { id: `evt-${cal.inserted.length}`, meetUrl: "https://meet.google.com/bookproof" };
    },
  };
  return cal;
}

/** Settings written to the Profile for the service-layer scenarios. */
async function useSettings(over: Record<string, unknown> = {}) {
  await getProfile();
  await prisma.profile.update({
    where: { id: 1 },
    data: {
      bookingEnabled: true,
      bookingTz: "UTC",
      bookingTitle: "Intro call",
      bookingMinutes: 30,
      bookingLeadHours: 0,
      bookingDays: 2,
      bookingBufferMinutes: 0,
      bookingHours: JSON.stringify({
        sun: [["09:00", "17:00"]], mon: [["09:00", "17:00"]], tue: [["09:00", "17:00"]],
        wed: [["09:00", "17:00"]], thu: [["09:00", "17:00"]], fri: [["09:00", "17:00"]],
        sat: [["09:00", "17:00"]],
      }),
      ...over,
    },
  });
  resetBookingCache();
}

async function main() {
  const originalProfile = await getProfile();
  const baseBookings = await prisma.booking.count();
  const baseCanned = await prisma.cannedAnswer.count();
  const realFetch = globalThis.fetch;

  try {
    // ══ 1. Timezone and slot math (pure) ══
    console.log("\n1. Timezone and slot math");

    const winter = zonedToUtc("America/New_York", 2027, 1, 15, 9 * 60);
    const summer = zonedToUtc("America/New_York", 2027, 7, 15, 9 * 60);
    check(
      "wall clock -> instant is DST-correct",
      new Date(winter).toISOString() === "2027-01-15T14:00:00.000Z" &&
        new Date(summer).toISOString() === "2027-07-15T13:00:00.000Z",
      `${new Date(winter).toISOString()} / ${new Date(summer).toISOString()}`,
    );

    // 2027-03-14 is spring-forward in the US: 02:00 -> 03:00, so a midnight-to-
    // midnight day is 23 hours. A 00:00-23:59 rule must yield one hour fewer.
    const allDay: Availability = {
      ...NINE_TO_FIVE,
      tz: "America/New_York",
      minutes: 60,
      hours: { 0: [[0, 1439]] },
      days: 1,
    };
    const dstSunday = slotGrid(Date.parse("2027-03-14T05:00:00.000Z"), allDay).length;
    const normalSunday = slotGrid(Date.parse("2027-03-07T05:00:00.000Z"), allDay).length;
    check("DST day loses exactly one slot", dstSunday === normalSunday - 1,
      `dst=${dstSunday} normal=${normalSunday}`);

    // Walk local dates across the transition: no skipped or repeated date.
    const dates: string[] = [];
    for (let i = 0; i < 4; i++) {
      const p = zonedParts(Date.parse("2027-03-13T17:00:00.000Z") + i * 24 * HOUR, "America/New_York");
      dates.push(`${p.year}-${p.month}-${p.day}`);
    }
    check("day walking crosses DST without skipping", new Set(dates).size === 4,
      dates.join(" "));

    const monWed = grid({ hours: { 1: [[540, 660]], 3: [[540, 660]] }, days: 7 });
    const weekdaysSeen = new Set(monWed.map((s) => new Date(s.start).getUTCDay()));
    check("grid respects weekly hours", [...weekdaysSeen].sort().join() === "1,3",
      [...weekdaysSeen].join());

    const twoHourWindow: Partial<Availability> = { hours: { 1: [[540, 660]] }, days: 7, leadHours: 0 };
    check("grid respects meeting length",
      grid({ ...twoHourWindow, minutes: 30 }).length === 4 &&
        grid({ ...twoHourWindow, minutes: 45 }).length === 2,
      `30min=${grid({ ...twoHourWindow, minutes: 30 }).length} 45min=${grid({ ...twoHourWindow, minutes: 45 }).length}`);

    const lead = grid({ leadHours: 24 });
    check("lead time bites", lead.every((s) => s.start >= NOW + 24 * HOUR) && lead.length > 0,
      `${lead.length} slots`);

    const horizon = grid({ days: 1 });
    check("horizon bites", horizon.every((s) => s.end <= NOW + 24 * HOUR) && horizon.length > 0,
      `${horizon.length} slots`);

    // 13:00-14:00 busy on the fixed Monday.
    const busyHour = [{ start: NOW + HOUR, end: NOW + 2 * HOUR }];
    const day = grid({ days: 1 });
    const afterBusy = subtractBusy(day, busyHour, 0);
    check("busy subtraction removes exactly the overlap",
      afterBusy.length === day.length - 2 &&
        afterBusy.some((s) => s.start === NOW + 2 * HOUR) &&
        afterBusy.some((s) => s.end === NOW + HOUR),
      `${day.length} -> ${afterBusy.length}`);

    const buffered = subtractBusy(day, busyHour, 15);
    check("buffers widen busy blocks", buffered.length === day.length - 4,
      `${day.length} -> ${buffered.length}`);

    check("touching is not overlapping",
      subtractBusy([{ start: NOW, end: NOW + HOUR }], [{ start: NOW + HOUR, end: NOW + 2 * HOUR }], 0)
        .length === 1);

    const messy = subtractBusy(day, [
      { start: NOW + 3 * HOUR, end: NOW + 4 * HOUR },
      { start: NOW + HOUR, end: NOW + 2 * HOUR },
      { start: NOW + 90 * MIN, end: NOW + 150 * MIN }, // overlaps the previous
    ], 0);
    check("unsorted and overlapping busy blocks subtract correctly",
      messy.length === day.length - 5 && !messy.some((s) => s.start === NOW + 2 * HOUR),
      `${day.length} -> ${messy.length}`);

    check("malformed weekly hours drop rather than open up",
      Object.keys(parseWeeklyHours({ mon: [["25:00", "26:00"]], tue: [["17:00", "09:00"]], wed: "nope" }))
        .length === 0);

    // ══ 2. The Google boundary ══
    console.log("\n2. The Google boundary");

    const cfg: GoogleConfig = {
      clientId: "cid",
      clientSecret: "secret",
      refreshToken: "refresh-1",
      calendarId: "primary",
    };
    let calls: { url: string; body: string }[] = [];
    let nextBody: unknown = {};
    let nextOk = true;

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), body: String(init?.body ?? "") });
      if (String(input).includes("oauth2")) {
        return new Response(JSON.stringify({ access_token: "at-1", expires_in: 3600 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify(nextBody), {
        status: nextOk ? 200 : 500,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    resetTokenCache();
    const token = await accessToken(cfg, NOW);
    const tokenCall = calls.find((c) => c.url.includes("oauth2"))!;
    check("token exchange posts a refresh_token grant",
      token === "at-1" &&
        tokenCall.body.includes("grant_type=refresh_token") &&
        tokenCall.body.includes("refresh_token=refresh-1"),
      tokenCall.body);

    calls = [];
    await accessToken(cfg, NOW + MIN);
    const cachedCalls = calls.length;
    await accessToken(cfg, NOW + 2 * HOUR);
    check("token is cached until near expiry, then refreshed",
      cachedCalls === 0 && calls.length === 1,
      `cached=${cachedCalls} afterExpiry=${calls.length}`);

    const scope = new URL(authorizationUrl("cid", "http://localhost/cb")).searchParams.get("scope")!;
    check("scope is least-privilege",
      scope.includes("calendar.freebusy") &&
        scope.includes("calendar.events") &&
        !scope.includes("calendar.readonly") &&
        !/auth\/calendar($|\s)/.test(scope),
      scope);

    const client = googleCalendarClient(cfg);
    nextBody = {
      calendars: {
        primary: { busy: [{ start: "2027-01-11T13:00:00Z", end: "2027-01-11T14:00:00Z" }] },
      },
    };
    const parsedBusy = await client.freeBusy(NOW, NOW + 24 * HOUR);
    check("freeBusy parses busy blocks",
      parsedBusy.length === 1 &&
        parsedBusy[0].start === Date.parse("2027-01-11T13:00:00Z") &&
        parsedBusy[0].end === Date.parse("2027-01-11T14:00:00Z"),
      JSON.stringify(parsedBusy));

    nextBody = { calendars: { primary: { busy: [], errors: [{ reason: "notFound" }] } } };
    let freeBusyThrew = false;
    try {
      await client.freeBusy(NOW, NOW + 24 * HOUR);
    } catch {
      freeBusyThrew = true;
    }
    check("freeBusy per-calendar errors fail closed", freeBusyThrew);

    calls = [];
    nextBody = {
      id: "evt-real",
      conferenceData: { entryPoints: [{ entryPointType: "video", uri: "https://meet.google.com/xyz" }] },
    };
    const booked = await client.insertEvent({
      summary: "Intro call — Ada",
      description: "note",
      start: NOW,
      end: NOW + 30 * MIN,
      timeZone: "America/New_York",
      guestName: "Ada",
      guestEmail: "ada@example.com",
    });
    const insertCall = calls.find((c) => c.url.includes("/events"))!;
    const sent = JSON.parse(insertCall.body);
    check("event insert sends what Google needs",
      insertCall.url.includes("sendUpdates=all") &&
        insertCall.url.includes("conferenceDataVersion=1") &&
        sent.conferenceData.createRequest.conferenceSolutionKey.type === "hangoutsMeet" &&
        sent.attendees[0].email === "ada@example.com" &&
        sent.start.timeZone === "America/New_York" &&
        sent.end.dateTime === new Date(NOW + 30 * MIN).toISOString(),
      insertCall.url);

    nextBody = { id: "evt-nolink" };
    const noLink = await client.insertEvent({
      summary: "x", description: "", start: NOW, end: NOW + MIN,
      timeZone: "UTC", guestName: "A", guestEmail: "a@b.co",
    });
    check("Meet link is read back, and its absence is not fatal",
      booked.meetUrl === "https://meet.google.com/xyz" &&
        noLink.id === "evt-nolink" && noLink.meetUrl === null,
      `${booked.meetUrl} / ${noLink.meetUrl}`);

    globalThis.fetch = realFetch;
    resetTokenCache();

    // ══ 3. The service layer ══
    console.log("\n3. The service layer");

    await useSettings({ bookingEnabled: false });
    const cal = fakeCalendar();
    const disabled = await listOpenSlots({ client: cal, now: NOW });
    check("disabled means empty",
      !disabled.enabled && disabled.slots.length === 0 && cal.inserted.length === 0);

    await useSettings();
    const savedId = process.env.GOOGLE_CLIENT_ID;
    process.env.GOOGLE_CLIENT_ID = "";
    const unconfigured = await listOpenSlots({ now: NOW });
    process.env.GOOGLE_CLIENT_ID = savedId;
    check("unconfigured means empty",
      unconfigured.enabled && !unconfigured.connected && unconfigured.slots.length === 0);

    resetBookingCache();
    const angry = fakeCalendar();
    angry.failFreeBusy = true;
    const failed = await listOpenSlots({ client: angry, now: NOW });
    check("Google failure means empty, never the unsubtracted grid",
      failed.slots.length === 0 && !failed.connected,
      `${failed.slots.length} slots`);

    // Baseline: 12:00 on the fixed Monday, 09:00-17:00 daily, 30min, 2 days.
    resetBookingCache();
    const open = await listOpenSlots({ client: fakeCalendar(), now: NOW });
    const firstSlot = open.slots[0];
    check("open slots come back as instants in Blake's configured shape",
      open.enabled && open.connected && open.timezone === "UTC" && open.minutes === 30 &&
        firstSlot.start === new Date(NOW).toISOString(),
      `${open.slots.length} slots, first=${firstSlot?.start}`);

    // An existing Booking row must remove its slot even when Google is silent.
    const secondSlot = open.slots[1];
    await prisma.booking.create({
      data: {
        name: "Prior", email: PROOF_EMAIL,
        startsAt: new Date(secondSlot.start), endsAt: new Date(secondSlot.end),
      },
    });
    resetBookingCache();
    const withPrior = await listOpenSlots({ client: fakeCalendar(), now: NOW });
    check("existing bookings are subtracted even when Google doesn't report them",
      !withPrior.slots.some((s) => s.start === secondSlot.start) &&
        withPrior.slots.length === open.slots.length - 1,
      `${open.slots.length} -> ${withPrior.slots.length}`);
    await prisma.booking.deleteMany({ where: { email: PROOF_EMAIL } });

    // The read path may serve a cached free/busy; the write path must not.
    // A meeting created in Google seconds ago is invisible to the cache, and
    // the unique constraint only guards this site's own bookings — so a stale
    // read here is a double-booking, not a stale render.
    resetBookingCache();
    const cacheProbe = fakeCalendar();
    await listOpenSlots({ client: cacheProbe, now: NOW });
    await listOpenSlots({ client: cacheProbe, now: NOW });
    const afterReads = cacheProbe.freeBusyCalls;
    cacheProbe.busy = [{ start: NOW, end: NOW + HOUR }]; // taken in Google, just now
    const staleAttempt = await createBooking(
      { name: "A", email: PROOF_EMAIL, start: firstSlot.start },
      { client: cacheProbe, now: NOW },
    );
    check("the write path bypasses the free/busy cache",
      afterReads === 1 &&
        cacheProbe.freeBusyCalls === 2 &&
        !staleAttempt.ok && staleAttempt.code === "unavailable" &&
        cacheProbe.inserted.length === 0,
      `reads=${afterReads} total=${cacheProbe.freeBusyCalls} result=${staleAttempt.ok ? "booked" : staleAttempt.code}`);
    await prisma.booking.deleteMany({ where: { email: PROOF_EMAIL } });

    resetBookingCache();
    const writer = fakeCalendar();
    const result = await createBooking(
      { name: "Ada Lovelace", email: PROOF_EMAIL, note: "hello", start: firstSlot.start, guestTz: "Europe/London" },
      { client: writer, now: NOW },
    );
    const row = await prisma.booking.findFirst({ where: { email: PROOF_EMAIL } });
    check("booking writes both sides",
      result.ok === true &&
        writer.inserted.length === 1 &&
        writer.inserted[0].guestEmail === PROOF_EMAIL &&
        writer.inserted[0].summary === "Intro call — Ada Lovelace" &&
        writer.inserted[0].timeZone === "UTC" &&
        row?.googleEventId === "evt-1" &&
        row?.meetUrl === "https://meet.google.com/bookproof" &&
        row?.guestTz === "Europe/London",
      JSON.stringify({ ok: result.ok, inserted: writer.inserted.length, event: row?.googleEventId }));
    await prisma.booking.deleteMany({ where: { email: PROOF_EMAIL } });

    // Busy time and an off-grid minute must both be refused.
    resetBookingCache();
    const guarded = fakeCalendar([{ start: NOW, end: NOW + HOUR }]);
    const onBusy = await createBooking(
      { name: "A", email: PROOF_EMAIL, start: firstSlot.start },
      { client: guarded, now: NOW },
    );
    resetBookingCache();
    const offGrid = await createBooking(
      { name: "A", email: PROOF_EMAIL, start: new Date(NOW + MIN).toISOString() },
      { client: fakeCalendar(), now: NOW },
    );
    check("the server rejects an unoffered slot",
      !onBusy.ok && onBusy.code === "unavailable" &&
        !offGrid.ok && offGrid.code === "unavailable" &&
        guarded.inserted.length === 0 &&
        (await prisma.booking.count({ where: { email: PROOF_EMAIL } })) === 0,
      JSON.stringify({ onBusy, offGrid }));

    resetBookingCache();
    const broken = fakeCalendar();
    broken.failInsert = true;
    const insertFailed = await createBooking(
      { name: "A", email: PROOF_EMAIL, start: firstSlot.start },
      { client: broken, now: NOW },
    );
    resetBookingCache();
    const reoffered = await listOpenSlots({ client: fakeCalendar(), now: NOW });
    check("a failed Google insert releases the claim",
      !insertFailed.ok && insertFailed.code === "failed" &&
        (await prisma.booking.count({ where: { email: PROOF_EMAIL } })) === 0 &&
        reoffered.slots.some((s) => s.start === firstSlot.start));

    resetBookingCache();
    const racer = fakeCalendar();
    const [a, b] = await Promise.all([
      createBooking({ name: "A", email: PROOF_EMAIL, start: firstSlot.start }, { client: racer, now: NOW }),
      createBooking({ name: "B", email: PROOF_EMAIL, start: firstSlot.start }, { client: racer, now: NOW }),
    ]);
    check("the race resolves to exactly one winner",
      [a.ok, b.ok].filter(Boolean).length === 1 &&
        racer.inserted.length === 1 &&
        (await prisma.booking.count({ where: { email: PROOF_EMAIL } })) === 1,
      JSON.stringify({ a: a.ok, b: b.ok, inserted: racer.inserted.length }));
    await prisma.booking.deleteMany({ where: { email: PROOF_EMAIL } });

    resetBookingCache();
    const rejector = fakeCalendar();
    const invalid = await Promise.all([
      createBooking({ name: "", email: PROOF_EMAIL, start: firstSlot.start }, { client: rejector, now: NOW }),
      createBooking({ name: "A", email: "", start: firstSlot.start }, { client: rejector, now: NOW }),
      createBooking({ name: "A", email: "not-an-email", start: firstSlot.start }, { client: rejector, now: NOW }),
      createBooking({ name: "A", email: PROOF_EMAIL, start: "whenever" }, { client: rejector, now: NOW }),
    ]);
    check("input validation refuses before any Google call",
      invalid.every((r) => !r.ok && r.code === "invalid") && rejector.inserted.length === 0,
      JSON.stringify(invalid.map((r) => (r.ok ? "ok" : r.code))));

    resetBookingGuards();
    const allowed = [1, 2, 3, 4, 5].map(() => underWriteLimit("10.0.0.1"));
    check("rate limiting bites",
      allowed.every(Boolean) && !underWriteLimit("10.0.0.1") && underWriteLimit("10.0.0.2"));

    // ══ 4. Wiring ══
    console.log("\n4. Wiring into the chat");

    check("show_booking is a valid canned card tool", CARD_TOOLS.includes("show_booking" as never));

    await useSettings();
    check("bookingLive is true when switched on and connected", await bookingLive());
    await useSettings({ bookingEnabled: false });
    check("bookingLive is false when switched off", !(await bookingLive()));

    // A canned answer naming show_booking drives the real hydrate() path with
    // no model in the loop — the same trick the A2A proof uses.
    await useSettings();
    await saveCannedAnswer({
      question: PROOF_QUESTION,
      answer: "Sure — grab a time.",
      cardTool: "show_booking",
      enabled: true,
    });
    const liveCards = await collect(PROOF_QUESTION);
    check("a canned answer hydrates a booking card",
      liveCards.some((c) => c.type === "booking"),
      JSON.stringify(liveCards.map((c) => c.type)));

    await useSettings({ bookingEnabled: false });
    const offCards = await collect(PROOF_QUESTION);
    check("the booking card is withheld once booking is switched off",
      !offCards.some((c) => c.type === "booking"),
      JSON.stringify(offCards.map((c) => c.type)));

    // The model is only told the tool exists when it can actually book. The
    // fake client answers with no tool_use, so nothing else runs.
    const toolsWhenOff = await toolNames();
    await useSettings();
    const toolsWhenOn = await toolNames();
    check("show_booking is offered to the model only when booking is live",
      !toolsWhenOff.includes("show_booking") &&
        toolsWhenOn.includes("show_booking") &&
        toolsWhenOn.includes("show_contact_form"),
      `off=[${toolsWhenOff}] on=[${toolsWhenOn}]`);
  } finally {
    await cleanup(originalProfile);
    globalThis.fetch = realFetch;

    check("bookings cleaned up", (await prisma.booking.count()) === baseBookings,
      `${baseBookings} -> ${await prisma.booking.count()}`);
    check("canned answers cleaned up", (await prisma.cannedAnswer.count()) === baseCanned,
      `${baseCanned} -> ${await prisma.cannedAnswer.count()}`);
    await prisma.$disconnect();
  }

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log("\nAll proof assertions passed");
}

/** Run one canned question through the real brain and collect its cards. */
async function collect(question: string): Promise<UiBlock[]> {
  const cards: UiBlock[] = [];
  for await (const event of answer({ message: question, sessionId: PROOF_SESSION })) {
    if (event.t === "card") cards.push(event.v);
  }
  return cards;
}

/**
 * The tool names the brain hands the model. Driven with a fake client that
 * returns an empty message, so the loop reads the params and stops — zero
 * Anthropic calls, and the real TOOLS assembly is what is observed.
 */
async function toolNames(): Promise<string[]> {
  let seen: string[] = [];
  const client: ModelClient = {
    messages: {
      stream(params) {
        seen = (params.tools ?? []).map((t) => t.name);
        return {
          async *[Symbol.asyncIterator]() {},
          async finalMessage() {
            return { content: [] };
          },
        };
      },
    },
  };
  for await (const _ of answer(
    { message: "bookproof uncanned question", sessionId: PROOF_SESSION },
    { client },
  )) {
    void _;
  }
  return seen;
}

async function cleanup(original: { bookingEnabled: boolean; bookingTz: string; bookingTitle: string; bookingMinutes: number; bookingLeadHours: number; bookingDays: number; bookingBufferMinutes: number; bookingHours: string }) {
  await prisma.booking.deleteMany({ where: { email: PROOF_EMAIL } });

  const canned = await prisma.cannedAnswer.findUnique({
    where: { matchKey: normalizeQuestion(PROOF_QUESTION) },
  });
  if (canned) await deleteCannedAnswer(canned.id);

  // answer() logs every turn; drop the session this proof opened.
  await prisma.chatSession
    .delete({ where: { visitorKey: PROOF_SESSION } })
    .catch(() => {});

  await prisma.profile.update({
    where: { id: 1 },
    data: {
      bookingEnabled: original.bookingEnabled,
      bookingTz: original.bookingTz,
      bookingTitle: original.bookingTitle,
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
