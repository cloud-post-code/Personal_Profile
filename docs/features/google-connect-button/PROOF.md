# Proof — Connect Google Calendar from the admin

## Definition Of Done

- A refresh token obtained through the browser OAuth callback is persisted and
  is what the booking service subsequently books with.
- The stored token is encrypted at rest: the database column is not the token.
- `GOOGLE_REFRESH_TOKEN` in the environment takes precedence over the stored
  token, so existing deploys are unaffected.
- Disconnecting clears the stored token, and booking goes back to reporting
  not-connected.
- The callback refuses a request whose `state` does not match the one issued,
  and stores nothing.
- The consent URL asks for exactly the two existing scopes, offline access, and
  a forced consent prompt (without which Google returns no refresh token).
- Every resolution failure — no client credentials, no token, an unreadable
  ciphertext — yields *not connected*, never a crash and never open slots.

## Primary Proof

Type: integration (the feature is a seam — OAuth boundary, encrypted storage,
and the booking service's notion of "connected" — and each half passes in
isolation while the seam is wrong)

Command:

```bash
npx tsx docs/features/google-connect-button/proof.ts
```

Runs against local dev Postgres (`blake-pg`, `DATABASE_URL` from `.env`); the
script loads `.env` itself.

**It makes zero Google API calls.** The token endpoint and the revoke endpoint
are driven through a stubbed `globalThis.fetch`, so the exact form fields sent
to Google, the refresh-token-missing case, and revocation are all observable.
The `Profile` singleton's Google columns are mutated and restored in `cleanup()`.

### Assertions (all must pass)

**The OAuth boundary**

1. **Consent URL is least-privilege and refresh-bearing** — it requests exactly
   `calendar.freebusy` and `calendar.events`, `access_type=offline`,
   `prompt=consent`, the given redirect URI, and carries the `state` it was
   given.
2. **Redirect URI is derived from the site origin** — it is the configured
   public origin plus the callback path, with no double slash.
3. **Code exchange posts the authorization-code grant** — the request carries
   `grant_type=authorization_code`, the code, the redirect URI, and the client
   id/secret, and returns the refresh token.
4. **A grant without a refresh token is an error, not a silent success** —
   Google returning only an access token raises, because storing nothing while
   reporting success is the failure that would leave booking quietly dead.
5. **Revoke posts the token to Google's revoke endpoint.**

**Encrypted storage**

6. **Round-trip** — a saved token reads back identical.
7. **The column is not the token** — the stored ciphertext does not contain the
   plaintext, and encrypting the same token twice yields different ciphertext
   (a fresh IV each time).
8. **A tampered or foreign ciphertext resolves to not-connected** — a mutated
   value and a value encrypted under a different `AUTH_SECRET` both fail to
   decrypt, and the connection reports absent rather than throwing.

**Resolution precedence**

9. **Env wins** — with both set, the environment's refresh token is the one used.
10. **Stored token is used when env is blank** — and carries the configured
    calendar id.
11. **No client credentials means not connected** — even with a stored token.

**The seam with booking**

12. **A stored token alone makes booking live** — with `bookingEnabled` on and
    nothing in the environment, `bookingLive()` is true and `listOpenSlots()`
    reports `connected: true` and offers slots against an injected client.
13. **Disconnect clears the token and revokes the grant** — the column empties,
    `googleConnectedAt` clears, and the revoke endpoint is called.
14. **Disconnecting flips booking back** — with no client injected, the service
    then reports `connected: false` with zero slots and makes no HTTP call at
    all, rather than building a client around a token it doesn't have.

**Callback safety**

15. **State must match** — `oAuthStateMatches` accepts only the state that was
    issued, and rejects a different one, a missing one, and an empty one.
16. **A signed-out caller never reaches the exchange** — it is sent to sign in,
    whatever else the URL carries.
17. **A bad state refuses before the code is read** — mismatched, empty, and
    never-issued all refuse with `state-mismatch`.
18. **Google's own refusal is passed through** — `?error=access_denied` becomes
    that reason on the Booking tab, not a generic failure.
19. **No code means no exchange.**
20. **Only an authed caller with the issued state and a code reaches the
    exchange** — the one path that is allowed to write a credential.
21. **Cleanup** — the Profile's Google columns are restored to their starting
    values.

## Secondary checks (not proof)

- `npx tsc --noEmit` clean, `npx next lint` clean.
- `~/.claude/scripts/gate`.
- `docs/features/booking-card/proof.ts` still green (the booking feature's own
  contract must survive the change to how a token is resolved).
- Live click-through: with real client credentials, Connect on the Booking tab
  reaches Google's consent screen and returns to a connected tab.
