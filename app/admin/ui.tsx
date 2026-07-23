import type React from "react";

/** Shared admin styling primitives so sections look consistent. */

export const panel: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  padding: 20,
  marginBottom: 20,
};

export const field: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  background: "var(--bg-soft)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  marginBottom: 10,
  outline: "none",
  fontSize: 14,
};

export const btn: React.CSSProperties = {
  padding: "9px 16px",
  background: "linear-gradient(90deg, var(--primary), var(--primary-soft))",
  color: "white",
  border: "none",
  borderRadius: "var(--radius-sm)",
  fontWeight: 600,
  fontSize: 14,
};

export const btnGhost: React.CSSProperties = {
  padding: "7px 12px",
  background: "transparent",
  color: "var(--text-muted)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  fontSize: 13,
};

export const btnDanger: React.CSSProperties = {
  ...btnGhost,
  color: "var(--danger)",
  borderColor: "rgba(255,107,107,0.35)",
};

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontSize: 18, marginBottom: 14, fontFamily: "var(--font-heading)" }}>
      {children}
    </h2>
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>
      {children}
    </label>
  );
}
