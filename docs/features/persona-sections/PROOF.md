# Proof — Persona sections

## Primary proof command
```
npx tsx docs/features/persona-sections/proof.ts
```
Runs against the local dev Postgres (`blake-pg`, from `.env` `DATABASE_URL`);
the script loads `.env` itself. It snapshots the real Profile row, writes
throwaway section text through the real save path, asserts, and restores the
snapshot.

## Assertions (all must pass)
1. **Catalogue integrity** — `PERSONA_SECTIONS` is exactly one field, its key
   is unique and form-safe (`[a-z0-9_]+`), it has a label, hint, and size, and
   `PERSONA_BLURB` is a single non-empty paragraph.
2. **Round-trip** — `writePersonaSections()` persists a map of
   `key -> text` and `safePersonaSections()` reads it back exactly; unknown
   keys in stored JSON are dropped and missing keys read as `""`.
3. **Malformed storage** — `safePersonaSections()` on `""`, `"not json"`, and
   `"[1,2]"` returns an all-empty map instead of throwing.
4. **Legacy fold-forward** — text stored under the retired 21-section
   catalogue reads back inside the single field with its section labels
   intact, and a filled `persona` field takes precedence over it.
5. **Prompt render** — with the field filled, `buildSystemPrompt()` contains
   the text verbatim and no `### Persona` or `## Agent behaviors` headings.
6. **Empty persona** — `personaPromptBlock("{}")` is `""` so the caller can
   fall back, and the retired `VOICE & WORLDVIEW` heading is gone.
7. **Restore** — the Profile row is returned to its pre-proof state.

## Red expectation
Before implementation the script fails at import time (`lib/persona` does not
exist and `Profile.personaSections` is not a column).

## Secondary checks (not proof)
- `npx next lint` clean on touched files.
- `npx tsc --noEmit` clean.
- `$HOME/.claude/scripts/gate` PASS.
- Admin verified live in the browser: Persona and Theme tabs, save + reload.
