"use client";

import { useState } from "react";
import { field, btnGhost, btnDanger } from "./ui";

type Social = { label: string; url: string };

/**
 * Add social links one at a time. Starts with the saved rows (or one empty
 * row) and an "Add" button appends more. Each row emits parallel
 * social_label / social_url fields the saveDetails action zips together.
 */
export function SocialsEditor({ initial }: { initial: Social[] }) {
  const [rows, setRows] = useState<Social[]>(initial.length ? initial : [{ label: "", url: "" }]);

  const update = (i: number, key: keyof Social, v: string) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, [key]: v } : row)));

  const remove = (i: number) => setRows((r) => (r.length === 1 ? [{ label: "", url: "" }] : r.filter((_, idx) => idx !== i)));

  const add = () => setRows((r) => [...r, { label: "", url: "" }]);

  return (
    <div>
      {rows.map((row, i) => (
        <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            name="social_label"
            value={row.label}
            onChange={(e) => update(i, "label", e.target.value)}
            placeholder="Platform (e.g. LinkedIn, Twitter)"
            style={{ ...field, flex: "0 0 220px" }}
          />
          <input
            name="social_url"
            value={row.url}
            onChange={(e) => update(i, "url", e.target.value)}
            placeholder="https://…"
            style={{ ...field, flex: 1 }}
          />
          <button
            type="button"
            onClick={() => remove(i)}
            style={{ ...btnDanger, marginBottom: 10, padding: "8px 12px" } as React.CSSProperties}
            aria-label="Remove"
          >
            ✕
          </button>
        </div>
      ))}
      <button type="button" onClick={add} style={{ ...btnGhost, marginBottom: 12 } as React.CSSProperties}>
        + Add social link
      </button>
    </div>
  );
}
