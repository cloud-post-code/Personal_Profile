/**
 * Primary proof for ai-drafted-answers (see PROOF.md).
 * Run: npx tsx docs/features/ai-drafted-answers/proof.ts
 *
 * The feature's whole claim is about what does and does not reach the model, so
 * the Anthropic client is injected as a double at the outermost provider
 * boundary ONLY — retrieval, prompt assembly, persistence, the brain and the
 * React render all run for real. Call counts come from the double, and the
 * draft's provenance is read off the prompt the double was handed, so a
 * hardcoded answer cannot pass.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import path from "node:path";
import React from "react";

// The admin components are compiled by Next with the automatic JSX runtime;
// tsx compiles them with the classic one, which expects `React` in scope. This
// is a harness detail of rendering a Next component outside Next — the
// component itself is untouched and is rendered exactly as written.
(globalThis as { React?: typeof React }).React = React;

// Load .env ourselves (tsx doesn't); never override values already set.
const root = path.resolve(__dirname, "../../..");
for (const line of readFileSync(path.join(root, ".env"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) {
    process.env[m[1]] = m[2].trim().replace(/^(["'])(.*)\1$/, "$2");
  }
}

// Retrieval runs for real, but not against the paid embedding provider: with no
// embedding key set, lib/retrieval/embed.ts uses its deterministic local
// embedder. That keeps the proof offline and fast — and stops every run from
// spending Blake's embedding quota, or waiting out its rate-limit backoff, on
// work that has nothing to do with what this feature claims.
// Blanked rather than deleted: Prisma loads .env itself when the client is
// imported, and a deleted key would simply come back.
process.env.VOYAGE_API_KEY = "";
process.env.OPENAI_API_KEY = "";

let failures = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const PREFIX = "draftproof";
const SESSION_KEY = `${PREFIX}-session`;

// Distinctive strings so any match can only have come from this proof.
const PROJECT_NAME = "Thistledown Kiln Ledger";
const Q_BLANK = "What is Blake's stance on kiln telemetry?";
const Q_MINE = "Why did Blake leave the Thistledown workshop?";
const A_MINE = "Because the kiln outlasted the workshop that housed it.";
const Q_CLEARED = "What does Blake read on a long train?";
const DRAFT_TEXT = "[drafted answer, first pass]";
const REDRAFT_TEXT = "[drafted answer, second pass]";
const EDITED_TEXT = "Blake's own words, typed over the draft.";

type CreateParams = Anthropic.MessageCreateParamsNonStreaming;

/** The system prompt as one string, however the SDK's param type carries it. */
function systemText(params?: CreateParams): string {
  if (!params?.system) return "";
  return typeof params.system === "string" ? params.system : JSON.stringify(params.system);
}

/**
 * Minimal stand-in for the Anthropic client's non-streaming call: counts
 * requests and keeps every set of params it was handed, so the proof can read
 * the prompt the drafting pass actually built.
 */
function fakeClient(text: string) {
  const spy = { calls: 0, params: [] as CreateParams[] };
  const client = {
    messages: {
      async create(params: CreateParams) {
        spy.calls++;
        spy.params.push(params);
        return { content: [{ type: "text", text }] };
      },
    },
  };
  return { client, spy };
}

/** A client slower than the pass's deadline, so the page must stop waiting. */
function slowClient(text: string, delayMs: number) {
  const client = {
    messages: {
      create(): Promise<{ content: unknown[] }> {
        return new Promise((resolve) => {
          setTimeout(() => resolve({ content: [{ type: "text", text }] }), delayMs);
        });
      },
    },
  };
  return { client };
}

/** A client that fails the way a missing key or a provider outage would. */
function brokenClient() {
  const spy = { calls: 0 };
  const client = {
    messages: {
      async create() {
        spy.calls++;
        throw new Error("provider unavailable");
      },
    },
  };
  return { client, spy };
}

/** One scripted assistant turn for the streaming double the brain uses. */
function fakeStreamClient(text: string) {
  const spy = { calls: 0 };
  const client = {
    messages: {
      stream() {
        spy.calls++;
        return {
          async *[Symbol.asyncIterator]() {
            yield { type: "content_block_delta", delta: { type: "text_delta", text } };
          },
          finalMessage: async () => ({ content: [{ type: "text", text }] }),
        };
      },
    },
  };
  return { client, spy };
}

