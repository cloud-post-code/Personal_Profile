"use client";

import React, { useState } from "react";
import { btnGhost } from "./ui";

/**
 * Client-side pagination over pre-rendered rows. The rows arrive already
 * server-rendered (server-action forms inside them keep working across the
 * client boundary), so this is purely presentational: slice the current
 * page, offer Prev/Next. One page or fewer renders the rows bare — short
 * lists look exactly as they did before pagination existed. The server
 * render shows page 1, so proofs and no-JS first paint are meaningful.
 */
export function Paginated({
  children,
  pageSize = 10,
}: {
  children: React.ReactNode[];
  pageSize?: number;
}) {
  const [page, setPage] = useState(0);
  const rows = React.Children.toArray(children);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pages - 1);

  if (pages <= 1) {
    return (
      <ul style={{ listStyle: "none", display: "grid", gap: 10, padding: 0 }}>{rows}</ul>
    );
  }

  return (
    <div>
      <ul style={{ listStyle: "none", display: "grid", gap: 10, padding: 0 }}>
        {rows.slice(current * pageSize, (current + 1) * pageSize)}
      </ul>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          marginTop: 10,
          fontSize: 13,
        }}
      >
        <button
          type="button"
          disabled={current === 0}
          onClick={() => setPage(current - 1)}
          style={{ ...(btnGhost as React.CSSProperties), opacity: current === 0 ? 0.5 : 1 }}
        >
          Prev
        </button>
        <span style={{ color: "var(--on-surface)" }}>
          Page {current + 1} of {pages} · {rows.length} items
        </span>
        <button
          type="button"
          disabled={current >= pages - 1}
          onClick={() => setPage(current + 1)}
          style={{
            ...(btnGhost as React.CSSProperties),
            opacity: current >= pages - 1 ? 0.5 : 1,
          }}
        >
          Next
        </button>
      </div>
    </div>
  );
}
