/**
 * Primary proof for experience-timeline-card (see PROOF.md).
 * Run:
 *   npx tsx --tsconfig docs/features/experience-timeline-card/tsconfig.proof.json \
 *     docs/features/experience-timeline-card/proof.ts
 *
 * Zero Anthropic calls. Three layers, each driven for real:
 *
 *   - the hydrator runs against the real local Postgres, with the Profile
 *     singleton loaded with a fixture history and restored in cleanup();
 *   - the brain wiring is driven through a canned answer naming the tool and a
 *     fake ModelClient that only reports which tools it was handed, so the real
 *     TOOLS assembly and the real hydrate() switch are what get observed;
 *   - the card itself is mounted in jsdom and clicked, because "the roles are
 *     on screen" is not observable from the block.
 *
 * Everything this writes is scoped by the "tlproof" prefix, except the Profile
 * row, which is the one place experience can live.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../../..");
for (const line of readFileSync(path.join(root, ".env"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) {
    process.env[m[1]] = m[2].trim().replace(/^(["'])(.*)\1$/, "$2");
  }
}

// buildSystemPrompt embeds the question to retrieve context. Nothing here
// asserts on retrieved content, so the hosted embedders are dropped and the
// local hashed one is used instead — the proof makes no network call at all.
delete process.env.VOYAGE_API_KEY;
delete process.env.OPENAI_API_KEY;

import { prisma, getProfile } from "@/lib/db";
import { experienceTimelineBlock, type UiBlock, type TimelineEntry } from "@/lib/cards";
import { answer, type ModelClient } from "@/lib/brain";
import { CARD_TOOLS, saveCannedAnswer, deleteCannedAnswer, normalizeQuestion } from "@/lib/canned";
import { buildSystemPrompt } from "@/lib/knowledge";

const PROOF_SESSION = "tlproof-session";
const PROOF_QUESTION = "tlproof what is your background";

/**
 * Deliberately NOT in chronological order, and deliberately in three different
 * date formats. A hydrator that sorts — however cleverly — cannot reproduce
 * this order, so assertion 2 fails the moment anyone adds one.
 */
const FIXTURE: TimelineEntry[] = [
  {
    role: "Founding Engineer",
    company: "Northwind Labs",
    dates: "2019–2021",
    description: "tlproof built the first product end to end.",
  },
  {
    role: "Staff Engineer",
    company: "Ardent Systems",
    dates: "2023 – present",
    description: "tlproof leads the platform team.",
  },
  {
    role: "Independent Consultant",
    company: "Self-employed",
    dates: "Summer '22",
    description: "tlproof shipped for four clients.",
  },
  {
    role: "Intern",
    company: "Gray & Co",
    dates: "Jan 2018 - Mar 2018",
    description: "tlproof wrote the internal dashboard.",
  },
  {
    role: "Barista",
    company: "Ember Coffee",
    dates: "2016–2017",
    description: "tlproof learned to talk to strangers before 6am.",
  },
];
const FIXTURE_SUMMARY = "tlproof a decade of building things that ship.";

