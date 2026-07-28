"use client";

import { useEffect, useRef, useState } from "react";
import { useOwnPending } from "./PendingButton";
import { btn } from "./ui";

/**
 * Submit button for the admin server-action forms. While the action is in
 * flight it glows and shows "Saving…"; the moment it completes it flashes a
 * lit "Saved ✓" state for a couple of seconds, then settles back to its label.
 *
 * Must be rendered INSIDE a <form action={...}> — it reads that form's submit
 * status via useOwnPending(), so it only claims the submits it started.
 */
export function SaveButton({ children }: { children: React.ReactNode }) {
  const { busy, pending, press } = useOwnPending();
  const [saved, setSaved] = useState(false);
  const wasPending = useRef(false);

  useEffect(() => {
    // Transition from pending -> not pending means the action just finished.
    if (wasPending.current && !busy) {
      setSaved(true);
      const t = setTimeout(() => setSaved(false), 2000);
      return () => clearTimeout(t);
    }
    wasPending.current = busy;
  }, [busy]);

  const lit = busy || saved;

  return (
    <button
      type="submit"
      onClick={press}
      aria-busy={busy || undefined}
      disabled={pending}
      style={{
        ...btn,
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        cursor: pending ? "default" : "pointer",
        transition: "box-shadow 0.25s ease, filter 0.25s ease",
        boxShadow: lit ? "var(--glow-primary)" : "none",
        filter: lit ? "brightness(1.12)" : "none",
      }}
    >
      {saved ? (
        <>
          <span aria-hidden style={{ fontSize: 15, lineHeight: 1 }}>✓</span>
          Saved
        </>
      ) : busy ? (
        "Saving…"
      ) : (
        children
      )}
    </button>
  );
}
