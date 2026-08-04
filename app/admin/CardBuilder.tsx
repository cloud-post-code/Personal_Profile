"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Cards } from "@/app/cards/Cards";
import { parseSampleBlock } from "@/lib/uiCards";
import type { BuildEvent, CardDraft } from "@/lib/cardBuilder";
import { saveBuiltCard } from "./actions";
import { panel, field, btn, btnGhost, SectionTitle, Label } from "./ui";

/**
 * The card builder page's flow: describe the card in plain text, Claude drafts
 * the whole thing (name, tool, purpose, sample), the draft renders as a live
 * preview, and a feedback box revises it until it's right. Nothing touches the
 * database until "Save card".
 *
 * Editing an existing card enters the same loop with the stored card as the
 * current draft, so "make the blurbs funnier" works on day-old cards too.
 */
export function CardBuilder({
  id,
  cardKey,
  initial,
}: {
  /** Set when editing an existing card; absent on /admin/cards/new. */
  id?: string;
  cardKey?: string;
  initial?: CardDraft;
}) {
  const router = useRouter();
  const [instructions, setInstructions] = useState("");
  const [draft, setDraft] = useState<CardDraft | null>(initial ?? null);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState<"draft" | "revise" | "save" | null>(null);
  const [error, setError] = useState("");
  const [thinking, setThinking] = useState("");
  const [steps, setSteps] = useState<string[]>([]);

  /**
   * Run one build over the streaming route, feeding reasoning and searches
   * into the page as they arrive. Resolves to the finished draft, or null if
   * the build failed (the error is already on screen by then).
   */
  async function build(payload: {
    instructions: string;
    current?: CardDraft;
    feedback?: string;
  }): Promise<CardDraft | null> {
    setError("");
    setThinking("");
    setSteps([]);
    let built: CardDraft | null = null;

    const res = await fetch("/api/admin/build-card", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok || !res.body) {
      setError(await res.text().catch(() => "") || "The builder couldn't be reached.");
      return null;
    }

    // One JSON object per line; a chunk can split a line, so hold the partial.
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        let e: BuildEvent;
        try {
          e = JSON.parse(line) as BuildEvent;
        } catch {
          continue;
        }
        if (e.t === "thinking") setThinking((t) => t + e.v);
        else if (e.t === "search") setSteps((s) => [...s, `Searching: “${e.query}”`]);
        else if (e.t === "searched") {
          setSteps((s) => [
            ...s,
            e.hits ? `Found ${e.hits} excerpt${e.hits === 1 ? "" : "s"}` : "Nothing matched",
          ]);
        } else if (e.t === "status") setSteps((s) => [...s, e.v]);
        else if (e.t === "draft") built = e.draft;
        else if (e.t === "error") setError(e.v);
      }
    }
    return built;
  }

  async function generate() {
    if (busy) return;
    setBusy("draft");
    const built = await build({ instructions });
    if (built) setDraft(built);
    setBusy(null);
  }

  async function revise() {
    if (busy || !draft) return;
    setBusy("revise");
    const built = await build({
      // Editing an existing card starts with no typed description; the draft
      // itself carries the context, so a stand-in instruction is enough.
      instructions: instructions.trim() || `Refine this existing card: ${draft.label}`,
      current: draft,
      feedback,
    });
    if (built) {
      setDraft(built);
      setFeedback("");
    }
    setBusy(null);
  }

  async function save() {
    if (busy || !draft) return;
    setBusy("save");
    setError("");
    const res = await saveBuiltCard({ id, key: cardKey, draft });
    if (res.ok) {
      // refresh() alongside push(): the dashboard may sit in the client router
      // cache from before the save, and the new card must be in the list the
      // admin lands on.
      router.push("/admin/dashboard?tab=a2ui");
      router.refresh();
      return;
    }
    setError(res.error ?? "Saving failed.");
    setBusy(null);
  }

  // Keep the newest reasoning in view as it streams, without yanking the page
  // around once the build is done and the admin may be reading back.
  const thinkingRef = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (busy && thinkingRef.current) {
      thinkingRef.current.scrollTop = thinkingRef.current.scrollHeight;
    }
  }, [thinking, busy]);

  const block = draft ? parseSampleBlock(draft.sampleBlock) : null;

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "24px 20px 80px" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 26 }}>{id ? "Refine a card" : "Build a card"}</h1>
          <p style={{ color: "var(--text)", fontStyle: "italic", fontSize: 14 }}>
            Describe it — the card designs itself, then takes your feedback.
          </p>
        </div>
        <Link href="/admin/dashboard?tab=a2ui" style={btnGhost as React.CSSProperties}>
          ← Back to cards
        </Link>
      </header>

      {!id && (
        <section data-fill="surface" style={panel}>
          <SectionTitle>What should this card be?</SectionTitle>
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={3}
            placeholder="e.g. A card that shows off my photography as a slideshow visitors can flip through"
            style={{ ...field, resize: "vertical" }}
          />
          <button
            onClick={generate}
            disabled={!!busy || !instructions.trim()}
            style={{ ...(btn as React.CSSProperties), opacity: busy || !instructions.trim() ? 0.55 : 1 }}
          >
            {busy === "draft" ? "Designing…" : draft ? "Start over from this description" : "Design the card"}
          </button>
        </section>
      )}

      {(thinking || steps.length > 0) && (
        <section data-fill="surface" style={panel}>
          <SectionTitle>{busy ? "Thinking…" : "How it built this"}</SectionTitle>
          {steps.length > 0 && (
            <ul style={{ margin: "0 0 10px", paddingLeft: 18 }}>
              {steps.map((s, i) => (
                <li key={i} style={{ fontSize: 12, color: "var(--accent-on-surface)", lineHeight: 1.6 }}>
                  {s}
                </li>
              ))}
            </ul>
          )}
          {thinking && (
            <pre ref={thinkingRef} style={thinkingBox}>
              {thinking}
            </pre>
          )}
        </section>
      )}

      {error && (
        <p style={{ color: "var(--danger-on-surface)", fontSize: 13, margin: "0 0 14px" }}>{error}</p>
      )}

      {draft && (
        <>
          <section data-fill="surface" style={panel}>
            <SectionTitle>{draft.label}</SectionTitle>
            <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap", marginBottom: 6 }}>
              <code style={toolName}>{draft.tool}</code>
              <span style={{ fontSize: 13, color: "var(--on-surface)" }}>{draft.description}</span>
            </div>
            <div style={{ marginBottom: 12 }}>
              <Label>When the chatbot will show it</Label>
              <p style={{ fontSize: 13, color: "var(--on-surface)", lineHeight: 1.55, margin: 0 }}>
                {draft.reason || "(no guidance written)"}
              </p>
              {draft.note && (
                <p style={{ fontSize: 12, fontStyle: "italic", color: "var(--accent-on-surface)", margin: "6px 0 0" }}>
                  {draft.note}
                </p>
              )}
            </div>
            <Label>
              {draft.tool === "show_card"
                ? "Preview — a custom card shows exactly this content to visitors"
                : "Preview (sample content — the live card uses your real data)"}
            </Label>
            {block ? (
              <Cards block={block} />
            ) : (
              <p style={{ fontSize: 13, fontStyle: "italic", color: "var(--danger-on-surface)" }}>
                This draft&apos;s sample can&apos;t be rendered — ask for a revision below.
              </p>
            )}
          </section>

          <section data-fill="surface" style={panel}>
            <SectionTitle>Feedback</SectionTitle>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={2}
              placeholder="e.g. Make it a filmstrip instead, and only show it when someone asks about travel"
              style={{ ...field, resize: "vertical" }}
            />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={revise}
                disabled={!!busy || !feedback.trim()}
                style={{ ...(btnGhost as React.CSSProperties), opacity: busy || !feedback.trim() ? 0.55 : 1 }}
              >
                {busy === "revise" ? "Revising…" : "Revise the card"}
              </button>
              <button
                onClick={save}
                disabled={!!busy}
                style={{ ...(btn as React.CSSProperties), opacity: busy ? 0.55 : 1 }}
              >
                {busy === "save" ? "Saving…" : id ? "Save changes" : "Save card"}
              </button>
            </div>
          </section>
        </>
      )}
    </main>
  );
}

const thinkingBox: React.CSSProperties = {
  margin: 0,
  maxHeight: 240,
  overflowY: "auto",
  padding: 12,
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border)",
  background: "var(--bg-soft)",
  color: "var(--on-bg-soft)",
  fontSize: 12,
  lineHeight: 1.6,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  opacity: 0.85,
};

const toolName: React.CSSProperties = {
  fontSize: 12,
  padding: "3px 8px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border)",
  background: "var(--bg-soft)",
  color: "var(--on-bg-soft)",
};
