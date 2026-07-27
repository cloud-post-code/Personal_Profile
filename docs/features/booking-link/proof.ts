/**
 * Primary proof for booking-link (see PROOF.md).
 * Run: npx tsx docs/features/booking-link/proof.ts
 *
 * Zero Anthropic calls: the model tier runs against a fake `ModelClient`, so
 * both the tools offered and the tool-use → card path are observed for real.
 * The Profile singleton is mutated (the link lives on it) and restored in
 * `cleanup()`; everything else is scoped by the "linkproof" prefix.
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

import { prisma, getProfile } from "@/lib/db";
import { saveCannedAnswer, deleteCannedAnswer, normalizeQuestion, CARD_TOOLS } from "@/lib/canned";
import { answer, type ModelClient } from "@/lib/brain";
import type { UiBlock } from "@/lib/cards";

let failures = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) console.log(`  PASS  ${name}`);
  else {
    failures++;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const PROOF_SESSION = "linkproof-session";
const PROOF_URL = "https://cal.com/linkproof/intro";
const CONTACT_Q = "linkproof contact question";
const LINK_Q = "linkproof link question";

/** Run one question through the real brain and collect its cards. */
async function collect(question: string): Promise<UiBlock[]> {
  const cards: UiBlock[] = [];
  for await (const event of answer({ message: question, sessionId: PROOF_SESSION })) {
    if (event.t === "card") cards.push(event.v);
  }
  return cards;
}

/** The tool names the brain hands the model, read off a fake client. */
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
    { message: "linkproof uncanned question", sessionId: PROOF_SESSION },
    { client },
  )) {
    void _;
  }
  return seen;
}

/** A fake model that calls one tool on its first turn, then stops. */
async function cardsFromToolUse(tool: string): Promise<UiBlock[]> {
  let turn = 0;
  const client: ModelClient = {
    messages: {
      stream() {
        const content =
          turn++ === 0
            ? [{ type: "tool_use", id: "tu_linkproof", name: tool, input: {} }]
            : [];
        return {
          async *[Symbol.asyncIterator]() {},
          async finalMessage() {
            return { content };
          },
        };
      },
    },
  };
  const cards: UiBlock[] = [];
  for await (const event of answer(
    { message: "linkproof uncanned question", sessionId: PROOF_SESSION },
    { client },
  )) {
    if (event.t === "card") cards.push(event.v);
  }
  return cards;
}

async function setLink(url: string) {
  await prisma.profile.update({ where: { id: 1 }, data: { bookingLink: url } });
}

async function main() {
  const original = await getProfile();

  try {
    // 1 — the Answers dropdown can name the tool.
    check("CARD_TOOLS includes show_booking_link", CARD_TOOLS.includes("show_booking_link" as (typeof CARD_TOOLS)[number]));

    // Canned rows the proof serves through the real brain.
    await saveCannedAnswer({
      question: CONTACT_Q,
      answer: "Here is the contact card.",
      enabled: true,
      cardTool: "show_contact_form",
      cardInput: null,
    });
    await saveCannedAnswer({
      question: LINK_Q,
      answer: "Here is the booking link.",
      enabled: true,
      cardTool: "show_booking_link",
      cardInput: null,
    });

    // ── Link set (with surrounding whitespace, to prove trimming) ──
    await setLink(`  ${PROOF_URL}  `);

    // 2 — offered exactly because the link is set; independent of show_booking.
    const offered = await toolNames();
    check("show_booking_link offered when the link is set", offered.includes("show_booking_link"));
    check(
      "native show_booking not offered just because the link is set",
      !offered.includes("show_booking"),
      `offered: ${offered.join(", ")}`,
    );

    // 4 — contact card carries the trimmed link.
    const contactCards = await collect(CONTACT_Q);
    const contact = contactCards.find((c) => c.type === "contact");
    check("contact card rendered from the canned answer", !!contact);
    check(
      "contact card carries the trimmed booking link",
      contact?.type === "contact" && contact.bookingLink === PROOF_URL,
      JSON.stringify(contact),
    );

    // 6 — the booking_link card carries url + name.
    const linkCards = await collect(LINK_Q);
    const link = linkCards.find((c) => c.type === "booking_link");
    check(
      "booking_link card carries the url and profile name",
      link?.type === "booking_link" && link.url === PROOF_URL && link.name === original.name,
      JSON.stringify(link),
    );

    // 8 — the tool-use path (not canned) hydrates the same card.
    const toolUseCards = await cardsFromToolUse("show_booking_link");
    const viaTool = toolUseCards.find((c) => c.type === "booking_link");
    check(
      "model tool-use of show_booking_link yields the card",
      viaTool?.type === "booking_link" && viaTool.url === PROOF_URL,
      JSON.stringify(toolUseCards),
    );

    // ── Link cleared ──
    await setLink("");

    // 3 — no longer offered.
    const offeredEmpty = await toolNames();
    check("show_booking_link withheld when the link is empty", !offeredEmpty.includes("show_booking_link"));

    // 5 — the contact form still renders, without the link.
    const contactEmpty = (await collect(CONTACT_Q)).find((c) => c.type === "contact");
    check(
      "contact card renders with bookingLink null when unset",
      contactEmpty?.type === "contact" && (contactEmpty.bookingLink ?? null) === null,
      JSON.stringify(contactEmpty),
    );

    // 7 — a canned answer naming the tool draws nothing rather than a dead card.
    const linkEmptyCards = await collect(LINK_Q);
    check(
      "canned show_booking_link draws no card once the link is cleared",
      !linkEmptyCards.some((c) => c.type === "booking_link"),
      JSON.stringify(linkEmptyCards),
    );
  } finally {
    await cleanup(original.bookingLink);
    await prisma.$disconnect();
  }

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log("\nAll proof assertions passed");
}

async function cleanup(originalLink: string) {
  for (const q of [CONTACT_Q, LINK_Q]) {
    const canned = await prisma.cannedAnswer.findUnique({
      where: { matchKey: normalizeQuestion(q) },
    });
    if (canned) await deleteCannedAnswer(canned.id);
  }
  // answer() logs every turn; drop the session this proof opened.
  await prisma.chatSession
    .delete({ where: { visitorKey: PROOF_SESSION } })
    .catch(() => {});
  await prisma.profile.update({ where: { id: 1 }, data: { bookingLink: originalLink } });
}

main().catch((e) => {
  console.error("Proof run errored:", e);
  process.exit(1);
});
