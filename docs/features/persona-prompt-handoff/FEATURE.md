# Feature — Borrow the persona from the model that already knows you

## Why
The Persona field is one free-prose paragraph that goes into the chatbot's
prompt verbatim, and writing it from a blank page is the hardest step in
setting this site up. Blake already talks to ChatGPT, Claude and Gemini daily —
those assistants hold the raw material. This turns "write a paragraph about
yourself" into "run one prompt where your history lives, paste the answer back".

## What
A block at the top of the Persona tab, above the field it feeds:

- A short explanation: copy the prompt, paste it into the assistant you use
  most, paste its answer into the Persona field below and save.
- **Copy prompt** — puts the whole prompt on the clipboard.
- **View prompt** — expands the prompt inline so it can be read (and selected
  by hand) before it's used; the same button collapses it again.

The prompt itself is `docs/prompts/persona-extraction.md`, kept as Markdown
because it is a document — a long, section-heavy instruction set that produces
a `persona.md`-shaped answer.

## Boundaries
- The prompt ships with the app and is read server-side, then handed to the
  client as a prop — Copy needs no round trip and View has nothing to load.
- No change to how the persona is stored, indexed, or put into the system
  prompt. This only helps fill the existing field.
- Nothing is sent anywhere: the visitor-facing site is untouched, and the
  admin makes no new network calls.
- A blocked clipboard (no permission, insecure context) must still leave the
  prompt reachable rather than failing silently.

## Scenarios
- Blake opens the Persona tab, hits **Copy prompt**, pastes it into ChatGPT,
  and pastes the returned Markdown into the Persona field.
- He hits **View prompt** first to read what he'd be sending, then collapses it.
- Clipboard access is denied; the prompt expands instead so he can select it.

## Acceptance
- The Persona tab renders the explanation and both buttons above the field.
- The prompt is not visible until **View prompt** is pressed.
- **Copy prompt** places the full prompt text on the clipboard.
- The prompt served is exactly the contents of
  `docs/prompts/persona-extraction.md`.

## Implementation Routing
- Required skills: coding-frontend, coding-proof-author
