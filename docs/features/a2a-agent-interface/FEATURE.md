# Feature — Expose the site's agent to other agents (A2A) + a hosted agent facts card

## Why

The site already has an agent: `lib/brain.ts` answers questions as Blake from a
curated knowledge base. But it was reachable exactly one way — a human typing
into a browser. Another AI agent had no way to discover it, no way to call it,
and no machine-readable statement of what it is or who runs it.

A2A (Agent2Agent, now under the Linux Foundation) is the protocol that fixes the
first two. A published **Agent Card** at a well-known URL is the discovery
mechanism; a JSON-RPC (or REST) endpoint is the call mechanism. The third — a
durable, linkable "here is what this agent is" document — is what the NANDA
**AgentFacts** format is for.

## What gets built

1. **Agent Card** at `/.well-known/agent-card.json`, generated from the live
   `Profile` row rather than hardcoded, so any site built from this template
   describes its own owner with its own skills.
2. **A2A endpoint** at `/api/a2a` (JSON-RPC 2.0) and `/api/a2a/rest`
   (HTTP+JSON), both driving the existing brain.
3. **Two protocol generations.** A2A v1.0 (current) and v0.3.x (what most
   deployed clients still speak), negotiated by the `A2A-Version` header.
4. **Real tasks.** `SendMessage`, `SendStreamingMessage`, `GetTask`,
   `ListTasks`, `CancelTask`, `SubscribeToTask`, persisted in Postgres.
5. **AgentFacts document** at `/.well-known/agent-facts.json`, self-hosted.
6. **A human page** at `/agent` linking all of it, linked from the homepage.

## Scope decisions

- **The brain is not duplicated.** `answer({message, history, sessionId,
  channel})` is already transport-independent; A2A is a transport. This feature
  adds a translation layer, not a second chatbot.
- **UI cards become data parts.** A `show_projects` block renders as a card for
  a human; to a calling agent the same block is structured JSON it can consume.
  That is the single most valuable thing this interface offers over scraping the
  page.
- **Tasks are persisted, not in-memory.** A2A lets a caller send now and collect
  later. An in-memory store would break `GetTask` across a Railway redeploy.
- **Streaming is supported; push notifications are not.** The card declares
  `pushNotifications: false` and the endpoint returns the specific
  `PushNotificationNotSupportedError`, which is the correct, discoverable answer
  rather than a 404.
- **Open by default, rate limited always.** Publishing a card is an invitation,
  and every accepted call spends model credits. `A2A_API_KEY` closes the
  endpoint; `A2A_RATE_LIMIT` (default 30/min/IP) bounds it either way.
- **No fabricated trust signals.** The AgentFacts document omits `evaluations`
  entirely and marks `certification.level` as `self-declared`. Nothing here has
  been audited, and claiming otherwise is the exact failure the format exists to
  prevent.

## Out of scope

- gRPC binding (the third A2A transport).
- Agent Card JWS signing (`signatures`) — needs a key management story.
- Registering with a third-party registry. The two existing host39.org cards
  under this owner's email are stale and point at a dead URL; deciding what to
  do with them is the owner's call, not this feature's.
