# Proof — Index everything into the knowledge graph

## Primary proof command
```
npx tsx docs/features/universal-knowledge-index/proof.ts
```
Runs against the local dev Postgres (`blake-pg`, from `.env` `DATABASE_URL`);
the script loads `.env` itself. It snapshots the Profile row, seeds throwaway
projects/photos/sources/chat rows (ids prefixed `uniproof`), exercises the real
indexing and retrieval path, asserts, then restores the profile and deletes
everything it made. Entity extraction is stubbed so the proof does not depend
on live Claude output.

## Assertions (all must pass)
1. **Profile indexed** — after `indexProfile()`, chunks exist with
   `originKind === "profile"`, and a distinctive phrase from the bio is
   retrievable via `retrieve()`.
2. **Persona indexed** — `indexPersona()` produces `originKind === "persona"`
   chunks containing a distinctive phrase from a filled persona section.
3. **Project indexed** — `indexProject(id)` produces `originKind === "project"`
   chunks labelled with the project name; the detail text is retrievable.
4. **Photo indexed** — `indexPhoto(id)` produces `originKind === "photo"`
   chunks carrying the description.
5. **Activity is approval-gated** — indexing an assistant message rated `null`
   or `"down"` produces no chunks; the same message rated `"up"` produces an
   `originKind === "activity"` chunk. This is the injection boundary.
6. **Cross-origin entity linking** — an entity named in the profile text and in
   a separate source resolves to ONE entity row whose mentions span both
   origins.
7. **Re-index is idempotent** — running an origin's indexer twice does not
   duplicate its chunks, and re-indexing one origin does not touch another's.
8. **Drop removes only that origin** — `dropOrigin()` deletes that origin's
   chunks and leaves every other origin intact.
9. **Prompt slimmed** — `buildSystemPrompt(query)` no longer contains the full
   bio text or a project's blurb verbatim in the static section, but DOES
   contain every project id (so `show_project` still works) and the persona.
10. **Retrieval cites the origin** — a retrieved profile chunk is labelled
    `Profile`, not a source title.
11. **Cleanup** — chunk/entity/mention counts return to their pre-run baseline
    and the Profile row is restored byte-for-byte.

## Red expectation
Before implementation the script fails at import time:
`lib/retrieval/origins.ts` does not exist.

## Secondary checks (not proof)
- `npx tsc --noEmit` clean.
- `$HOME/.claude/scripts/gate` PASS.
- Graph tab shows a per-origin breakdown in the running app.