let failures = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) console.log(`  PASS  ${name}`);
  else {
    failures++;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main() {
  const before = await getProfile();
  const original = {
    experience: before.experience,
    experienceSummary: before.experienceSummary,
  };
  const baseCanned = await prisma.cannedAnswer.count();

  try {
    // ══ 1. The hydrator ══
    console.log("\n1. Hydrating the block from the Profile row");

    await useExperience(JSON.stringify(FIXTURE), FIXTURE_SUMMARY);
    const block = await experienceTimelineBlock();
    check("hydrates a timeline block", block.type === "timeline", block.type);
    if (block.type !== "timeline") throw new Error("not a timeline block");

    check("carries every stored role", block.items.length === FIXTURE.length,
      `${block.items.length} of ${FIXTURE.length}`);
    check("preserves the stored order rather than sorting the dates",
      block.items.map((e) => e.company).join("|") === FIXTURE.map((e) => e.company).join("|"),
      block.items.map((e) => e.company).join("|"));
    check("carries every field of an entry",
      block.items[0].role === "Founding Engineer" &&
        block.items[0].company === "Northwind Labs" &&
        block.items[0].dates === "2019–2021" &&
        block.items[0].description === FIXTURE[0].description,
      JSON.stringify(block.items[0]));
    check("carries Blake's own summary paragraph", block.summary === FIXTURE_SUMMARY, block.summary);

    // An empty history is an empty card, never a throw and never a stale one.
    await useExperience("[]", "");
    const empty = await experienceTimelineBlock();
    check("an empty history hydrates an empty timeline",
      empty.type === "timeline" && empty.items.length === 0 && empty.summary === "",
      JSON.stringify(empty));

    // Profile.experience is a free text column; it has held hand-edited JSON
    // and resume-parser output. Neither is guaranteed well-formed.
    await useExperience("{not json at all", "");
    const broken = await experienceTimelineBlock();
    check("malformed stored JSON degrades to an empty timeline, not an error",
      broken.type === "timeline" && broken.items.length === 0,
      JSON.stringify(broken));

    await useExperience(
      JSON.stringify([{ role: "  Solo Dev  ", company: null }, { junk: true }, "nope"]),
      "",
    );
    const messy = await experienceTimelineBlock();
    check("entries with missing fields are trimmed and the empty ones dropped",
      messy.type === "timeline" &&
        messy.items.length === 1 &&
        messy.items[0].role === "Solo Dev" &&
        messy.items[0].company === "",
      JSON.stringify(messy));

    // ══ 2. Wiring into the chat ══
    console.log("\n2. Wiring into the chat");

    check("show_timeline is a valid canned card tool",
      (CARD_TOOLS as readonly string[]).includes("show_timeline"));

    await useExperience(JSON.stringify(FIXTURE), FIXTURE_SUMMARY);
    await saveCannedAnswer({
      question: PROOF_QUESTION,
      answer: "Here's the short version.",
      cardTool: "show_timeline",
      enabled: true,
    });
    const cards = await collect(PROOF_QUESTION);
    const drawn = cards.find((c) => c.type === "timeline");
    check("a canned answer hydrates a timeline card through the real brain",
      !!drawn, JSON.stringify(cards.map((c) => c.type)));
    check("the card that reaches the transport carries the roles",
      !!drawn && drawn.type === "timeline" && drawn.items.length === FIXTURE.length,
      drawn && drawn.type === "timeline" ? String(drawn.items.length) : "no card");

    const tools = await toolNames();
    check("show_timeline is offered to the model",
      tools.includes("show_timeline"),
      `[${tools}]`);
    check("the other cards are still offered",
      tools.includes("show_projects") &&
        tools.includes("show_gallery") &&
        tools.includes("show_contact_form"),
      `[${tools}]`);

    const prompt = await buildSystemPrompt("tlproof what is your background");
    check("the prompt tells the model when to call show_timeline",
      prompt.includes("show_timeline"));
    check("the prompt tells it to leave the roles to the card",
      /leave the roles, companies and dates to the card/.test(prompt));

    // ══ 3. The card on screen ══
    console.log("\n3. The card on screen");
    await checkRendering();
  } finally {
    await cleanup(original);
    check("canned answers cleaned up",
      (await prisma.cannedAnswer.count()) === baseCanned,
      `${baseCanned} -> ${await prisma.cannedAnswer.count()}`);
    const after = await getProfile();
    check("profile restored",
      after.experience === original.experience &&
        after.experienceSummary === original.experienceSummary);
    await prisma.$disconnect();
  }

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log("\nAll proof assertions passed");
}

/**
 * Mount the real card in a real DOM and read what a visitor would see.
 *
 * The block is not the card: a renderer that dropped `dates`, or drew all
 * fifteen of someone's roles into a chat bubble, produces exactly the same
 * block. Only rendering it catches that, and only clicking catches the fold.
 */
async function checkRendering() {
  const { JSDOM } = await import("jsdom");
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
    pretendToBeVisual: true,
    url: "http://localhost/",
  });
  const globals = globalThis as unknown as Record<string, unknown>;
  globals.window = dom.window;
  globals.document = dom.window.document;
  Object.defineProperty(globalThis, "navigator", {
    value: dom.window.navigator,
    configurable: true,
  });
  globals.HTMLElement = dom.window.HTMLElement;
  globals.Element = dom.window.Element;
  globals.Node = dom.window.Node;
  globals.Event = dom.window.Event;
  globals.IS_REACT_ACT_ENVIRONMENT = true;

  const React = (await import("react")).default;
  const { act } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { Cards } = await import("@/app/cards/Cards");

  const container = dom.window.document.getElementById("root")!;
  const root = createRoot(container);
  const text = () => container.textContent ?? "";
  const toggle = () => container.querySelector("button[aria-expanded]") as HTMLButtonElement | null;

  const render = async (block: UiBlock) => {
    await act(async () => {
      root.render(React.createElement(Cards, { block }));
    });
  };

  await render({ type: "timeline", items: FIXTURE, summary: FIXTURE_SUMMARY });

  check("the card is headed Experience", text().includes("Experience"));
  check("the summary is shown", text().includes(FIXTURE_SUMMARY));
  check("a role, its company and its dates are all on screen",
    text().includes("Founding Engineer") &&
      text().includes("Northwind Labs") &&
      text().includes("2019–2021"),
    text().slice(0, 200));
  check("the description is shown", text().includes(FIXTURE[0].description));

  // One dot per visible role is what makes it read as a timeline.
  const dots = container.querySelectorAll("span[aria-hidden]").length;
  check("one marker per visible role, and they are hidden from screen readers",
    dots === 4, `${dots} markers`);

  check("a long history folds after the first few roles",
    !text().includes("Ember Coffee"),
    "the fifth role rendered while collapsed");
  check("the fold says how many roles are behind it",
    (toggle()?.textContent ?? "").includes("1 earlier role"),
    toggle()?.textContent ?? "no toggle");

  await act(async () => {
    toggle()!.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
  });
  check("unfolding reveals the earlier roles",
    text().includes("Ember Coffee") && text().includes("Gray & Co"));
  check("unfolded, it offers to fold back",
    (toggle()?.textContent ?? "").includes("Show less"),
    toggle()?.textContent ?? "no toggle");

  // Four roles fit; there is nothing to unfold and no control for it.
  await render({ type: "timeline", items: FIXTURE.slice(0, 4), summary: "" });
  check("a short history has no fold control", toggle() === null);
  check("an absent summary renders nothing rather than an empty line",
    !text().includes(FIXTURE_SUMMARY));

  await render({ type: "timeline", items: [], summary: "" });
  check("an empty history says so", text().includes("No experience added yet"), text());

  await act(async () => {
    root.unmount();
  });
}

