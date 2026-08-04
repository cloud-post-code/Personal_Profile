/**
 * Primary proof for agentic-card-builder-search (see PROOF.md).
 * Run: npx tsx docs/features/agentic-card-builder-search/proof.ts
 *
 * Seeds a throwaway source (ids prefixed "cardproof") carrying a distinctive
 * fact, indexes it through the real indexer, then drives draftUiCard() with a
 * scripted fake BuilderClient. The fake asserts on what it receives and
 * replies with fixed content, so the builder's real control flow (tool loop,
 * budget, degradation, validation, retry) is exercised without depending on
 * live model output. Retrieval/embedding/storage are the real code path.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

// Load .env ourselves (tsx doesn't); never override values already set.
const root = path.resolve(__dirname, "../../..");
for (const line of readFileSync(path.join(root, ".env"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) {
    process.env[m[1]] = m[2].trim().replace(/^(["'])(.*)\1$/, "$2");
  }
}

let failures = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** Filler prose so a source spans multiple chunks. */
function para(marker: string, n: number): string {
  const filler =
    "This paragraph covers the working notes, the small decisions made along " +
    "the way, and what was learned while shipping the thing. ";
  return `${marker} appears here in paragraph ${n}. ${filler.repeat(6)}`;
}

/** A request as the builder issues it — mirrors the Anthropic messages shape. */
type Req = {
  model: string;
  max_tokens: number;
  system: string;
  tools?: { name: string; input_schema?: unknown }[];
  thinking?: { type: string };
  output_config?: { effort?: string };
  messages: { role: string; content: unknown }[];
};

/** One scripted reply from the fake client. */
type Reply =
  | { kind: "search"; query: string }
  | { kind: "text"; text: string };

/**
 * Scripted stand-in for the Anthropic client. Records every request, and
 * replies from a queue; the last reply repeats if the builder keeps going
 * (which is how the budget assertion drives an unbounded searcher).
 */
function fakeClient(replies: Reply[]) {
  const calls: Req[] = [];
  let i = 0;
  return {
    calls,
    client: {
      messages: {
        async create(req: Req) {
          calls.push(req);
          const r = replies[Math.min(i++, replies.length - 1)];
          if (r.kind === "search") {
            return {
              stop_reason: "tool_use",
              content: [
                {
                  type: "tool_use",
                  id: `tu_${i}`,
                  name: "search_knowledge",
                  input: { query: r.query },
                },
              ],
            };
          }
          return { stop_reason: "end_turn", content: [{ type: "text", text: r.text }] };
        },
      },
    },
  };
}

/** A minimal valid draft the builder should accept. */
const GOOD_DRAFT = JSON.stringify({
  label: "Proof Card",
  tool: "show_card",
  description: "a proof card",
  reason: "When proving.",
  note: "",
  sampleBlock: {
    type: "custom",
    title: "Proof",
    elements: [{ kind: "text", text: "Hello from the proof." }],
  },
});

/** A draft that violates the theme gate (text colored with a brand token). */
const BAD_COLOR_DRAFT = JSON.stringify({
  label: "Bad Color",
  tool: "show_card",
  description: "a coded card",
  reason: "When proving.",
  note: "",
  sampleBlock: {
    type: "html",
    html: '<div style="color: var(--primary)">invisible</div>',
    height: 120,
  },
});

/** Collect every tool_result string out of a recorded request. */
function toolResultTexts(req: Req): string[] {
  const out: string[] = [];
  for (const m of req.messages) {
    if (!Array.isArray(m.content)) continue;
    for (const b of m.content as { type?: string; content?: unknown }[]) {
      if (b?.type === "tool_result") out.push(String(b.content ?? ""));
    }
  }
  return out;
}