async function main() {
  // Every draft runs real retrieval, and real retrieval waits on a live
  // embedding provider that rate-limits — so the pass's deadline is lifted well
  // clear of these assertions. The deadline gets its own assertion below, with
  // its own value; leaving it at the product default would make every other
  // assertion a race against a third party's queue.
  process.env.DRAFT_DEADLINE_MS = "120000";

  const { prisma } = await import("../../../lib/db");
  const { answer } = await import("../../../lib/brain");
  const { normalizeQuestion, saveCannedAnswer, cannedStats } = await import("../../../lib/canned");
  const { draftBlankAnswers, redraftAnswer } = await import("../../../lib/answerDrafts");

  const baseCanned = await prisma.cannedAnswer.count();
  const baseProjects = await prisma.project.count();
  const baseSessions = await prisma.chatSession.count();
  const baseMessages = await prisma.chatMessage.count();

  // Isolation. Any blank row already in this database — Blake's real starters —
  // is eligible for the very pass under test, so it would be drafted with the
  // double's text and its calls would land in these counts. Park those rows as
  // already-drafted for the duration and restore them in cleanup, so the proof
  // measures only its own fixtures and leaves the dev data as it found it.
  const parked = (
    await prisma.cannedAnswer.findMany({
      where: { answer: "", draftedAt: null, NOT: { id: { startsWith: PREFIX } } },
      select: { id: true },
    })
  ).map((r) => r.id);

  async function cleanup() {
    await prisma.chatSession.deleteMany({ where: { visitorKey: SESSION_KEY } });
    await prisma.cannedAnswer.deleteMany({ where: { id: { startsWith: PREFIX } } });
    await prisma.project.deleteMany({ where: { id: { startsWith: PREFIX } } });
    await prisma.cannedAnswer.updateMany({
      where: { id: { in: parked } },
      data: { draftedAt: null },
    });
  }

  await cleanup();
  await prisma.cannedAnswer.updateMany({
    where: { id: { in: parked } },
    data: { draftedAt: new Date(0) },
  });

  try {
    // ── Seed ──────────────────────────────────────────────────────────────
    // A project so the system prompt has real, identifiable knowledge in it.
    await prisma.project.create({
      data: {
        id: `${PREFIX}-proj`,
        name: PROJECT_NAME,
        blurb: "Telemetry for a wood-fired kiln.",
        order: 0,
      },
    });
    await prisma.cannedAnswer.create({
      data: {
        id: `${PREFIX}-blank`,
        question: Q_BLANK,
        matchKey: normalizeQuestion(Q_BLANK),
        answer: "",
        enabled: true,
      },
    });
    await prisma.cannedAnswer.create({
      data: {
        id: `${PREFIX}-mine`,
        question: Q_MINE,
        matchKey: normalizeQuestion(Q_MINE),
        answer: A_MINE,
        enabled: true,
      },
    });
    // Blake wrote an answer here and then deliberately cleared it: blank, but
    // already drafted once, so the pass must leave it alone.
    await prisma.cannedAnswer.create({
      data: {
        id: `${PREFIX}-cleared`,
        question: Q_CLEARED,
        matchKey: normalizeQuestion(Q_CLEARED),
        answer: "",
        enabled: true,
        draftedAt: new Date("2026-01-01T00:00:00Z"),
      },
    });

    const row = (id: string) => prisma.cannedAnswer.findUniqueOrThrow({ where: { id } });

    // ── 1–2, 4–5. The automatic pass ──────────────────────────────────────
    const first = fakeClient(DRAFT_TEXT);
    await draftBlankAnswers({ client: first.client });

    const blank = await row(`${PREFIX}-blank`);
    check(
      "blank row is drafted in exactly one call",
      first.spy.calls === 1 && blank.answer === DRAFT_TEXT,
      `calls=${first.spy.calls} answer=${JSON.stringify(blank.answer)}`,
    );
    check(
      "drafted row is marked unreviewed and stamped",
      blank.aiDraft === true && blank.draftedAt !== null,
      `aiDraft=${blank.aiDraft} draftedAt=${blank.draftedAt}`,
    );

    const system = systemText(first.spy.params[0]);
    const userTurn = JSON.stringify(first.spy.params[0]?.messages ?? []);
    check(
      "the draft is written from the real knowledge prompt",
      system.includes(PROJECT_NAME) && userTurn.includes(Q_BLANK),
      `system has project=${system.includes(PROJECT_NAME)} user turn has question=${userTurn.includes(Q_BLANK)}`,
    );

    const mine = await row(`${PREFIX}-mine`);
    check(
      "a hand-written answer is never overwritten",
      mine.answer === A_MINE && mine.aiDraft === false,
      `answer=${JSON.stringify(mine.answer)} aiDraft=${mine.aiDraft}`,
    );

    const cleared = await row(`${PREFIX}-cleared`);
    check(
      "a deliberately blanked row stays blank",
      cleared.answer === "" && cleared.aiDraft === false,
      `answer=${JSON.stringify(cleared.answer)}`,
    );

    // ── 3. Once per row, forever ──────────────────────────────────────────
    const second = fakeClient("[should never be written]");
    await draftBlankAnswers({ client: second.client });
    const unchanged = await row(`${PREFIX}-blank`);
    check(
      "a second pass makes no call and changes nothing",
      second.spy.calls === 0 && unchanged.answer === DRAFT_TEXT,
      `calls=${second.spy.calls} answer=${JSON.stringify(unchanged.answer)}`,
    );

    // ── 6. A draft is live immediately ────────────────────────────────────
    const stream = fakeStreamClient("[model-generated answer]");
    let served = "";
    for await (const ev of answer(
      { message: Q_BLANK, history: [], sessionId: SESSION_KEY, channel: "web" },
      { client: stream.client },
    )) {
      if (ev.t === "text") served += ev.v;
    }
    const afterServe = await row(`${PREFIX}-blank`);
    check(
      "a drafted answer is served verbatim with zero model calls",
      served === DRAFT_TEXT && stream.spy.calls === 0,
      `calls=${stream.spy.calls} served=${JSON.stringify(served)}`,
    );
    check("serving a draft counts a saved model call", afterServe.hits === 1, `hits=${afterServe.hits}`);

    // ── 7. Saving is review ───────────────────────────────────────────────
    await saveCannedAnswer({
      id: `${PREFIX}-blank`,
      question: Q_BLANK,
      answer: EDITED_TEXT,
      enabled: true,
    });
    const reviewed = await row(`${PREFIX}-blank`);
    check(
      "saving clears the unreviewed mark and keeps the draft stamp",
      reviewed.answer === EDITED_TEXT && reviewed.aiDraft === false && reviewed.draftedAt !== null,
      `aiDraft=${reviewed.aiDraft} draftedAt=${reviewed.draftedAt}`,
    );

    // ── 8. Redraft ────────────────────────────────────────────────────────
    const again = fakeClient(REDRAFT_TEXT);
    await redraftAnswer(`${PREFIX}-blank`, { client: again.client });
    const redrafted = await row(`${PREFIX}-blank`);
    check(
      "redraft replaces the text and re-marks it unreviewed",
      again.spy.calls === 1 && redrafted.answer === REDRAFT_TEXT && redrafted.aiDraft === true,
      `calls=${again.spy.calls} answer=${JSON.stringify(redrafted.answer)}`,
    );

    // ── 9. Failure is contained and retryable ─────────────────────────────
    await prisma.cannedAnswer.create({
      data: {
        id: `${PREFIX}-fail`,
        question: `${Q_BLANK} (and what about the flue?)`,
        matchKey: normalizeQuestion(`${Q_BLANK} (and what about the flue?)`),
        answer: "",
        enabled: true,
      },
    });
    const broken = brokenClient();
    let threw = false;
    await draftBlankAnswers({ client: broken.client }).catch(() => {
      threw = true;
    });
    const failed = await row(`${PREFIX}-fail`);
    check(
      "a model failure does not propagate out of the pass",
      !threw && broken.spy.calls === 1,
      `threw=${threw} calls=${broken.spy.calls}`,
    );
    check(
      "a failed draft leaves the row blank and retryable",
      failed.answer === "" && failed.draftedAt === null,
      `answer=${JSON.stringify(failed.answer)} draftedAt=${failed.draftedAt}`,
    );

    // ── 10. The deadline ──────────────────────────────────────────────────
    // Drafting queues behind the embedding provider's rate limit, so a pass can
    // outlast a page render. It must hand the page back on time — and the draft
    // it started must still land, or the deadline would cost a row its one shot.
    process.env.DRAFT_DEADLINE_MS = "200";
    const slow = slowClient(DRAFT_TEXT, 1500);
    const startedAt = Date.now();
    const draftedInTime = await draftBlankAnswers({ client: slow.client });
    const waited = Date.now() - startedAt;
    check(
      "a slow pass hands the page back at its deadline",
      waited < 1000 && draftedInTime === 0,
      `waited=${waited}ms drafted=${draftedInTime}`,
    );

    // The abandoned draft lands whenever it lands: it still has real retrieval
    // and the slow call ahead of it, so poll rather than guess a sleep.
    let late = await row(`${PREFIX}-fail`);
    for (let i = 0; i < 150 && !late.answer; i++) {
      await new Promise((r) => setTimeout(r, 200));
      late = await row(`${PREFIX}-fail`);
    }
    check(
      "a draft that overran the deadline still lands",
      late.answer === DRAFT_TEXT && late.aiDraft === true,
      `answer=${JSON.stringify(late.answer)}`,
    );
    process.env.DRAFT_DEADLINE_MS = "120000";

    // ── 11. Stats ─────────────────────────────────────────────────────────
    const stats = cannedStats([
      { answer: DRAFT_TEXT, enabled: true, hits: 0, aiDraft: true },
      { answer: A_MINE, enabled: true, hits: 3, aiDraft: false },
      { answer: "", enabled: true, hits: 0, aiDraft: false },
    ]);
    check(
      "stats separate unreviewed drafts from live and unanswered",
      stats.unreviewed === 1 && stats.live === 2 && stats.unanswered === 1,
      JSON.stringify(stats),
    );

    // ── 12. The tab renders the draft ─────────────────────────────────────
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { AnswersPanel } = await import("../../../app/admin/AnswersPanel");
    const panelRows = [
      {
        id: `${PREFIX}-blank`,
        question: Q_BLANK,
        answer: DRAFT_TEXT,
        cardTool: null,
        cardInput: null,
        enabled: true,
        hits: 0,
        order: 0,
        aiDraft: true,
      },
      {
        id: `${PREFIX}-mine`,
        question: Q_MINE,
        answer: A_MINE,
        cardTool: null,
        cardInput: null,
        enabled: true,
        hits: 0,
        order: 1,
        aiDraft: false,
      },
    ];
    const html = renderToStaticMarkup(React.createElement(AnswersPanel, { rows: panelRows }));
    check(
      "the drafted answer is rendered into the form, not left blank",
      html.includes(DRAFT_TEXT),
      "draft text missing from rendered markup",
    );
    // Exactly one of the two rows carries the marker: the drafted one.
    const marks = html.match(/AI draft/g) ?? [];
    check(
      "the drafted row is marked unreviewed and the reviewed one is not",
      marks.length === 1 && html.indexOf("AI draft") < html.indexOf(A_MINE),
      `markers=${marks.length}`,
    );
    check("every row offers a redraft control", /redraft/i.test(html), "no redraft control rendered");
  } finally {
    await cleanup();
  }

  // ── 13. Cleanup ─────────────────────────────────────────────────────────
  check("canned answers cleaned up", (await prisma.cannedAnswer.count()) === baseCanned);
  check("projects cleaned up", (await prisma.project.count()) === baseProjects);
  check("chat sessions cleaned up", (await prisma.chatSession.count()) === baseSessions);
  check("chat messages cleaned up", (await prisma.chatMessage.count()) === baseMessages);

  await prisma.$disconnect();
  if (failures) {
    console.error(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log("\nAll proof assertions passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
