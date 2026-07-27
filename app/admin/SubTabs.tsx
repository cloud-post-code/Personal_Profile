"use client";

import { useState } from "react";

/**
 * Horizontal tab strip across the top of a dashboard section. Same contract
 * as Tabs, but rendered as a bar above the panel instead of a side menu —
 * used for the Content section's Projects / Knowledge / Photos split and the
 * Graph section's Graph / Test / Entities / Relationships / Overviews split.
 * Labels may be nodes so a tab can carry a count badge.
 */
export function SubTabs({
  tabs,
  initial,
  ariaLabel = "Content sections",
}: {
  tabs: { key: string; label: React.ReactNode; content: React.ReactNode }[];
  initial?: string;
  ariaLabel?: string;
}) {
  const [active, setActive] = useState(
    tabs.some((t) => t.key === initial) ? initial : tabs[0]?.key,
  );
  const current = tabs.find((t) => t.key === active) ?? tabs[0];

  return (
    <div>
      <div className="admin-subtabs" role="tablist" aria-label={ariaLabel}>
        {tabs.map((t) => {
          const on = t.key === current?.key;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={on}
              className="admin-subtab"
              onClick={() => setActive(t.key)}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div>{current?.content}</div>
    </div>
  );
}
