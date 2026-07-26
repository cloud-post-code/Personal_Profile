# Persona (one free-prose field)

## Goal
Replace the ad-hoc persona fields in the admin (`overview`, `persona`,
`values`, `tone`) with a single, well-described persona field whose text
becomes the persona core of the chatbot's system prompt.

## Revision — 2026-07-26: 21 sections collapsed to one field
This feature originally shipped 21 labeled text boxes built from two
templates (High-Fidelity Persona, Agent Behaviors). Those templates are
buyer-persona instruments: a large share of their fields (purchasing
approval thresholds, budget-cut tradeoffs, onboarding tolerance, crisis
mode) either don't apply to a personal site or aren't knowable about a real
person without inventing them — and an invented section is worse than a
blank one, because it goes into the prompt with the same authority as a true
one. The form is now one free-prose field described by a single paragraph.

The catalogue shape in `lib/persona.ts` is retained so storage, form, and
prompt stay driven from one place, and so a second field can be added later
without touching the save path.

## Scope
1. **Catalogue** — `lib/persona.ts` is the single source of truth: one
   section (`persona`) with a stable `key`, `label`, `hint`, and textarea
   size, plus `PERSONA_BLURB`, the one-paragraph brief rendered above the
   field. The admin form, the save action, and the prompt builder all iterate
   the catalogue.
2. **Storage** — `Profile.personaSections` holds a JSON map of
   `key -> text` (Postgres `@db.Text`; provider must stay `postgresql` —
   Railway constraint). The map shape is unchanged from the 21-section
   version, so no migration is needed.
3. **Legacy fold-forward** — `safePersonaSections()` drops keys outside the
   catalogue, so text written under the 21 retired keys would otherwise
   disappear from both the admin and the prompt. When the `persona` field is
   empty, the retired sections are joined (label + text) into it on read.
   `LEGACY_SECTIONS` in `lib/persona.ts` is deletable once the live Profile
   row has been saved again.
4. **Admin** — the **Persona** tab is the tagline, the one-paragraph brief,
   and the single textarea; one form, one save. The **Theme** tab is
   unchanged.
5. **Prompt** — `buildSystemPrompt()` renders the field verbatim as the
   PERSONA block. A single field needs no `### label` heading of its own; an
   empty field renders as `""` so the caller falls back.
6. **Ingestion is out of scope** — auto-filling the field from a document or
   from sent email is a follow-up.

## Non-goals
- No per-sub-field inputs; no return to a multi-section form.
- No AI generation/ingestion of the persona text in this feature.
- No change to Profile, Projects, Knowledge, Photos, Activity, or Contacts.

## Acceptance
- The Persona tab shows the tagline, one paragraph of guidance, and exactly
  one textarea, prefilled from storage; saving persists it.
- Persona text written under the old 21-section catalogue still appears in
  the admin and in the prompt after the change.
- The chatbot system prompt contains the field's text verbatim, with no
  section or group headings.
- Saving the Theme tab still writes fonts/colors/radius/size/weight (and the
  aesthetic text) exactly as before.
