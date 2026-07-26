"use client";

import { useState } from "react";
import { addSource } from "./actions";
import { field, btn } from "./ui";

/** The unified extraction ingest: switch between link / PDF / text. */
export function Extractor() {
  const [mode, setMode] = useState<"link" | "pdf" | "text">("link");

  const tab = (m: typeof mode, label: string) => (
    <button
      type="button"
      onClick={() => setMode(m)}
      style={{
        padding: "7px 14px",
        borderRadius: "var(--radius-sm)",
        border: "1px solid var(--border)",
        background: mode === m ? "var(--primary)" : "transparent",
        color: mode === m ? "var(--on-primary)" : "var(--on-surface)",
        fontStyle: mode === m ? "normal" : "italic",
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      {label}
    </button>
  );

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {tab("link", "🔗 Link")}
        {tab("pdf", "📄 PDF / Doc")}
        {tab("text", "✍️ Text / paste")}
      </div>

      {mode === "link" && (
        <form action={addSource} style={{ display: "flex", gap: 8 }}>
          <input type="hidden" name="type" value="link" />
          <input
            name="url"
            placeholder="https://…  (LinkedIn post, article, GitHub, anything)"
            style={{ ...field, marginBottom: 0, flex: 1 }}
          />
          <button style={btn}>Extract</button>
        </form>
      )}

      {mode === "pdf" && (
        <form action={addSource} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input type="hidden" name="type" value="doc" />
          <input
            type="file"
            name="file"
            accept="application/pdf,.pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            required
            style={{ ...field, marginBottom: 0, flex: 1, minWidth: 240 }}
          />
          <button style={btn}>Extract</button>
        </form>
      )}

      {mode === "text" && (
        <form action={addSource}>
          <input type="hidden" name="type" value="text" />
          <input name="title" placeholder="Title (optional)" style={field} />
          <textarea
            name="text"
            placeholder="Paste text or markdown — notes, an essay, an opinion, a bit of your story…"
            rows={5}
            required
            style={{ ...field, resize: "vertical" }}
          />
          <button style={btn}>Extract text</button>
        </form>
      )}

      <p style={{ color: "var(--on-surface)", fontStyle: "italic", fontSize: 12, marginTop: 12 }}>
        Whatever you add is fetched/parsed, then Claude writes a summary + tags. That becomes
        knowledge the chatbot can cite. LinkedIn often blocks bots — if a scan is thin, edit the
        summary below.
      </p>
    </div>
  );
}
