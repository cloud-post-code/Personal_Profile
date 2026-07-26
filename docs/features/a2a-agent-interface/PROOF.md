# Proof — A2A agent interface + hosted agent facts card

## Definition Of Done

- A valid A2A **v1.0** Agent Card is served at `/.well-known/agent-card.json`,
  built from the live Profile, carrying at least one `supportedInterfaces` entry.
- `SendMessage` returns the brain's real answer as a completed `Task`, and the
  same call in v0.3 vocabulary returns the v0.3 spelling of that task.
- A UI card the brain emits arrives as a structured **data part**, not prose.
- Streaming emits the documented event sequence and terminates on a terminal
  state; 0.3 streams carry `final: true` on the last event.
- Capability gating returns the **specific** error codes the spec names, not
  generic failures.
- Version negotiation follows §3.6.2 (absent header ⇒ 0.3) and rejects unknown
  versions with `-32009`.
- The same context id carries conversation history across calls.
- An AgentFacts document is served with every required field of the published
  schema, and with no fabricated audit claims.
- The endpoint is rate limited.

## Primary Proof

Type: integration (the protocol surface is the contract this feature adds; a
unit test of the translators would not catch a dispatcher that never calls them)

Command:

```bash
npx tsx docs/features/a2a-agent-interface/proof.ts
```

Runs against local dev Postgres (`blake-pg`, `DATABASE_URL` from `.env`); the
script loads `.env` itself.

**It makes zero Anthropic calls.** It seeds a `CannedAnswer` row and asks the
agent exactly that question, so the answer travels the entire real path —
`dispatch` → `runTask` → `answer()` → task persistence → version rendering —
with a deterministic, byte-checkable payload at the end and no model in the
loop. Everything it creates (`a2aproof`-prefixed canned answers, projects, and
every task in the contexts it opens) is deleted afterwards.

### Assertions (all must pass)

1. **Card shape** — `agentCardV1` produces every field the spec marks REQUIRED
   (`name`, `description`, `supportedInterfaces`, `version`, `capabilities`,
   `defaultInputModes`, `defaultOutputModes`, `skills`) and no `protocolVersion`
   at top level (removed in 1.0).
2. **Card is profile-driven** — renaming the Profile changes the card's name and
   its skill ids; the card is not hardcoded.
3. **Interfaces are declared correctly** — the preferred entry is JSONRPC at the
   site's `/api/a2a`, and a 0.3 interface is advertised alongside it.
4. **Legacy card** — `agentCardV03` carries `protocolVersion`, `url` and
   `preferredTransport`, the fields 1.0 removed.
5. **SendMessage returns the answer** — a canned question returns a `Task` in
   `TASK_STATE_COMPLETED` whose artifact text is byte-identical to the stored
   answer.
6. **Answer is reachable three ways** — the same text appears in the task's
   artifacts, in `status.message`, and in `history`, because different clients
   read different ones.
7. **v0.3 rendering** — the same call rendered for 0.3 yields `kind: "task"`,
   `state: "completed"`, and parts tagged `kind: "text"`.
8. **Cards become data parts** — a canned answer carrying `cardTool` produces an
   artifact whose part is a `data` part holding the real projects block,
   including the seeded project. Proves it went through the live `hydrate()`.
9. **Streaming sequence** — `SendStreamingMessage` yields the opening `task`, a
   `TASK_STATE_WORKING` status, at least one `artifactUpdate`, and a terminal
   `TASK_STATE_COMPLETED` status, in that order.
10. **0.3 stream termination** — the same stream downgraded carries
    `final: true` on the terminal event and `final: false` before it.
11. **GetTask** — returns the persisted task; `historyLength: 0` omits history.
12. **GetTask on an unknown id** — `-32001`.
13. **CancelTask on a completed task** — `-32002` (not cancelable).
14. **Cancel then subscribe** — a cancelable task can be canceled, and
    subscribing to a terminal task returns `-32004`.
15. **Push notification methods** — all four return `-32003`, matching the
    card's `pushNotifications: false`.
16. **Extended card** — `-32004`, matching `extendedAgentCard: false`.
17. **Unknown method** — `-32601`.
18. **Malformed message** — a message with no usable parts returns `-32602`.
19. **Version negotiation** — no header ⇒ `0.3`; `1.0.1` ⇒ `1.0` (patch ignored);
    a 1.0-only method with no header ⇒ `1.0`; `9.9` ⇒ `unsupported`.
20. **Legacy method names dispatch** — `message/send` and `tasks/get` resolve to
    the same handlers as `SendMessage` and `GetTask`.
21. **Context carries history** — a second message on the same `contextId` sees
    the first exchange in its prior history.
22. **ListTasks** — filters by `contextId` and reports `totalSize`.
23. **AgentFacts required fields** — every field the published schema marks
    required is present and non-empty.
24. **AgentFacts makes no false claims** — no `evaluations` block, and
    `certification.level` is `self-declared`.
25. **AgentFacts points back at the card** — its endpoints match the card's
    interfaces.
26. **Rate limiting bites** — calls past the configured limit are rejected, and
    a different caller is unaffected.
27. **Part normalization round-trips** — a 0.3 `{kind:"text"}` part and a 1.0
    `{text}` part both read as the same internal part.
28. **Cleanup** — every seeded row and every task created by the proof is gone,
    and the tables return to their starting counts.

## Secondary checks (not proof)

- `npx tsc --noEmit` clean, `npx next lint` clean.
- `~/.claude/scripts/gate`.
- Live verification against the dev server: the three well-known documents
  return 200 with correct content types, a real (non-canned) question answered
  through `/api/a2a` from the live knowledge base, SSE streaming observed
  end-to-end, the REST binding exercised for every path, and the `/agent` page
  rendered in the browser.
