"use client";

import React, { useState } from "react";
import type { SourceDraft, BuilderTurn } from "@/lib/ingestionBuilder";
import { ingestFormsFor } from "@/lib/ingestionSources";
import { saveBuiltSourceAction } from "./actions";
import { ClassificationSelect } from "./ClassificationSelect";
import { panel, field, btn, btnGhost, SectionTitle, Label } from "./ui";

/**
 * The split builder for new ingestion sources: vibe-code the config in the
 * chat on the left, try it on the sample page on the right. The sample pane
 * is TEST ONLY — its forms are handled locally (state + object URLs), never
 * the real ingest actions, so playing with it can't write to the database or
 * the upload dir. Only "Save ingestion source" persists, via
 * saveBuiltSourceAction.
 */

type TestItem = { kind: "text" | "image"; title: string; text: string; imageUrl: string | null };

export function SourceBuilder(_props: Record<string, never>) {
  const [turns, setTurns] = useState<BuilderTurn[]>([]);
  const [draft, setDraft] = useState<SourceDraft | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [classification, setClassification] = useState("public");
  const [testItems, setTestItems] = useState<TestItem[]>([]);
  const [testTitle, setTestTitle] = useState("");
  const [testText, setTestText] = useState("");
  const [testCaption, setTestCaption] = useState("");
  const [testFile, setTestFile] = useState<File | null>(null);
  const [testUrl, setTestUrl] = useState("");
  const [testDoc, setTestDoc] = useState<File | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const content = input.trim();
    if (!content || busy) return;
    const nextTurns: BuilderTurn[] = [...turns, { role: "user", content }];
    setTurns(nextTurns);
    setInput("");
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/build-source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ turns: nextTurns, current: draft }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { reply: string; draft: SourceDraft | null };
      setTurns([...nextTurns, { role: "assistant", content: data.reply }]);
      if (data.draft) {
        setDraft(data.draft);
        setTestItems([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "The builder call failed.");
      setTurns(turns);
    } finally {
      setBusy(false);
    }
  }

  function testIngestText(e: React.FormEvent) {
    e.preventDefault();
    if (!testText.trim()) return;
    setTestItems((items) => [
      { kind: "text", title: testTitle.trim() || "Untitled", text: testText.trim(), imageUrl: null },
      ...items,
    ]);
    setTestTitle("");
    setTestText("");
  }

  function testIngestImage(e: React.FormEvent) {
    e.preventDefault();
    if (!testFile) return;
    setTestItems((items) => [
      {
        kind: "image",
        title: testCaption.trim() || testFile.name,
        text: testCaption.trim(),
        imageUrl: URL.createObjectURL(testFile),
      },
      ...items,
    ]);
    setTestCaption("");
    setTestFile(null);
  }

  function testIngestUrl(e: React.FormEvent) {
    e.preventDefault();
    if (!testUrl.trim()) return;
    setTestItems((items) => [
      {
        kind: "text",
        title: testUrl.trim(),
        text: "(test) This page would be scanned and its text ingested.",
        imageUrl: null,
      },
      ...items,
    ]);
    setTestUrl("");
  }

  function testIngestDoc(e: React.FormEvent) {
    e.preventDefault();
    if (!testDoc) return;
    setTestItems((items) => [
      {
        kind: "text",
        title: testDoc.name,
        text: "(test) This document's text would be extracted and ingested.",
        imageUrl: null,
      },
      ...items,
    ]);
    setTestDoc(null);
  }

  async function save() {
    if (!draft || saving) return;
    setSaving(true);
    setError("");
    const result = await saveBuiltSourceAction({ ...draft, classification });
    if (result.ok) {
      // Full navigation on purpose: the dashboard re-renders the tab strip
      // from the DB, and the builder's local state is done with.
      window.location.href = "/admin/dashboard?tab=content";
    } else {
      setError(result.error ?? "Save failed.");
      setSaving(false);
    }
  }

  // Same mapping the real generic panel uses, so the sample page matches
  // what the saved source will actually show.
  const forms = draft
    ? ingestFormsFor(draft.uploadMethod, draft.storageKinds)
    : { url: false, docFile: false, textarea: false, image: false };
  const noForms = draft && !forms.url && !forms.docFile && !forms.textarea && !forms.image;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
        gap: 16,
        alignItems: "start",
      }}
    >
      {/* ── Left: the vibe-coding chat ── */}
      <section data-fill="surface" style={panel}>
        <SectionTitle>Builder chat</SectionTitle>
        <p style={{ fontSize: 13, fontStyle: "italic", marginBottom: 12 }}>
          Describe the ingestion source you want; refine it turn by turn. The
          sample page on the right updates with every draft.
        </p>
        <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
          {turns.map((t, i) => (
            <div
              key={i}
              style={{
                border: "1px solid var(--line, #ccc)",
                borderRadius: 8,
                padding: "8px 10px",
                fontSize: 13,
                whiteSpace: "pre-wrap",
                justifySelf: t.role === "user" ? "end" : "start",
                maxWidth: "90%",
              }}
            >
              <strong style={{ fontSize: 11, opacity: 0.7 }}>
                {t.role === "user" ? "You" : "Builder"}
              </strong>
              <div>{t.content}</div>
            </div>
          ))}
          {busy ? <p style={{ fontSize: 13, fontStyle: "italic" }}>Thinking…</p> : null}
        </div>
        {error ? (
          <p role="alert" style={{ color: "var(--danger, #b00020)", fontSize: 13, marginBottom: 8 }}>
            {error}
          </p>
        ) : null}
        <form onSubmit={send} style={{ display: "grid", gap: 8 }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={3}
            placeholder='e.g. "A tab for press mentions — text plus a screenshot of each article"'
            style={field as React.CSSProperties}
          />
          <button type="submit" disabled={busy} style={btn as React.CSSProperties}>
            {busy ? "Thinking…" : "Send"}
          </button>
        </form>
      </section>

      {/* ── Right: the sample page, test mode only ── */}
      <section data-fill="surface" style={panel}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <SectionTitle>Test page</SectionTitle>
          <span
            style={{
              fontSize: 11,
              border: "1px solid var(--line, #ccc)",
              borderRadius: 999,
              padding: "2px 10px",
            }}
          >
            Test mode — nothing is saved
          </span>
        </div>
        {!draft ? (
          <p style={{ fontSize: 13, fontStyle: "italic", marginTop: 10 }}>
            Describe the ingestion source in the chat and its sample page will
            appear here to try out.
          </p>
        ) : (
          <div style={{ marginTop: 10 }}>
            <h3 style={{ fontSize: 18, marginBottom: 4 }}>{draft.label}</h3>
            {draft.description ? (
              <p style={{ fontSize: 13, fontStyle: "italic", marginBottom: 8 }}>{draft.description}</p>
            ) : null}
            {draft.systemPrompt ? (
              <p
                style={{
                  fontSize: 12,
                  opacity: 0.8,
                  border: "1px solid var(--line, #ccc)",
                  borderRadius: 6,
                  padding: "8px 10px",
                  marginBottom: 12,
                  whiteSpace: "pre-wrap",
                }}
              >
                {draft.systemPrompt}
              </p>
            ) : null}

            {noForms ? (
              <p style={{ fontSize: 13, fontStyle: "italic", marginBottom: 14 }}>
                This draft&apos;s upload method ({draft.uploadMethod}) and storage (
                {draft.storageKinds}) contradict — ask the builder to line them up.
              </p>
            ) : null}

            {forms.url ? (
              <form onSubmit={testIngestUrl} style={{ display: "grid", gap: 8, marginBottom: 14 }}>
                <Label>Scan a web page (test)</Label>
                <input
                  value={testUrl}
                  onChange={(e) => setTestUrl(e.target.value)}
                  type="url"
                  placeholder="https://…"
                  style={field as React.CSSProperties}
                />
                <button type="submit" style={btnGhost as React.CSSProperties}>
                  Scan URL (test)
                </button>
              </form>
            ) : null}

            {forms.docFile ? (
              <form onSubmit={testIngestDoc} style={{ display: "grid", gap: 8, marginBottom: 14 }}>
                <Label>Upload a document (test)</Label>
                <input
                  type="file"
                  accept=".pdf,.docx,.txt,.md"
                  onChange={(e) => setTestDoc(e.target.files?.[0] ?? null)}
                  style={field as React.CSSProperties}
                />
                <button type="submit" style={btnGhost as React.CSSProperties}>
                  Upload document (test)
                </button>
              </form>
            ) : null}

            {forms.textarea ? (
              <form onSubmit={testIngestText} style={{ display: "grid", gap: 8, marginBottom: 14 }}>
                <Label>Add text (test)</Label>
                <input
                  value={testTitle}
                  onChange={(e) => setTestTitle(e.target.value)}
                  placeholder="Title (optional)"
                  style={field as React.CSSProperties}
                />
                <textarea
                  value={testText}
                  onChange={(e) => setTestText(e.target.value)}
                  rows={3}
                  placeholder="Paste some sample text…"
                  style={field as React.CSSProperties}
                />
                <button type="submit" style={btnGhost as React.CSSProperties}>
                  Ingest text (test)
                </button>
              </form>
            ) : null}

            {forms.image ? (
              <form onSubmit={testIngestImage} style={{ display: "grid", gap: 8, marginBottom: 14 }}>
                <Label>Add image (test)</Label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setTestFile(e.target.files?.[0] ?? null)}
                  style={field as React.CSSProperties}
                />
                <input
                  value={testCaption}
                  onChange={(e) => setTestCaption(e.target.value)}
                  placeholder="Caption (optional)"
                  style={field as React.CSSProperties}
                />
                <button type="submit" style={btnGhost as React.CSSProperties}>
                  Ingest image (test)
                </button>
              </form>
            ) : null}

            {testItems.length ? (
              <ul style={{ listStyle: "none", display: "grid", gap: 10, padding: 0, marginBottom: 14 }}>
                {testItems.map((it, i) => (
                  <li key={i} style={{ border: "1px dashed var(--line, #ccc)", borderRadius: 8, padding: 10 }}>
                    {it.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={it.imageUrl}
                        alt={it.title}
                        style={{ maxWidth: 160, maxHeight: 110, borderRadius: 6, display: "block", marginBottom: 6 }}
                      />
                    ) : null}
                    <strong style={{ fontSize: 14 }}>{it.title}</strong>
                    {it.text ? (
                      <p style={{ fontSize: 13, whiteSpace: "pre-wrap", marginTop: 4 }}>{it.text}</p>
                    ) : null}
                    <span style={{ fontSize: 11, opacity: 0.6 }}>test item — not stored</span>
                  </li>
                ))}
              </ul>
            ) : null}

            <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
              <ClassificationSelect value={classification} onChange={setClassification} />
              <button onClick={save} disabled={saving} style={btn as React.CSSProperties}>
                {saving ? "Saving…" : "Save ingestion source"}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
