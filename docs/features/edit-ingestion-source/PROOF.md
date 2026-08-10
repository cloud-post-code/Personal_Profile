# Proof — Edit ingestion sources behind the local edit password

## Primary proof command

```
npx tsx docs/features/edit-ingestion-source/proof.ts
```

Local dev Postgres via `.env`; no model calls. The password checks run
against env values the proof sets itself (never the real ones); DB rows use
a `proof-eis-` key prefix and are deleted in a `finally`.

## Assertions (all must pass)

1. **`checkEditPassword` accepts the local `INGESTION_EDIT_PASSWORD`** and
   rejects a wrong one.
2. **Fallback**: with `INGESTION_EDIT_PASSWORD` unset it accepts
   `ADMIN_PASSWORD`; with both empty it accepts nothing.
3. **The edit cookie token is distinct from the admin cookie token** (a
   stolen admin cookie value cannot unlock ingestion edits) and
   `verifyEditToken` accepts only the edit token.
4. **`saveIngestionSource` with an id updates** label, system prompt,
   storage kinds, enabled, and `order` on the existing row (round-trip).
5. **Every Content tab carries the edit link** (source-level): the dashboard
   wraps content panels with an "Edit ingestion" link to
   `/admin/sources/<key>`.
6. **The edit page is double-gated** (source-level): it redirects without
   admin auth, renders the password form when the edit cookie is missing,
   and the update action calls the edit-auth check server-side.
7. **`.env.example` documents `INGESTION_EDIT_PASSWORD`.**

## Red expectation

Before implementation, `lib/ingestionAuth.ts` does not exist — the import
fails and the proof exits non-zero.

## Secondary checks (not proof)

- `npx tsc --noEmit`, `npx next lint`, gate PASS
- Browser: Edit ingestion → password form → unlock → edit → tab strip
  reflects the change.
