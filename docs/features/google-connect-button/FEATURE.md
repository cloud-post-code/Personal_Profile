# Connect Google Calendar from the admin, not the terminal

## Problem

Booking works, but turning it on does not. The Booking tab currently tells Blake
to "set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET, then run
`node scripts/google-auth.mjs` and paste the refresh token into
GOOGLE_REFRESH_TOKEN". That is a five-step terminal errand that ends in editing
a production environment variable, and it has to be repeated every time Google
expires or revokes the grant. The one person who needs to do it is the person
sitting in front of the admin dashboard.

## What to build

A **Connect Google Calendar** button on the Booking tab that runs the OAuth
consent flow in the browser and stores the resulting refresh token itself.

- Signed in as admin, clicking Connect goes to Google's consent screen, and
  approving lands back on the Booking tab with the calendar connected. No
  terminal, no copy-paste, no redeploy.
- The token is stored on the `Profile` singleton, **encrypted at rest** with
  `AUTH_SECRET`. A database dump must not hand over write access to the
  calendar.
- `GOOGLE_REFRESH_TOKEN` in the environment still wins when set, so existing
  deploys keep working untouched and the CLI script remains a valid escape
  hatch.
- **Disconnect** removes the stored token and revokes the grant at Google.
- The scopes are unchanged: `calendar.freebusy` + `calendar.events`. This
  feature moves where a token comes from; it does not widen what the token can
  do.

## Constraints

- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` stay environment variables. They
  identify the OAuth *application*, are set once in Google Cloud Console, and
  are not something a button can obtain. When they are absent the tab shows the
  console setup steps — including the exact redirect URI to register — instead
  of a button that cannot work.
- The callback is admin-only and CSRF-protected with a `state` parameter held in
  an httpOnly cookie. An unauthenticated or unmatched callback stores nothing.
- Booking must keep failing closed. Every path that cannot resolve a token
  yields zero slots, never an unsubtracted grid.

## Implementation Routing

Required skills: `coding-frontend` (admin UI is Next.js App Router).

## Out of scope

- Multi-account or multi-calendar connection. One owner, one calendar.
- Reading calendar contents. The freebusy scope is deliberate.
- Replacing the admin password gate with Google sign-in. This authorizes the
  *site's access to Blake's calendar*; it is not the admin login.
