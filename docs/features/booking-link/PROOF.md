# Proof — Booking link on the contact card and as its own card

## Definition Of Done

- `Profile.bookingLink` exists, is editable from the admin Profile tab, and is
  empty by default.
- The `contact` block carries the link when it is set, and `null` when it is
  not — the form itself renders either way.
- A `booking_link` block exists carrying the URL and Blake's name.
- The model is offered `show_booking_link` exactly when the link is set;
  offering is independent of the native booking card's `show_booking`.
- Hydration is guarded: a canned answer naming `show_booking_link` after the
  link is cleared serves its text but draws no card.
- `CARD_TOOLS` lists the tool, so the Answers dropdown can name it.

## Primary Proof

Type: integration (the feature is the seam between the profile row, the tool
offer in the brain, and hydration — a unit test of the block builders alone
would pass while the model was never offered the tool)

Command:

```bash
npx tsx docs/features/booking-link/proof.ts
```

Runs against local dev Postgres (`blake-pg`, `DATABASE_URL` from `.env`); the
script loads `.env` itself. **Zero Anthropic calls**: the model tier is driven
through the injectable `ModelClient`, so the tools actually offered and the
tool-use → card path are both observed without a provider round-trip. The
Profile singleton is mutated and restored; everything else the proof creates is
deleted afterwards.

### Assertions (all must pass)

1. `CARD_TOOLS` includes `show_booking_link`.
2. With the link set and native booking off, the offered tools include
   `show_booking_link` and not `show_booking`.
3. With the link empty, `show_booking_link` is not offered.
4. A canned `show_contact_form` answer yields a contact card carrying the
   trimmed link when set.
5. The same canned answer with the link cleared yields a contact card with
   `bookingLink: null` — the form still renders.
6. A canned `show_booking_link` answer yields a `booking_link` card with the
   URL and the profile name.
7. The same canned answer with the link cleared yields its text and **no**
   card.
8. A fake model call to `show_booking_link` (the tool-use path, not the canned
   path) yields the same `booking_link` card.

## Secondary checks

- Gate (`~/.claude/scripts/gate`): typecheck + lint clean.
- Both cards verified rendering in the browser (contact card's "Book a time
  directly" link and the standalone booking-link card, both carrying the
  configured URL). The admin input lives behind the login; its wiring is the
  `saveProfile` write covered by the proof's round-trip through the profile row.
