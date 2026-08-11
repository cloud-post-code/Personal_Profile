# Proof — Agent Behavior: Goals and Rules pages

## Primary proof command
```
npx tsx docs/features/agent-goals-rules/proof.ts
```
Runs against the local dev Postgres (`DATABASE_URL` from `.env`; the script
loads `.env` itself). It writes throwaway directives through the real save
path, asserts storage and the assembled system prompt, then deletes every row
it created.

## Assertions (all must pass)
1. **Round-trip** — `saveDirective()` persists a goal and a rule;
   `listDirectives(kind)` returns each under its own kind only (kind
   isolation), with text trimmed.
2. **Blank is a no-op** — saving whitespace-only text creates no row and
   editing an existing row to blank leaves its text unchanged.
3. **Update + toggle** — saving with an id rewrites text and `enabled`.
4. **Prompt render: goals** — with an enabled goal saved,
   `buildSystemPrompt()` contains a `GOALS` heading and the goal text
   verbatim as a bullet, positioned before the `RULES:` section.
5. **Prompt render: rules** — with an enabled rule saved,
   `buildSystemPrompt()` contains the rule text verbatim inside the RULES
   section (after the built-in bullets), and the built-in rules are still
   present.
6. **Disabled rows are invisible** — a disabled goal and rule appear nowhere
   in the prompt.
7. **Empty state** — with no enabled goals, the prompt has no `GOALS`
   heading.
8. **Cleanup** — every AgentDirective row the proof created is gone.

## Red expectation
Before implementation the script fails at import time — `lib/directives`
does not exist and `AgentDirective` is not a table.

## Secondary checks (not proof)
- `npx next lint` clean on touched files.
- `npx tsc --noEmit` clean.
- `$HOME/.claude/scripts/gate` PASS.
- Admin verified in the browser: Agent Behavior → Goals and Rules tabs
  add / edit / toggle / delete, survive reload.
