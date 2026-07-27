# Proof — Booking card backed by Google Calendar

## Definition Of Done

- The chat can render a booking card, and the model has a `show_booking` tool
  that hydrates through the same path every other card uses.
- Open slots are derived from Blake's **real** Google free/busy, in his
  configured timezone, honouring meeting length, weekly hours, lead time,
  horizon and buffers.
- Booking a slot writes a real Google Calendar event with a Meet link and emails
  the visitor an invite, and records a `Booking` row.
- A slot that is busy, buffered, in the past, inside the lead window, beyond the
  horizon, outside weekly hours, or already booked is never offered — and never
  accepted if submitted directly.
- Every Google failure mode yields zero slots, never all slots.
- Two visitors racing for one slot produce one booking and one clear refusal.
- The write path is rate limited.

## Primary Proof

Type: integration (the value of this feature is entirely in the seam between
slot math, the Google boundary, and the database; unit-testing the slot grid
alone would pass while the endpoint offered busy times)

Command:

```bash
npx tsx docs/features/booking-card/proof.ts
```

Runs against local dev Postgres (`blake-pg`, `DATABASE_URL` from `.env`); the
script loads `.env` itself.

**It makes zero Google API calls and zero Anthropic calls.** The Google boundary
(`lib/google.ts`) is injected as a fake through the same `CalendarClient` type
the real one satisfies, so free/busy responses, token failures, quota errors and
event-insert failures are all exercised deterministically. The slot math, the
service layer, the trust checks, the race guard and the rate limiter are the
real code. Everything it creates is deleted afterwards.

### Assertions (all must pass)

**Timezone and slot math (pure)**

1. **Wall clock → instant** — 09:00 in `America/New_York` on a winter date is
   14:00 UTC, and on a summer date is 13:00 UTC. The grid is DST-correct.
2. **DST day has the right slot count** — the spring-forward Sunday and a normal
   Sunday under identical rules differ by exactly the lost hour's worth of slots.
3. **Day walking crosses DST** — iterating local dates across the transition
   yields consecutive calendar dates with no skip and no repeat.
4. **Grid respects weekly hours** — a Mon/Wed-only rule offers slots on exactly
   those weekdays, and none on Tue/Thu/Sat/Sun.
5. **Grid respects meeting length** — a 09:00–11:00 window at 30 minutes gives
   4 slots, at 45 gives 2 (a partial trailing slot is not offered).
6. **Lead time bites** — nothing earlier than `now + leadHours` is offered.
7. **Horizon bites** — nothing later than `now + days` is offered.
8. **Busy subtraction** — a busy block removes exactly the overlapping slots and
   leaves the adjacent ones.
9. **Buffers widen busy blocks** — a 15-minute buffer removes the slot that
   merely touches a busy block's edge.
10. **Touching is not overlapping** — with zero buffer, a slot ending exactly
    when a busy block starts survives.
11. **Multiple/unsorted/overlapping busy blocks** — subtraction is correct
    regardless of input order and when blocks overlap each other.

**The Google boundary**

12. **Token exchange** — a refresh-token grant posts the right form fields to the
    token endpoint and returns the access token.
13. **Token is cached until near expiry** — two calls in a row perform one token
    exchange; an expired token triggers a refresh.
14. **Scope is least-privilege** — the authorization URL requests exactly
    `calendar.freebusy` and `calendar.events`, and neither `calendar.readonly`
    nor the full `calendar` scope.
15. **freeBusy parses busy blocks** — a real-shaped response becomes intervals.
16. **freeBusy per-calendar errors fail closed** — a response carrying
    `calendars[id].errors` raises rather than reporting "no busy time".
17. **Event insert sends what Google needs** — `sendUpdates=all`,
    `conferenceDataVersion=1`, a `hangoutsMeet` create request, the attendee, and
    start/end carrying Blake's IANA zone.
18. **Meet link is read back** — the Meet URL is extracted from the response, and
    a response without one still books (link is absent, not fatal).

**The service layer**

19. **Disabled means empty** — `bookingEnabled: false` returns no slots and
    reports not-enabled, without calling Google.
20. **Unconfigured means empty** — missing Google credentials return no slots and
    report not-connected, without calling Google.
21. **Google failure means empty** — a throwing client yields zero slots, not the
    unsubtracted grid. *(The fail-closed assertion this whole feature turns on.)*
22. **Existing bookings are subtracted** — a `Booking` row removes its slot even
    when Google's free/busy does not report it.
23. **Booking writes both sides** — a successful booking creates the Google event
    and a `Booking` row carrying the returned event id and Meet URL.
24. **The server rejects an unoffered slot** — a start time that is busy, and one
    that is off-grid by a minute, are both refused with the slot-unavailable
    error and write nothing.
24b. **The write path bypasses the free/busy cache** — two reads share one
    Google call, but a booking forces a second; a slot that became busy in
    Google after the cached read is refused rather than double-booked.
    *(Verified red: without the bypass the stale slot is booked.)*
25. **A failed Google insert releases the claim** — after the insert throws, no
    `Booking` row remains and the slot is offered again.
26. **The race resolves to one winner** — two concurrent bookings of the same
    slot yield exactly one `Booking` row, one Google insert, and one refusal.
27. **Input validation** — blank name, blank email, malformed email, and an
    unparseable start are each refused before any Google call.
28. **Rate limiting bites** — writes past the configured limit are rejected, and
    a different caller is unaffected.

**Wiring**

29. **`show_booking` hydrates** — `hydrate("show_booking")` returns a `booking`
    block, and the tool is declared to the model only when booking is live.
30. **`show_booking` is a valid canned card tool** — it round-trips through
    `saveCannedAnswer`, so a canned answer can draw the booking card.
31. **Cleanup** — every row the proof created is gone and the tables return to
    their starting counts.

## Secondary checks (not proof)

- `npx tsc --noEmit` clean, `npx next lint` clean.
- `~/.claude/scripts/gate`.
- Live verification against the dev server with real Google credentials: the
  card renders real open slots, a test booking appears on the actual calendar
  with a Meet link, and the invite arrives in the visitor's inbox.
