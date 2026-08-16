# Feature — Contacts from sent mail

## What

The address book gains a second way to fill: an incremental sync that derives
contacts from Blake's Gmail **sent** folder. People he has emailed become
`AddressBookEntry` rows, enriched with what the mail says about the
relationship.

Sent mail only. Someone who emailed Blake but was never emailed back is not a
contact — the outbound direction is the signal that a relationship exists.

### Connecting

Authorization happens **in the admin dashboard**, not in a shell script and
not as a Railway variable. Contacts → Connect Gmail → Google consent → back to
the dashboard, connected. The refresh token is stored in Postgres
(`GmailAuth`, a fixed-id singleton), so re-consent after a revoked or expired
grant is a button click rather than a redeploy.

A **separate OAuth client** from the calendar integration
(`GOOGLE_GMAIL_CLIENT_ID` / `GOOGLE_GMAIL_CLIENT_SECRET`). Google issues one
refresh token per client covering all consented scopes; sharing a client would
mean a Gmail re-consent could replace the token the booking flow depends on.
Two clients make that collision impossible.

Scope is `gmail.readonly`, chosen deliberately: message bodies are what make
the relationship notes worth having. `gmail.metadata` would restrict this to
subjects and frequency.

### Syncing

A **Sync** button, manual — matching every other ingestion path in this repo,
which runs inside an admin button press. No scheduler exists here and this
does not add one.

Sync is incremental. `GmailAuth.lastSyncedAt` is the cursor: each run reads
messages whose `internalDate` is newer, and the first run — no cursor — reads
everything. The cursor advances **only after a fully successful pass**, so a
failure re-reads a window rather than silently skipping it.

### Deriving contacts

`lib/gmail/contacts.ts` is the testable core, pure functions over parsed
messages:

- `recipientsOf(message)` — every `To`/`Cc`/`Bcc` address, parsed with
  `mailparser` rather than a regex. The header grammar allows quoted display
  names, RFC 2047 encoded words, and group syntax; a regex gets these wrong.
- `isIngestable(address)` — the robot filter. `noreply@`, `no-reply@`,
  `donotreply@`, `support@`, `notifications@`, `mailer-daemon@`, and a
  suppressed-domain list. Without it a sent-mail address book is mostly
  transactional senders.
- `canonicalize(address)` — the identity key. Lowercase both parts; fold dots
  and `+tags` **only** for `@gmail.com` / `@googlemail.com`, where Google
  guarantees they are one mailbox. Applying that folding generally would merge
  distinct humans: `john.smith@company.com` and `johnsmith@company.com` are
  routinely different employees, including on Workspace custom domains.
- `pickName(variants)` — the display name seen **most often** for an address,
  not the most recent. The same person appears as `Jane`, `jane doe`,
  `Doe, Jane`, `Jane Doe (Acme)`; frequency is a better signal than recency.
  Trailing parenthetical org tags are stripped. Falls back to the local part
  when no display name ever appears.

Email is the identity, name is an attribute of it. Two addresses are two
contacts even under one name; one address under three spellings is one
contact.

### Relationship notes

One Claude call per contact per sync, following `lib/retrieval/entities.ts`:
prompt builder exported separately from the call so it is testable without a
model, injectable client so proofs cost nothing, strict-JSON parse in a
try/catch, a `sanitize` layer that coerces and caps every field, and a safe
empty result on any failure. A failed note never fails the sync — the contact
is still written with its counts and dates.

Input is subjects, message count, first/last contact dates, and truncated body
excerpts.

**Bodies reach the model and are never stored.** Only the derived note is
written, to `AddressBookEntry.details`. Raw message text does not enter
Postgres. With `gmail.readonly` granted, this keeps the durable blast radius
to the token itself.

### Enrichment on re-sync

A contact matched by `canonicalEmail` is updated, not duplicated:
`messageCount` accumulates, `lastContacted` extends, and the note is re-derived
from the new material and **appended** under a dated heading. Hand-written
`details` are never overwritten — an admin edit outlives every future sync.

`trust` is never set automatically. Ingested contacts land at `public` and
Blake promotes them; a tier means "how much do I trust this person" and mail
volume does not answer that.

## Why

The address book is hand-curated, so it holds only the people Blake remembered
to type in. His sent folder already knows who he actually corresponds with,
when it started, and how often.

## Out of scope

- **Sending email.** Nothing in this feature sends anything. The public
  contact form still only writes a `Contact` row.
- **Inbound mail.** Sent folder only, by design.
- **Scheduled sync.** Manual button; no cron, no queue.
- **Cross-address identity merging.** Only an exact `canonicalEmail` match
  merges. Same-name-different-domain (a job change) is a real signal but not a
  certain one, and two addresses appearing as separate recipients of one
  message is strong evidence they are two people. Suggested merges belong with
  the existing `MergeDismissal` machinery, as their own feature.
- **Enforcement of trust tiers.** Unchanged: recorded, not enforced.
- **Phone numbers.** Mail headers do not carry them.
- **The orphaned `Contact` inbox.** `toggleContactHandled` and `deleteContact`
  have had no call sites since the Activity → Contacts panel was removed.
  Deliberately left alone.

## Notes

`TRUST_TIERS` (`public | co-worker | close-friend | personal`) and
`CLASSIFICATIONS` (`public | contact | close-friends | personal`) render the
same four labels under different slugs. This feature does not unify them; it
adds `lib/addressBook.ts` `TRUST_FROM_CLASSIFICATION` so the mapping is
explicit in one place rather than assumed at each call site.

`saveAddressBookEntry` returns `void` and silently no-ops on a blank name.
Ingestion needs to report why a contact was skipped, so it moves to the
`Promise<string | null>` error-string signature `saveIngestionSource` already
uses.
