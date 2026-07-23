"use client";

import { useState } from "react";
import { field, btnGhost, btnDanger } from "./ui";

type Experience = { role: string; company: string; dates: string; description: string };

/**
 * Add experience entries one at a time. Each entry is its own box that animates
 * in (slide + fade), the way a new message appears in the chat thread. Entries
 * are serialized to a hidden `experience` JSON field the saveProfileBasics
 * action stores on Profile.experience.
 */
export function ExperienceEditor({ initial }: { initial: Experience[] }) {
  const [rows, setRows] = useState<Experience[]>(initial);
  // Track which indexes are freshly added so only those animate in.
  const [entered, setEntered] = useState<Set<number>>(new Set());

  const update = (i: number, key: keyof Experience, v: string) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, [key]: v } : row)));

  const remove = (i: number) => setRows((r) => r.filter((_, idx) => idx !== i));

  const add = () => {
    setRows((r) => {
      const next = [...r, { role: "", company: "", dates: "", description: "" }];
      // Mark the new last index as "just entered" so it animates.
      setEntered((s) => new Set(s).add(next.length - 1));
      return next;
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* One hidden field carries the whole list as JSON. */}
      <input type="hidden" name="experience" value={JSON.stringify(rows)} />

      {rows.length === 0 && (
        <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
          No experience added yet. Add your roles below — each becomes a box here.
        </p>
      )}

      {rows.map((row, i) => (
        <div
          key={i}
          className="exp-card"
          style={{
            border: "1px solid var(--border)",
            background: "var(--surface)",
            borderRadius: "var(--radius-md)",
            padding: 14,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            animation: entered.has(i) ? "expIn 0.28s ease" : undefined,
          }}
        >
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              value={row.role}
              onChange={(e) => update(i, "role", e.target.value)}
              placeholder="Role (e.g. Product Engineer)"
              style={{ ...field, marginBottom: 0, flex: 1 }}
            />
            <button
              type="button"
              onClick={() => remove(i)}
              style={{ ...btnDanger, padding: "8px 12px" } as React.CSSProperties}
              aria-label="Remove experience"
            >
              ✕
            </button>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              value={row.company}
              onChange={(e) => update(i, "company", e.target.value)}
              placeholder="Company / org"
              style={{ ...field, marginBottom: 0, flex: "1 1 200px" }}
            />
            <input
              value={row.dates}
              onChange={(e) => update(i, "dates", e.target.value)}
              placeholder="Dates (e.g. 2021–2024)"
              style={{ ...field, marginBottom: 0, flex: "1 1 160px" }}
            />
          </div>
          <textarea
            value={row.description}
            onChange={(e) => update(i, "description", e.target.value)}
            placeholder="What you did there…"
            rows={2}
            style={{ ...field, marginBottom: 0, resize: "vertical" }}
          />
        </div>
      ))}

      <div>
        <button type="button" onClick={add} style={btnGhost as React.CSSProperties}>
          + Add experience
        </button>
      </div>

      <style>{`
        @keyframes expIn {
          from { opacity: 0; transform: translateY(10px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
