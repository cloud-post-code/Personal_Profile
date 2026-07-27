# Persona knowledge entries (parse the persona into one entry per claim)

## Goal
When the persona is saved, parse the paragraph into the distinct things it
claims and index each one as its own knowledge entry, instead of indexing the
whole paragraph as a single blob.

## Why
The persona is one paragraph making many separate claims — what Blake builds,
how he decides, what he distrusts, how he sounds. Indexed whole it is one
origin with one chunk, so it competes for a retrieval slot on the *average* of
everything it says: a visitor asking narrowly about how he works is matched (or
missed) on the whole paragraph. It also gives the graph a single edge owner
called "Persona", so there is no way to know which claim asserted which
relation.

Splitting gives each claim its own chunk, its own embedding, its own entity
extraction, and its own edge ownership.

This does **not** change what the chatbot is told about itself. The full
paragraph already ships verbatim in the always-on PERSONA block
(`lib/knowledge.ts:66`) and still does; these entries only change what is
retrievable and what the graph knows.

## Scope
1. **Splitter** — `lib/personaFacts.ts`: one Claude call returning
   `{"facts":[{"topic","text"}]}`. `topic` (2-5 words) becomes the retrieval
   citation label; `text` is the claim, prompted to be self-contained because
   it will be retrieved without the surrounding paragraph. `sanitizeFacts`
   trusts nothing about the shape — bare arrays, missing keys, non-strings,
   duplicate topics, and over-long lists are all coerced or dropped.
   `FactClient`/`FactDeps` narrow the SDK so a proof can inject a fake, and
   `PersonaIndexOpts.split` replaces the whole splitter so a proof exercising
   something else (`universal-knowledge-index`) can index the persona as one
   origin without a model call.
2. **One origin per claim** — `indexPersona` writes
   `persona` / `fact:<slug>` origins labeled `Persona — <topic>`. `originId` is
   free-form and carries no unique constraint, so this is the same mechanism
   projects and photos already use (`origins.ts:64`).
3. **Sweep** — `sweepPersonaOrigins` drops every persona origin the pass didn't
   write. Required, not optional: `indexOrigin` only replaces the id it is
   handed, and `retrieve()` scans the whole chunk table with no origin filter
   (`search.ts:48`), so a claim removed from the paragraph would otherwise keep
   its chunks and its graph edges and go on being fed to the model as fact. It
   lives in `indexPersona` rather than the admin action so
   `scripts/reindex.ts --all` and `indexEverything` are swept too.
4. **Failure is a downgrade, never an error** — no `ANTHROPIC_API_KEY`, a
   refusal, malformed JSON, or a paragraph under `MIN_SPLIT_CHARS` (200) all
   return `[]`, and the paragraph is indexed whole under the single `persona`
   origin exactly as before. The admin save path is unchanged and still
   best-effort via `reindex()` (`actions.ts:214`).
5. **Cost is capped** — `MAX_FACTS` (8) is a spend limit, not a style rule:
   every entry costs one embedding request and one Claude entity-extraction call
   on *every* save (`indexer.ts:141`), plus 21s of pacing in a full reindex
   (`origins.ts:142`).

## Non-goals
- No new table and no admin UI for the entries. They are index artifacts,
  rebuilt from the paragraph on every save, so there is no second copy of the
  truth to keep in sync.
- No change to the always-on PERSONA block, to `personaPromptBlock`, or to the
  persona storage format.
- No change to `retrieve()`. Persona text can already appear both in the
  always-on block and in retrieved context; splitting raises the volume of that
  overlap but does not introduce it. Filtering persona out of retrieval is a
  separate decision — see Follow-ups.
- No backfill. Existing prod persona chunks stay as one origin until the next
  save or reindex.

## Acceptance
- Saving a persona longer than 200 chars produces one `fact:<slug>` origin per
  claim, each labeled `Persona — <topic>`, and no `persona` whole-paragraph
  origin.
- Saving again with fewer claims deletes the orphaned origins' chunks and
  retracts their graph edges.
- **Rewriting the persona leaves none of the previous text ingested anywhere.**
  After a save, no chunk under `originKind: "persona"` contains text from the
  replaced paragraph, and the replaced claims own no graph edges. This covers
  the upgrade case too: the single `persona` origin written before this feature
  existed is swept on the first save or reindex.
- With the splitter unavailable or failing, exactly one `persona` origin exists
  containing the full paragraph.
- Emptying the persona leaves zero persona chunks.
- `buildSystemPrompt()` still contains the full paragraph verbatim.

## Follow-ups
- Persona chunks now get more independent chances to win a retrieval seed slot
  and consume more of the 6000-char budget, duplicating text the model already
  has in the always-on block. Excluding `originKind === "persona"` from
  `retrieve()` would fix it, but would break
  `docs/features/universal-knowledge-index/proof.ts:148`, which asserts persona
  text is retrievable. Worth deciding deliberately rather than as a side effect.
- `docs/features/universal-knowledge-index/FEATURE.md:24` and the
  `prisma/schema.prisma:52-54` comment both still describe persona as a
  singleton origin id.
