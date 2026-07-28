"use client";

import { useState } from "react";
import { btn, btnGhost } from "./ui";

/**
 * The "borrow another model's memory" step on the Persona tab.
 *
 * Writing a persona paragraph from a blank page is the hardest part of setting
 * this site up, and the assistants Blake already talks to daily have the raw
 * material. So: copy the prompt, run it wherever that history lives, paste the
 * answer into the field below.
 *
 * The prompt text is passed in rather than fetched, so Copy works with no
 * round trip and View has nothing to load.
 */
export function PersonaPrompt({ prompt }: { prompt: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
    } catch {
      // Clipboard API needs a secure context and permission; when it's denied
      // the prompt still has to be gettable, so fall the user through to the
      // text itself rather than failing silently.
      setOpen(true);
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        padding: 14,
        marginBottom: 18,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
        Don&apos;t want to write it yourself?
      </div>
      <p
        style={{
          color: "var(--on-surface)",
          fontStyle: "italic",
          fontSize: 13,
          margin: "0 0 12px",
          lineHeight: 1.5,
        }}
      >
        Copy the prompt below, paste it into the assistant you already use most —
        ChatGPT, Claude or Gemini — and let it write your persona from everything
        it has picked up about you. Then paste its answer straight into the
        Persona field below and save. Use whichever one knows you best; the
        answer is only as good as the history it has.
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={copy} style={btn}>
          {copied ? "Copied ✓" : "Copy prompt"}
        </button>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={btnGhost as React.CSSProperties}
        >
          {open ? "Hide prompt" : "View prompt"}
        </button>
      </div>

      {open && (
        <pre
          style={{
            marginTop: 12,
            marginBottom: 0,
            maxHeight: 340,
            overflow: "auto",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            padding: 12,
            fontSize: 12,
            lineHeight: 1.5,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {prompt}
        </pre>
      )}
    </div>
  );
}
