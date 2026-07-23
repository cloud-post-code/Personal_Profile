"use client";

import { useState } from "react";

/**
 * Client tab switcher for the admin dashboard. Each child panel is passed with
 * a key + label; clicking a tab swaps which panel is shown below. Server-action
 * forms live inside the panels (passed as children from the server component),
 * so all the server logic is untouched.
 */
export function Tabs({
  tabs,
}: {
  tabs: { key: string; label: string; badge?: number; content: React.ReactNode }[];
}) {
  const [active, setActive] = useState(tabs[0]?.key);
  const current = tabs.find((t) => t.key === active) ?? tabs[0];

  return (
    <div>
      <div style={bar}>
        {tabs.map((t) => {
          const on = t.key === active;
          return (
            <button
              key={t.key}
              onClick={() => setActive(t.key)}
              style={{
                ...tab,
                ...(on ? tabOn : {}),
              }}
            >
              {t.label}
              {t.badge ? <span style={badgeStyle}>{t.badge}</span> : null}
            </button>
          );
        })}
      </div>
      <div>{current?.content}</div>
    </div>
  );
}

const bar: React.CSSProperties = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
  marginBottom: 20,
  paddingBottom: 12,
  borderBottom: "1px solid var(--border)",
  position: "sticky",
  top: 0,
  background: "var(--bg)",
  zIndex: 5,
  paddingTop: 4,
};
const tab: React.CSSProperties = {
  padding: "9px 16px",
  borderRadius: "var(--radius-pill)",
  border: "1px solid var(--border)",
  background: "transparent",
  color: "var(--text-muted)",
  fontSize: 14,
  fontWeight: 600,
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
};
const tabOn: React.CSSProperties = {
  background: "linear-gradient(90deg, var(--primary), var(--primary-soft))",
  color: "white",
  border: "1px solid transparent",
  boxShadow: "var(--glow-primary)",
};
const badgeStyle: React.CSSProperties = {
  background: "var(--accent)",
  color: "#0B1020",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 700,
  padding: "0 6px",
  minWidth: 18,
  textAlign: "center",
};