async function main() {
  const { prisma } = await import("../../../lib/db");
  const { indexSource } = await import("../../../lib/retrieval/indexer");
  const { draftUiCard } = await import("../../../lib/cardBuilder");
  const { parseSampleBlock } = await import("../../../lib/uiCards");
  const { CARD_TOOLS } = await import("../../../lib/canned");

  const ENTITY_KEYS = ["quillfeather", "marrowdeep collective"];
  const FACT = "QUILLFEATHERSIGNAL";
  const NEIGHBOR = "MARROWDEEPTRACE";

  await prisma.source.deleteMany({ where: { id: { startsWith: "cardproof" } } });
  await prisma.entity.deleteMany({ where: { key: { in: ENTITY_KEYS } } });
  const baseChunks = await prisma.chunk.count();

  try {
    // src1 mentions entity A (Quillfeather) and carries the distinctive fact.
    // src2 mentions entity B (Marrowdeep Collective) and carries a different
    // marker. The stub declares edge A→B, so a search matching only src1 must
    // still surface src2's chunk via one-hop expansion.
    await prisma.source.create({
      data: {
        id: "cardproof-src1", type: "text", title: "Quillfeather notes",
        rawText: [1, 2].map((n) => para(`Quillfeather ${FACT}`, n)).join("\n\n"),
        summary: "Notes on Quillfeather.", status: "scanned",
      },
    });
    await prisma.source.create({
      data: {
        id: "cardproof-src2", type: "text", title: "Marrowdeep writeup",
        rawText: [1, 2].map((n) => para(`Marrowdeep Collective ${NEIGHBOR}`, n)).join("\n\n"),
        summary: "About the Marrowdeep Collective.", status: "scanned",
      },
    });
    await indexSource("cardproof-src1", {
      extract: async () => ({
        entities: [{ name: "Quillfeather", type: "project" }],
        edges: [{ from: "Quillfeather", to: "Marrowdeep Collective", relation: "built with" }],
      }),
    });
    await indexSource("cardproof-src2", {
      extract: async () => ({
        entities: [{ name: "Marrowdeep Collective", type: "org" }],
        edges: [],
      }),
    });

    // ── 1, 2, 3, 5, 8: search reaches the real index, then drafting completes ──
    {
      const { client, calls } = fakeClient([
        { kind: "search", query: `Quillfeather ${FACT}` },
        { kind: "text", text: GOOD_DRAFT },
      ]);
      const draft = await draftUiCard({ instructions: "A card about my work." }, { client });

      const tool = calls[0]?.tools?.find((t) => t.name === "search_knowledge");
      check("1. search_knowledge tool is offered", !!tool);
      check(
        "1b. tool takes a query string",
        JSON.stringify(tool?.input_schema ?? {}).includes("query"),
      );

      const results = calls.length > 1 ? toolResultTexts(calls[1]) : [];
      const joined = results.join("\n");
      check("2. tool_result carries the seeded fact", joined.includes(FACT),
        `results: ${joined.slice(0, 200)}`);
      check("3. graph expansion surfaced the neighbor chunk", joined.includes(NEIGHBOR),
        "one-hop expansion did not reach src2");
      check("3b. relation line present", /Quillfeather\s*—.*→\s*Marrowdeep/i.test(joined),
        `no relation line in: ${joined.slice(0, 300)}`);

      check("5. draft returned after research", draft.label === "Proof Card");
      check("5b. tool is a known card tool", CARD_TOOLS.includes(draft.tool as never));
      check("5c. sampleBlock is renderable", !!parseSampleBlock(draft.sampleBlock));

      check(
        "8. max_tokens raised to the model ceiling (64000)",
        calls.every((c) => c.max_tokens >= 64000),
        `saw ${calls.map((c) => c.max_tokens).join(",")}`,
      );
      check(
        "8b. adaptive thinking requested with an effort level",
        calls.every((c) => c.thinking?.type === "adaptive" && !!c.output_config?.effort),
        `saw thinking=${JSON.stringify(calls[0]?.thinking)} `
          + `output_config=${JSON.stringify(calls[0]?.output_config)}`,
      );
    }

    // ── 11: progress events reach the caller (what the admin page renders) ──
    {
      const { client } = fakeClient([
        { kind: "search", query: `Quillfeather ${FACT}` },
        { kind: "text", text: GOOD_DRAFT },
      ]);
      const events: { t: string }[] = [];
      await draftUiCard(
        { instructions: "A card." },
        { client, onEvent: (e) => events.push(e) },
      );
      const kinds = events.map((e) => e.t);
      check("11. a search event is emitted", kinds.includes("search"), kinds.join(","));
      check("11b. a searched event reports hits", kinds.includes("searched"));
      const searched = events.find((e) => e.t === "searched") as
        | { hits?: number; query?: string }
        | undefined;
      check("11c. hit count is real", (searched?.hits ?? 0) > 0, `hits=${searched?.hits}`);
      check("11d. the finished draft is emitted", kinds.includes("draft"));
    }

    // ── 12: malformed output is retried until valid, not failed on attempt 2 ──
    {
      // Three unparseable replies, then a good one. The old builder gave up
      // after the first correction; the loop must now keep correcting.
      const { client, calls } = fakeClient([
        { kind: "text", text: "not json at all" },
        { kind: "text", text: "still {not json" },
        { kind: "text", text: "```json\n{oops\n```" },
        { kind: "text", text: GOOD_DRAFT },
      ]);
      const events: { t: string }[] = [];
      const draft = await draftUiCard(
        { instructions: "A card." },
        { client, onEvent: (e) => events.push(e) },
      );
      check("12. recovers after 3 malformed drafts", draft.label === "Proof Card");
      check("12b. it really took 4 attempts", calls.length === 4, `calls=${calls.length}`);
      check(
        "12c. each retry is reported as a status event",
        events.filter((e) => e.t === "status").length >= 3,
      );
    }

    // ── 12d: retries are still bounded — a never-valid model gives up ──
    {
      const { client, calls } = fakeClient([{ kind: "text", text: "never valid" }]);
      let threw = false;
      try {
        await draftUiCard({ instructions: "A card." }, { client });
      } catch {
        threw = true;
      }
      check("12d. an always-invalid model eventually fails", threw);
      check("12e. bounded to 5 validation attempts", calls.length <= 5, `calls=${calls.length}`);
    }

    // ── 4: a miss is explicit, and drafting still completes ──
    {
      const { client, calls } = fakeClient([
        { kind: "search", query: "zzzqqxnothingmatchesthisquery" },
        { kind: "text", text: GOOD_DRAFT },
      ]);
      // Retrieval is stubbed empty rather than relying on a nonsense query:
      // BM25 scores character trigrams, so even gibberish scrapes a match
      // against a small corpus. This tests the no-hits branch itself.
      const draft = await draftUiCard(
        { instructions: "A card." },
        { client, retrieve: async () => ({ chunks: [], relations: [] }) },
      );
      const joined = calls.length > 1 ? toolResultTexts(calls[1]).join("\n") : "";
      check("4. miss returns an explicit nothing-matched result",
        /nothing|no match|didn'?t match/i.test(joined), `got: ${joined.slice(0, 200)}`);
      check("4b. draft still completes after a miss", draft.label === "Proof Card");
    }

    // ── 6: the search budget is enforced (guarded so a regression fails loudly) ──
    {
      // A client that only ever asks to search again. Retrieval is stubbed so
      // this measures the budget, not the network.
      const { client, calls } = fakeClient([{ kind: "search", query: `Quillfeather ${FACT}` }]);
      const guard = new Promise<never>((_, rej) => {
        const t = setTimeout(() => rej(new Error("timed out — budget not enforced")), 20_000);
        // Don't hold the event loop open once the race settles.
        (t as unknown as { unref?: () => void }).unref?.();
      });
      let terminated = true;
      try {
        // The builder is expected to give up with a retryable error; a hang is
        // the regression this guards against, so only the timeout counts.
        await Promise.race([
          draftUiCard(
            { instructions: "Search forever." },
            { client, retrieve: async () => ({ chunks: [], relations: [] }) },
          ).catch(() => null),
          guard,
        ]);
      } catch {
        terminated = false;
      }
      check("6. unbounded searcher terminates", terminated);
      // Each request replays every earlier tool_result, so only the LAST
      // request's blocks are the true count — summing across calls triple-counts.
      const finalResults = toolResultTexts(calls[calls.length - 1] ?? ({} as Req));
      const executed = finalResults.filter((r) => !/budget spent/i.test(r)).length;
      check("6b. at most 4 searches executed", executed <= 4, `executed ${executed}`);
      const last = finalResults[finalResults.length - 1] ?? "";
      check("6c. budget message tells the model to draft",
        /budget|draft with what|no more search/i.test(last), `last result: ${last.slice(0, 200)}`);
    }

    // ── 7: retrieval failure degrades to a note, not a dead builder ──
    {
      const { client, calls } = fakeClient([
        { kind: "search", query: "anything" },
        { kind: "text", text: GOOD_DRAFT },
      ]);
      const draft = await draftUiCard(
        { instructions: "A card." },
        {
          client,
          retrieve: async () => {
            throw new Error("index offline");
          },
        },
      );
      const joined = calls.length > 1 ? toolResultTexts(calls[1]).join("\n") : "";
      check("7. failed search returns a note", joined.length > 0 && !/^\s*$/.test(joined));
      check("7b. builder still returns a draft", draft.label === "Proof Card");
    }

    // ── 9: revision keeps the tool and replays the conversation ──
    {
      const { client, calls } = fakeClient([{ kind: "text", text: GOOD_DRAFT }]);
      const current = {
        label: "Old", tool: "show_card", description: "d", reason: "When.", note: "",
        sampleBlock: JSON.stringify({ type: "custom", title: "Old", elements: [] }),
      };
      await draftUiCard(
        { instructions: "A card.", current, feedback: "use my real talk titles" },
        { client },
      );
      check("9. revision offers search_knowledge",
        !!calls[0]?.tools?.some((t) => t.name === "search_knowledge"));
      const convo = JSON.stringify(calls[0]?.messages ?? []);
      check("9b. prior draft replayed", convo.includes("Old"));
      check("9c. feedback replayed", convo.includes("use my real talk titles"));
    }

    // ── 10: theme validation still bites, and self-correction still works ──
    {
      const { client, calls } = fakeClient([
        { kind: "text", text: BAD_COLOR_DRAFT },
        { kind: "text", text: GOOD_DRAFT },
      ]);
      const draft = await draftUiCard({ instructions: "A coded card." }, { client });
      check("10. bad-color draft was rejected and retried", calls.length === 2,
        `expected exactly 2 calls, got ${calls.length}`);
      const convo = JSON.stringify(calls[1]?.messages ?? []);
      check("10b. instructive error fed back", /readable-on|vanish/i.test(convo));
      check("10c. corrected attempt accepted", draft.label === "Proof Card");
    }
  } finally {
    await prisma.source.deleteMany({ where: { id: { startsWith: "cardproof" } } });
    await prisma.entity.deleteMany({ where: { key: { in: ENTITY_KEYS } } });
    const endChunks = await prisma.chunk.count();
    check("cleanup: chunks cascade-deleted", endChunks === baseChunks,
      `${endChunks} vs baseline ${baseChunks}`);
    await prisma.$disconnect();
  }

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log("\nAll proof assertions passed");
}

main().catch((e) => {
  console.error("Proof run errored:", e);
  process.exit(1);
});