/** Run one canned question through the real brain and collect its cards. */
async function collect(question: string): Promise<UiBlock[]> {
  const cards: UiBlock[] = [];
  for await (const event of answer({ message: question, sessionId: PROOF_SESSION })) {
    if (event.t === "card") cards.push(event.v);
  }
  return cards;
}

/**
 * The tool names the brain hands the model. Driven with a fake client that
 * returns an empty message, so the loop reads the params and stops — zero
 * Anthropic calls, and the real TOOLS assembly is what is observed.
 */
async function toolNames(): Promise<string[]> {
  let seen: string[] = [];
  const client: ModelClient = {
    messages: {
      stream(params) {
        seen = (params.tools ?? []).map((t) => t.name);
        return {
          async *[Symbol.asyncIterator]() {},
          async finalMessage() {
            return { content: [] };
          },
        };
      },
    },
  };
  for await (const _ of answer(
    { message: "tlproof uncanned question", sessionId: PROOF_SESSION },
    { client },
  )) {
    void _;
  }
  return seen;
}

/**
 * Written straight to the row rather than through saveProfileBasics, which
 * would reindex the profile — an embedding request and an extraction call per
 * write, for text this proof deletes a moment later.
 */
async function useExperience(experience: string, experienceSummary: string) {
  await prisma.profile.update({ where: { id: 1 }, data: { experience, experienceSummary } });
}

async function cleanup(original: { experience: string; experienceSummary: string }) {
  const canned = await prisma.cannedAnswer.findUnique({
    where: { matchKey: normalizeQuestion(PROOF_QUESTION) },
  });
  if (canned) await deleteCannedAnswer(canned.id);

  // answer() logs every turn; drop the session this proof opened.
  await prisma.chatSession.delete({ where: { visitorKey: PROOF_SESSION } }).catch(() => {});

  await prisma.profile.update({ where: { id: 1 }, data: original });
}

main().catch((e) => {
  console.error("Proof run errored:", e);
  process.exit(1);
});
