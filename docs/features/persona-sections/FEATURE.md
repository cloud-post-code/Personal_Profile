# Persona sections (high-fidelity persona + agent behaviors)

## Goal
Replace the ad-hoc persona fields in the admin (`overview`, `persona`,
`values`, `tone`) with a structured persona built from two templates:

- **High-Fidelity Persona Template** — who the persona is.
- **Agent Behaviors Template** — how the persona behaves.

Every section of those templates gets its own labeled text box in the admin,
and the filled sections become the persona core of the chatbot's system prompt.

## Scope
1. **Section catalogue** — `lib/persona.ts` is the single source of truth: two
   groups (`persona`, `behaviors`) of sections, each with a stable `key`,
   `label`, `hint` (the template's sub-prompts), and textarea size. Adding or
   renaming a section happens here only; the admin form, the save action, and
   the prompt builder all iterate the catalogue.
2. **Storage** — one new `Profile.personaSections` column holding a JSON map of
   `section key -> text` (Postgres `@db.Text`; provider must stay
   `postgresql` — Railway constraint). No column-per-section: sections are
   editorial content, not queried fields.
3. **Admin: two tabs** — the single "Persona & Theme" tab splits into:
   - **Persona** — tagline plus one textarea per template section, grouped
     under "Persona" and "Agent behaviors" headings; one form, one save.
   - **Theme** — the aesthetic description plus the existing `ThemePicker`
     (fonts, colors, corners, size, weight); one form, one save.
4. **Prompt** — `buildSystemPrompt()` renders the non-empty persona sections
   as the PERSONA block, replacing the old
   `VOICE & WORLDVIEW` / `Overview:` / `Values:` lines. Empty sections are
   omitted entirely so a half-filled persona never pads the prompt.
5. **Ingestion is out of scope** — auto-filling sections from a document is a
   follow-up. The legacy `persona`/`overview`/`values`/`tone` columns are left
   in the schema (unused) so existing text survives until that pass can map it
   into sections.

## Non-goals
- No per-sub-field inputs (60+ boxes); one box per template `###` section.
- No AI generation/ingestion of section content in this feature.
- No change to Profile, Projects, Knowledge, Photos, Activity, or Contacts.

## Acceptance
- Admin shows separate **Persona** and **Theme** tabs.
- Every catalogue section renders its own textarea, prefilled from storage,
  and saving persists all of them.
- Saving the Theme tab still writes fonts/colors/radius/size/weight (and the
  aesthetic text) exactly as before.
- The chatbot system prompt contains the filled sections under their labels and
  contains no empty section headings.
